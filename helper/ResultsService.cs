using System.Globalization;
using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Eurocup3;

public sealed class ResultsService
{
    static readonly HttpClient Http = new(new HttpClientHandler { AllowAutoRedirect = false })
    {
        Timeout = TimeSpan.FromSeconds(20),
        DefaultRequestHeaders = { UserAgent = { ProductInfoHeaderValue.Parse("Eurocup3-Helper/1.2.0") } },
    };
    readonly SemaphoreSlim gate = new(1, 1);
    ChampionshipResults? cached;

    public async Task<ChampionshipResults> Get(Championship championship, bool force = false, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(championship.ResultsUrl))
            throw new AppFault("RESULTS_NOT_CONFIGURED", "No results source is configured for this championship yet.");
        ValidateSourceUrl(championship.ResultsUrl);
        if (!force && cached is { } current && current.SourceUrl == championship.ResultsUrl
            && DateTimeOffset.UtcNow - current.UpdatedAt < TimeSpan.FromMinutes(5))
            return current;

        await gate.WaitAsync(ct);
        try
        {
            if (!force && cached is { } latest && latest.SourceUrl == championship.ResultsUrl
                && DateTimeOffset.UtcNow - latest.UpdatedAt < TimeSpan.FromMinutes(5))
                return latest;
            using var pageResponse = await Http.GetAsync(championship.ResultsUrl, ct);
            pageResponse.EnsureSuccessStatusCode();
            var html = await pageResponse.Content.ReadAsStringAsync(ct);
            if (html.Length > 8 * 1024 * 1024)
                throw new AppFault("RESULTS_UNAVAILABLE", "The results page exceeds the allowed size.");

            var championshipId = Regex.Match(html, @"data-champ=""(?<id>[0-9a-f-]{36})""", RegexOptions.IgnoreCase)
                .Groups["id"].Value;
            if (!Guid.TryParse(championshipId, out _))
                throw new AppFault("RESULTS_UNAVAILABLE", "The configured page does not expose a supported championship.");

            var standings = ParseStandings(html);
            var eventIds = Regex.Matches(html, @"data-event=""(?<id>[0-9a-f-]{36})""", RegexOptions.IgnoreCase)
                .Select(m => m.Groups["id"].Value)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToArray();
            var origin = new Uri(championship.ResultsUrl).GetLeftPart(UriPartial.Authority);
            var races = new List<ChampionshipRaceResult>();
            for (var i = 0; i < eventIds.Length; i++)
            {
                ct.ThrowIfCancellationRequested();
                var eventId = eventIds[i];
                var meta = ParseEventMeta(html, eventId, i + 1);
                var apiUrl = $"{origin}/api/championships/{championshipId}/events/{eventId}/podium";
                try
                {
                    using var response = await Http.GetAsync(apiUrl, ct);
                    response.EnsureSuccessStatusCode();
                    await using var stream = await response.Content.ReadAsStreamAsync(ct);
                    using var json = await JsonDocument.ParseAsync(stream, cancellationToken: ct);
                    var sessions = ParseSessions(json.RootElement);
                    if (sessions.Length > 0)
                    {
                        var path = new Uri(championship.ResultsUrl).AbsolutePath.TrimEnd('/');
                        races.Add(new(eventId, meta.Round, meta.Name, meta.Venue,
                            origin + path + "/events/" + eventId + "/results", sessions));
                    }
                }
                catch (HttpRequestException) when (!ct.IsCancellationRequested) { }
            }

            cached = new(championship.ResultsUrl, DateTimeOffset.UtcNow, standings, races.ToArray());
            return cached;
        }
        catch (AppFault)
        {
            throw;
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or JsonException or InvalidOperationException)
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
            || uri.Host is not ("makrobeasts.com" or "www.makrobeasts.com")
            || !uri.AbsolutePath.StartsWith("/championships/", StringComparison.Ordinal))
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
}
