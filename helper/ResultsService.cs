using System.Globalization;
using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Collections.Concurrent;

namespace Eurocup3;

public sealed class ResultsService
{
    static readonly HttpClient DefaultHttp = new(new HttpClientHandler { AllowAutoRedirect = false, AutomaticDecompression = DecompressionMethods.All })
    {
        Timeout = TimeSpan.FromSeconds(20),
        DefaultRequestHeaders = { UserAgent = { ProductInfoHeaderValue.Parse("Eurocup3-Helper/1.2.0") } },
    };
    readonly SemaphoreSlim gate = new(1, 1);
    readonly SemaphoreSlim teamRosterGate = new(6, 6);
    readonly HttpClient http;
    readonly ConcurrentDictionary<string, (DateTimeOffset CachedAt, string[] Drivers)> teamRosterCache = new(StringComparer.OrdinalIgnoreCase);
    readonly ConcurrentDictionary<string, ChampionshipResults> cache = new(StringComparer.Ordinal);

    public ResultsService() : this(DefaultHttp) { }
    public ResultsService(HttpClient http) => this.http = http;

    public async Task<ChampionshipResults> Get(Championship championship, bool force = false, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(championship.ResultsUrl))
            throw new AppFault("RESULTS_NOT_CONFIGURED", "No results source is configured for this championship yet.");
        ValidateSourceUrl(championship.ResultsUrl);
        var source = championship.ResultsUrl;
        if (!force && cache.TryGetValue(source, out var current)
            && DateTimeOffset.UtcNow - current.UpdatedAt < TimeSpan.FromMinutes(5))
            return current;

        await gate.WaitAsync(ct);
        try
        {
            if (!force && cache.TryGetValue(source, out var latest)
                && DateTimeOffset.UtcNow - latest.UpdatedAt < TimeSpan.FromMinutes(5))
                return latest;
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
            timeout.CancelAfter(TimeSpan.FromSeconds(30));
            var requestToken = timeout.Token;
            var html = await Fetch(source, 8 * 1024 * 1024, requestToken);

            var championshipId = Regex.Match(html, @"data-champ=""(?<id>[0-9a-f-]{36})""", RegexOptions.IgnoreCase)
                .Groups["id"].Value;
            var standings = RaceDetailsService.ParseStandings(html);
            var eventIds = Regex.Matches(html, @"data-event=""(?<id>[0-9a-f-]{36})""", RegexOptions.IgnoreCase)
                .Select(m => m.Groups["id"].Value)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .Take(60)
                .ToArray();
            // A new official competition has empty standings and no podium IDs yet.
            if (!Guid.TryParse(championshipId, out _) && (eventIds.Length > 0
                || !Regex.IsMatch(html, @"\bid=[""']tab-pane-results[""']", RegexOptions.IgnoreCase)
                || !Regex.IsMatch(html, @"\bid=[""']standings-pane-pilots[""']", RegexOptions.IgnoreCase)))
                throw new AppFault("RESULTS_UNAVAILABLE", "The configured page does not expose a supported championship.");
            var origin = new Uri(championship.ResultsUrl).GetLeftPart(UriPartial.Authority);
            var standingsTask = AddTeamsWithTimeout();
            var raceTasks = eventIds.Select(LoadRace).ToArray();
            await Task.WhenAll(raceTasks.Cast<Task>().Append(standingsTask));
            standings = await standingsTask;
            var races = raceTasks
                .Select(task => task.Result)
                .Where(race => race is not null)
                .Cast<ChampionshipRaceResult>()
                .ToArray();

            ct.ThrowIfCancellationRequested();
            var loaded = new ChampionshipResults(source, DateTimeOffset.UtcNow, standings, races);
            cache[source] = loaded;
            while (cache.Count > 40) cache.TryRemove(cache.OrderBy(pair => pair.Value.UpdatedAt).First().Key, out _);
            return loaded;

            async Task<ChampionshipStanding[]> AddTeamsWithTimeout()
            {
                using var teamTimeout = CancellationTokenSource.CreateLinkedTokenSource(requestToken);
                teamTimeout.CancelAfter(TimeSpan.FromSeconds(12));
                try
                {
                    return await AddCompetitionTeams(
                        html,
                        new Uri(championship.ResultsUrl),
                        standings,
                        teamTimeout.Token
                    );
                }
                catch (OperationCanceledException) when (!ct.IsCancellationRequested)
                {
                    return standings;
                }
            }

            async Task<ChampionshipRaceResult?> LoadRace(string eventId, int index)
            {
                requestToken.ThrowIfCancellationRequested();
                var meta = ParseEventMeta(html, eventId, index + 1);
                var apiUrl = $"{origin}/api/championships/{championshipId}/events/{eventId}/podium";
                try
                {
                    var jsonText = await Fetch(apiUrl, 2 * 1024 * 1024, requestToken);
                    using var json = JsonDocument.Parse(jsonText);
                    var sessions = ParseSessions(json.RootElement);
                    if (sessions.Length == 0)
                        return null;
                    var path = new Uri(championship.ResultsUrl).AbsolutePath.TrimEnd('/');
                    return new(eventId, meta.Round, meta.Name, meta.Venue,
                        origin + path + "/events/" + eventId + "/results", sessions);
                }
                catch (Exception ex) when (!ct.IsCancellationRequested && (ex is HttpRequestException or JsonException))
                {
                    return null;
                }
            }
        }
        catch (AppFault)
        {
            throw;
        }
        catch (Exception ex) when (!ct.IsCancellationRequested && (ex is HttpRequestException or OperationCanceledException or JsonException or InvalidOperationException or IOException))
        {
            throw new AppFault("RESULTS_UNAVAILABLE", "Could not load championship results from MakroBeasts. " + ex.Message);
        }
        finally
        {
            gate.Release();
        }
    }

    public static void ValidateSourceUrl(string value)
    {
        if (!Uri.TryCreate(value, UriKind.Absolute, out var uri)
            || uri.Scheme != Uri.UriSchemeHttps
            || uri.UserInfo.Length != 0
            || !uri.IsDefaultPort
            || uri.Host is not ("makrobeasts.com" or "www.makrobeasts.com")
            || !Regex.IsMatch(uri.AbsolutePath, @"^/championships/[a-z0-9][a-z0-9-]{0,150}$", RegexOptions.CultureInvariant)
            || uri.Query.Length != 0 || uri.Fragment is not ("" or "#results"))
            throw new AppFault("INVALID_RESULTS_SOURCE", "Results source must be a MakroBeasts championship page over HTTPS.");
    }

    public static ChampionshipStanding[] ParseStandings(string html)
    {
        var marker = html.IndexOf("id=\"standings-pane-pilots\"", StringComparison.OrdinalIgnoreCase);
        if (marker < 0)
            return [];
        var table = Regex.Match(html[marker..], @"<table\b[\s\S]*?</table>", RegexOptions.IgnoreCase);
        if (!table.Success)
            return [];
        var rows = new List<ChampionshipStanding>();
        foreach (Match row in Regex.Matches(table.Value, @"<tr\b[^>]*>(?<body>[\s\S]*?)</tr>", RegexOptions.IgnoreCase))
        {
            var cells = Regex.Matches(row.Groups["body"].Value, @"<td\b[^>]*>(?<body>[\s\S]*?)</td>", RegexOptions.IgnoreCase)
                .Select(m => Clean(m.Groups["body"].Value)).ToArray();
            if (cells.Length < 4 || !int.TryParse(cells[0], NumberStyles.Integer, CultureInfo.InvariantCulture, out var position))
                continue;
            rows.Add(new(position, cells[1], cells[2], cells[^1]));
        }
        return rows.ToArray();
    }

    public static (string Name, string Path)[] ParseCompetitionTeams(string html)
    {
        var marker = Regex.Match(html, "id\\s*=\\s*['\\\"]standings-pane-teams['\\\"]", RegexOptions.IgnoreCase);
        if (!marker.Success)
            return [];
        var table = Regex.Match(html[marker.Index..], @"<table\b[\s\S]*?</table>", RegexOptions.IgnoreCase);
        if (!table.Success)
            return [];

        var teams = new List<(string Name, string Path)>();
        foreach (Match row in Regex.Matches(table.Value, @"<tr\b[^>]*>(?<body>[\s\S]*?)</tr>", RegexOptions.IgnoreCase))
        {
            var cells = Regex.Matches(row.Groups["body"].Value, @"<td\b[^>]*>(?<body>[\s\S]*?)</td>", RegexOptions.IgnoreCase);
            if (cells.Count < 2)
                continue;
            var link = Regex.Match(cells[1].Groups["body"].Value,
                "<a\\b[^>]*href\\s*=\\s*['\\\"](?<path>/teams/[^'\\\"?#]+)['\\\"][^>]*>(?<name>[\\s\\S]*?)</a>",
                RegexOptions.IgnoreCase);
            if (!link.Success)
                continue;
            var name = Clean(link.Groups["name"].Value);
            var path = WebUtility.HtmlDecode(link.Groups["path"].Value);
            if (name.Length is 0 or > 100 || teams.Any(team => team.Path.Equals(path, StringComparison.OrdinalIgnoreCase)))
                continue;
            teams.Add((name, path));
        }
        return teams.ToArray();
    }

    public static string[] ParseTeamDrivers(string html)
    {
        var drivers = new List<string>();
        foreach (Match link in Regex.Matches(
            html,
            "<a\\b[^>]*href\\s*=\\s*['\\\"]/pilot/[^'\\\"?#]+['\\\"][^>]*>(?<body>[\\s\\S]*?)</a>",
            RegexOptions.IgnoreCase
        ))
        {
            var name = Clean(link.Groups["body"].Value);
            if (name.Length is 0 or > 100 || drivers.Any(driver => Normalize(driver) == Normalize(name)))
                continue;
            drivers.Add(name);
        }
        return drivers.ToArray();
    }

    async Task<ChampionshipStanding[]> AddCompetitionTeams(
        string html,
        Uri championshipUri,
        ChampionshipStanding[] standings,
        CancellationToken ct
    )
    {
        var teams = ParseCompetitionTeams(html);
        if (teams.Length == 0 || standings.Length == 0 || standings.All(standing => standing.TeamNames is { Length: > 0 }))
            return standings;
        var driversByTeam = await Task.WhenAll(teams.Select(async team =>
        {
            var drivers = await GetTeamDrivers(championshipUri, team.Path, ct);
            return (team.Name, Drivers: drivers.Select(Normalize).ToHashSet(StringComparer.Ordinal));
        }));

        return standings.Select(standing => standing with
        {
            TeamNames = standing.TeamNames is { Length: > 0 } ? standing.TeamNames : driversByTeam
                .Where(team => team.Drivers.Contains(Normalize(standing.Driver)))
                .Select(team => team.Name)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToArray()
        }).ToArray();
    }

    async Task<string[]> GetTeamDrivers(Uri championshipUri, string path, CancellationToken ct)
    {
        if (!path.StartsWith("/teams/", StringComparison.OrdinalIgnoreCase))
            return [];
        if (teamRosterCache.TryGetValue(path, out var cachedRoster)
            && DateTimeOffset.UtcNow - cachedRoster.CachedAt < TimeSpan.FromHours(1))
            return cachedRoster.Drivers;

        await teamRosterGate.WaitAsync(ct);
        try
        {
            if (teamRosterCache.TryGetValue(path, out cachedRoster)
                && DateTimeOffset.UtcNow - cachedRoster.CachedAt < TimeSpan.FromHours(1))
                return cachedRoster.Drivers;

            var teamUri = new Uri(championshipUri.GetLeftPart(UriPartial.Authority) + path);
            using var response = await http.GetAsync(teamUri, ct);
            if (!response.IsSuccessStatusCode || response.Content.Headers.ContentLength > 2 * 1024 * 1024)
                return [];
            var teamHtml = await response.Content.ReadAsStringAsync(ct);
            if (teamHtml.Length > 2 * 1024 * 1024)
                return [];
            var drivers = ParseTeamDrivers(teamHtml);
            teamRosterCache[path] = (DateTimeOffset.UtcNow, drivers);
            while (teamRosterCache.Count > 120) teamRosterCache.TryRemove(teamRosterCache.Keys.First(), out _);
            return drivers;
        }
        catch (HttpRequestException) when (!ct.IsCancellationRequested)
        {
            return [];
        }
        catch (TaskCanceledException) when (!ct.IsCancellationRequested)
        {
            return [];
        }
        finally
        {
            teamRosterGate.Release();
        }
    }

    async Task<string> Fetch(string url, int limit, CancellationToken ct)
    {
        using var response = await http.GetAsync(url, HttpCompletionOption.ResponseHeadersRead, ct);
        response.EnsureSuccessStatusCode();
        if (response.Content.Headers.ContentLength > limit)
            throw new AppFault("RESULTS_UNAVAILABLE", "The results source exceeds the allowed size.");
        await using var stream = await response.Content.ReadAsStreamAsync(ct);
        using var buffer = new MemoryStream();
        byte[] chunk = new byte[16384];
        int count;
        while ((count = await stream.ReadAsync(chunk, ct)) > 0)
        {
            if (buffer.Length + count > limit)
                throw new AppFault("RESULTS_UNAVAILABLE", "The results source exceeds the allowed size.");
            buffer.Write(chunk, 0, count);
        }
        return System.Text.Encoding.UTF8.GetString(buffer.GetBuffer(), 0, (int)buffer.Length);
    }

    public static (string Round, string Name, string Venue) ParseEventMeta(string html, string eventId, int fallbackRound)
    {
        var link = html.IndexOf("/events/" + eventId + "/results", StringComparison.OrdinalIgnoreCase);
        var preview = html.IndexOf("id=\"podium-preview-" + eventId + "\"", StringComparison.OrdinalIgnoreCase);
        var end = link >= 0 ? link : preview;
        if (end < 0)
            return ($"R{fallbackRound}", $"Round {fallbackRound}", "");
        var start = Math.Max(0, end - 7000);
        var snippet = html[start..end];
        var roundMatch = Regex.Matches(snippet, @">R(?<round>\d+)</span>", RegexOptions.IgnoreCase).LastOrDefault();
        var round = roundMatch?.Groups["round"].Value ?? fallbackRound.ToString(CultureInfo.InvariantCulture);
        var nameMatch = Regex.Matches(snippet, @"<h3\b[^>]*>(?<name>[\s\S]*?)</h3>", RegexOptions.IgnoreCase).LastOrDefault();
        var name = nameMatch == null ? $"Round {round}" : Clean(nameMatch.Groups["name"].Value);
        var venue = "";
        var location = Regex.Matches(snippet, @"<span\b[^>]*>\s*<i[^>]*location-dot[^>]*></i>(?<venue>[\s\S]*?)</span>", RegexOptions.IgnoreCase).LastOrDefault();
        if (location != null)
            venue = Clean(location.Groups["venue"].Value);
        return ("R" + round, name, venue);
    }

    public static RaceSessionResult[] ParseSessions(JsonElement root)
    {
        if (!root.TryGetProperty("sessions", out var sessions) || sessions.ValueKind != JsonValueKind.Array)
            return [];
        var result = new List<RaceSessionResult>();
        foreach (var session in sessions.EnumerateArray())
        {
            var name = ReadString(session, "name", "Session");
            var entries = new List<RaceResultEntry>();
            if (session.TryGetProperty("classes", out var classes)
                && classes.TryGetProperty("all", out var all)
                && all.ValueKind == JsonValueKind.Array)
            {
                foreach (var (item, index) in all.EnumerateArray().Select((item, index) => (item, index)))
                {
                    var driver = ReadString(item, "name", "Unknown driver");
                    var number = item.TryGetProperty("raceNumber", out var numberValue) && numberValue.ValueKind == JsonValueKind.Number
                        ? numberValue.ToString() : "—";
                    entries.Add(new(index + 1, number, driver, ReadString(item, "car", ""), ReadString(item, "time", "—")));
                }
            }
            if (entries.Count > 0)
                result.Add(new(name, entries.ToArray()));
        }
        return result.ToArray();
    }

    static string ReadString(JsonElement obj, string key, string fallback) =>
        obj.TryGetProperty(key, out var value) && value.ValueKind == JsonValueKind.String
            ? value.GetString() ?? fallback : fallback;

    static string Clean(string html)
    {
        var text = WebUtility.HtmlDecode(Regex.Replace(html, "<[^>]+>", " "))
            .Replace('\u00a0', ' ')
            .Trim();
        return Regex.Replace(text, @"\s+", " ");
    }

    static string Normalize(string value) => Regex.Replace(
        value.Normalize(System.Text.NormalizationForm.FormD),
        @"\p{Mn}|[^\p{L}\p{N}]",
        ""
    ).ToLowerInvariant();
}
