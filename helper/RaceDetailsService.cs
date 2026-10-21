using System.Globalization;
using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Eurocup3;

public sealed record RaceParticipant(string Number, string Driver, string? Team, string Car);
public sealed record RaceDetailEntry(int Position, string Number, string Driver, string Car, string Time, string? Team = null, string? PositionLabel = null);
public sealed record RaceDetailSession(string Name, RaceDetailEntry[] Results);
public sealed record RaceDetailResult(string Id, string Name, string Round, string Venue, string Url, RaceDetailSession[] Sessions, string ResultsScope);
public sealed record RaceDetails(string RaceId, string SourceUrl, DateTimeOffset UpdatedAt, string Scope,
    RaceParticipant[] Participants, ChampionshipStanding[] Standings, RaceDetailResult[] Results, string[] Warnings);

/// <summary>Reads only public MKBT race pages. Large full results are fetched lazily and never on opening a race.</summary>
public sealed class RaceDetailsService
{
    const int MaxPageBytes = 8 * 1024 * 1024;
    const int MaxResultBytes = 32 * 1024 * 1024;
    static readonly TimeSpan CacheDuration = TimeSpan.FromMinutes(5);
    static readonly HttpClient DefaultHttp = new(new HttpClientHandler
    {
        AllowAutoRedirect = false,
        AutomaticDecompression = DecompressionMethods.All,
    })
    {
        Timeout = TimeSpan.FromSeconds(18),
        DefaultRequestHeaders = { UserAgent = { ProductInfoHeaderValue.Parse("EpicSimracing-ContentManager/1.0") } },
    };
    readonly RacesService races;
    readonly HttpClient http;
    readonly SemaphoreSlim network = new(4, 4);
    readonly SemaphoreSlim detailsGate = new(1, 1);
    readonly SemaphoreSlim resultsGate = new(1, 1);
    readonly object cacheLock = new();
    readonly Dictionary<string, RaceDetails> detailsCache = new(StringComparer.Ordinal);
    readonly Dictionary<string, (DateTimeOffset At, RaceDetails Details)> sourceCache = new(StringComparer.Ordinal);
    readonly Dictionary<string, (DateTimeOffset At, RaceDetailResult Result)> resultCache = new(StringComparer.Ordinal);

    public RaceDetailsService(RacesService races) : this(races, DefaultHttp) { }
    public RaceDetailsService(RacesService races, HttpClient http) { this.races = races; this.http = http; }

    public async Task<RaceDetails> Get(string id, bool refresh = false, CancellationToken ct = default)
    {
        ValidateRaceId(id);
        if (!refresh && CachedDetails(id) is { } current) return current;
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeout.CancelAfter(TimeSpan.FromSeconds(30));
        await detailsGate.WaitAsync(timeout.Token);
        try
        {
            if (!refresh && CachedDetails(id) is { } latest) return latest;
            var catalog = await races.Get(false, timeout.Token);
            var race = catalog.Races.FirstOrDefault(r => r.Id == id)
                ?? throw new AppFault("RACE_NOT_FOUND", "This race is no longer in the MKBT calendar. Refresh the race list.");
            var source = RacesService.OfficialUrl(race.Url)
                ?? throw new AppFault("INVALID_RACE_SOURCE", "Unsupported race details source.");
            lock (cacheLock)
            {
                if (!refresh && sourceCache.TryGetValue(source, out var shared) && Fresh(shared.At))
                {
                    var reused = shared.Details with { RaceId = id };
                    PutDetails(reused);
                    return reused;
                }
            }
            try
            {
                var html = await Fetch(source, MaxPageBytes, timeout.Token);
                if (!Match(html, @"\bid\s*=\s*[""'](?:tab-pane-entrants|tab-pane-results|standings-pane-pilots)[""']").Success)
                    throw new AppFault("RACE_DETAILS_INVALID_RESPONSE", "The public competition page has no supported race information.");
                var participants = ParseParticipants(html, race.Kind);
                var standings = ParseStandings(html);
                // Teams are published directly in the standings. Reuse that exact driver association for the entrant list.
                participants = participants.Select(p => p with
                {
                    Team = p.Team ?? standings.FirstOrDefault(s => Normalize(s.Driver) == Normalize(p.Driver))?.TeamNames?.FirstOrDefault(),
                }).ToArray();
                var published = PublishedResults(html, race, catalog);
                var warnings = new List<string>();
                var tasks = published.Select(async result =>
                {
                    try
                    {
                        var championshipId = ChampionshipId(html);
                        var apiPath = race.Kind == "championship" && championshipId != null
                            ? $"/api/championships/{championshipId}/events/{result.Id}/podium"
                            : null;
                        if (apiPath == null) return result;
                        var jsonText = await Fetch(RacesService.Origin + apiPath, MaxPageBytes, timeout.Token);
                        using var json = JsonDocument.Parse(jsonText, new JsonDocumentOptions { MaxDepth = 48 });
                        var sessions = ResultsService.ParseSessions(json.RootElement).Select(session => new RaceDetailSession(session.Name,
                            session.Results.Select(entry => new RaceDetailEntry(entry.Position, entry.Number, entry.Driver, entry.Car, entry.Time)).ToArray())).ToArray();
                        return result with { Sessions = sessions, ResultsScope = sessions.Length > 0 ? "podium" : "unpublished" };
                    }
                    catch (Exception ex) when (!ct.IsCancellationRequested && Recoverable(ex))
                    {
                        lock (warnings) warnings.Add("A race preview could not be refreshed. Open that round to load its full published results.");
                        return result;
                    }
                }).ToArray();
                var results = await Task.WhenAll(tasks);
                ct.ThrowIfCancellationRequested();
                var details = new RaceDetails(id, source, DateTimeOffset.UtcNow, race.Kind, participants, standings, results,
                    warnings.Distinct().ToArray());
                lock (cacheLock)
                {
                    PutDetails(details);
                    sourceCache[source] = (details.UpdatedAt, details);
                    Trim(sourceCache, 50);
                }
                return details;
            }
            catch (Exception ex) when (!ct.IsCancellationRequested && Recoverable(ex))
            {
                lock (cacheLock)
                {
                    if (detailsCache.TryGetValue(id, out var previous))
                        return previous with { Warnings = [.. previous.Warnings, "Showing the last available details for this race. Refresh to try again."] };
                }
                throw new AppFault("RACE_DETAILS_UNAVAILABLE", "Could not load this race's public details from MKBT. Try refreshing in a moment.");
            }
        }
        finally { detailsGate.Release(); }
    }

    public async Task<RaceDetailResult> GetResult(string id, string resultId, bool refresh = false, CancellationToken ct = default)
    {
        ValidateRaceId(id);
        if (!Guid.TryParseExact(resultId, "D", out _))
            throw new AppFault("INVALID_RACE_RESULT", "Unsupported race result identifier.");
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeout.CancelAfter(TimeSpan.FromSeconds(22));
        var details = await Get(id, false, timeout.Token);
        var result = details.Results.FirstOrDefault(r => r.Id.Equals(resultId, StringComparison.OrdinalIgnoreCase))
            ?? throw new AppFault("RACE_RESULT_NOT_FOUND", "This result is not published for the selected competition.");
        var url = ValidateResultUrl(result.Url);
        lock (cacheLock)
            if (!refresh && resultCache.TryGetValue(url, out var current) && Fresh(current.At)) return current.Result;
        await resultsGate.WaitAsync(timeout.Token);
        try
        {
            lock (cacheLock)
                if (!refresh && resultCache.TryGetValue(url, out var current) && Fresh(current.At)) return current.Result;
            var html = await Fetch(url, MaxResultBytes, timeout.Token);
            var sessions = ParseFullResults(html);
            if (sessions.Length == 0)
                throw new AppFault("RACE_RESULT_UNAVAILABLE", "MKBT has not published a supported full result for this round yet.");
            var full = result with
            {
                Sessions = sessions.Select(session => session with
                {
                    Results = session.Results.Select(entry => entry with
                    {
                        Number = details.Participants.FirstOrDefault(p => Normalize(p.Driver) == Normalize(entry.Driver))?.Number
                            ?? details.Standings.FirstOrDefault(s => Normalize(s.Driver) == Normalize(entry.Driver))?.Number ?? entry.Number,
                    }).ToArray(),
                }).ToArray(),
                ResultsScope = "full",
            };
            lock (cacheLock)
            {
                resultCache[url] = (DateTimeOffset.UtcNow, full);
                Trim(resultCache, 100);
            }
            return full;
        }
        catch (Exception ex) when (!ct.IsCancellationRequested && Recoverable(ex))
        {
            throw new AppFault("RACE_RESULT_UNAVAILABLE", "Could not load the full result from MKBT. You can retry or open the official result page.");
        }
        finally { resultsGate.Release(); }
    }

    RaceDetails? CachedDetails(string id)
    {
        lock (cacheLock) return detailsCache.TryGetValue(id, out var value) && Fresh(value.UpdatedAt) ? value : null;
    }
    void PutDetails(RaceDetails details) { detailsCache[details.RaceId] = details; Trim(detailsCache, 100); }
    static void Trim<T>(Dictionary<string, T> cache, int limit)
    {
        while (cache.Count > limit) cache.Remove(cache.Keys.First());
    }
    static bool Fresh(DateTimeOffset at) => DateTimeOffset.UtcNow - at < CacheDuration;
    static bool Recoverable(Exception ex) => ex is HttpRequestException or IOException or OperationCanceledException or AppFault or JsonException or RegexMatchTimeoutException;
    public static void ValidateRaceId(string id)
    {
        var separator = id.IndexOf(':');
        if (separator < 0 || id[..separator] is not ("championship" or "event") || !Guid.TryParseExact(id[(separator + 1)..], "D", out _))
            throw new AppFault("INVALID_RACE_ID", "Unsupported race identifier.");
    }
    public static string ValidateResultUrl(string value)
    {
        if (!Uri.TryCreate(value, UriKind.Absolute, out var uri) || uri.Scheme != "https" || !uri.IsDefaultPort || uri.UserInfo.Length > 0
            || uri.Host is not ("makrobeasts.com" or "www.makrobeasts.com")
            || !Match(uri.AbsolutePath, @"^/(?:championships/[a-z0-9-]{1,151}/)?events/(?<id>[0-9a-f-]{36})/results$").Success
            || !Guid.TryParseExact(Match(uri.AbsolutePath, @"/events/(?<id>[0-9a-f-]{36})/results$").Groups["id"].Value, "D", out _)
            || uri.Query.Length > 0 || uri.Fragment.Length > 0)
            throw new AppFault("INVALID_RACE_SOURCE", "Unsupported full race result source.");
        return RacesService.Origin + uri.AbsolutePath;
    }

    async Task<string> Fetch(string url, int limit, CancellationToken ct)
    {
        // Every URL is either canonicalized from a catalog entry or constructed from validated UUIDs.
        var uri = new Uri(url);
        if (uri.Scheme != "https" || uri.Host != "www.makrobeasts.com" || !uri.IsDefaultPort || uri.UserInfo.Length > 0)
            throw new AppFault("INVALID_RACE_SOURCE", "Unsupported public race source.");
        await network.WaitAsync(ct);
        try
        {
            using var response = await http.GetAsync(url, HttpCompletionOption.ResponseHeadersRead, ct);
            response.EnsureSuccessStatusCode();
            if (response.Content.Headers.ContentLength > limit)
                throw new AppFault("RACE_DETAILS_TOO_LARGE", "The public race page exceeds the allowed size.");
            await using var stream = await response.Content.ReadAsStreamAsync(ct);
            using var buffer = new MemoryStream();
            var chunk = new byte[16384];
            int count;
            while ((count = await stream.ReadAsync(chunk, ct)) > 0)
            {
                if (buffer.Length + count > limit)
                    throw new AppFault("RACE_DETAILS_TOO_LARGE", "The public race page exceeds the allowed size.");
                buffer.Write(chunk, 0, count);
            }
            return Encoding.UTF8.GetString(buffer.GetBuffer(), 0, (int)buffer.Length);
        }
        finally { network.Release(); }
    }

    static string? ChampionshipId(string html)
    {
        var id = Match(html, @"\bdata-champ\s*=\s*[""'](?<id>[0-9a-f-]{36})[""']").Groups["id"].Value;
        return Guid.TryParseExact(id, "D", out _) ? id : null;
    }

    static RaceDetailResult[] PublishedResults(string html, RaceEntry selected, RaceCatalog catalog)
    {
        var pane = ElementById(html, "tab-pane-results");
        if (pane.Length == 0) return [];
        var result = new List<RaceDetailResult>();
        var source = RacesService.OfficialUrl(selected.Url)!;
        foreach (Match link in Matches(pane, @"href\s*=\s*[""'](?<path>/(?:championships/[a-z0-9-]+/)?events/(?<id>[0-9a-f-]{36})/results)[""']"))
        {
            var id = link.Groups["id"].Value;
            if (!Guid.TryParseExact(id, "D", out _) || result.Any(r => r.Id == id)) continue;
            var candidate = catalog.Races.FirstOrDefault(r => r.Id == "championship:" + id);
            if (selected.Kind == "championship" && candidate != null && RacesService.OfficialUrl(candidate.Url) != source) continue;
            var path = link.Groups["path"].Value;
            if (selected.Kind == "championship" && !path.StartsWith(new Uri(source).AbsolutePath + "/events/", StringComparison.Ordinal)) continue;
            if (selected.Kind == "event" && id != selected.Id[6..]) continue;
            var meta = ResultsService.ParseEventMeta(pane, id, result.Count + 1);
            result.Add(new(id, candidate?.Name ?? meta.Name, meta.Round, candidate?.Track ?? meta.Venue,
                ValidateResultUrl(RacesService.Origin + path), [], "unpublished"));
        }
        // The official results pane is publication authority; the calendar supplies chronology and round titles.
        return result.OrderByDescending(r => catalog.Races.FirstOrDefault(c => c.Id == "championship:" + r.Id)?.StartAt ?? DateTimeOffset.MinValue)
            .Take(40).ToArray();
    }

    public static RaceParticipant[] ParseParticipants(string html, string scope)
    {
        var pane = ElementById(html, "tab-pane-entrants");
        if (pane.Length == 0) return [];
        var result = new List<RaceParticipant>();
        if (scope == "event")
        {
            foreach (Match article in Matches(pane, @"<article\b[^>]*>(?<body>[\s\S]*?)</article>"))
            {
                var body = article.Groups["body"].Value;
                var team = Clean(Match(body, @"<h3\b[^>]*>(?<name>[\s\S]*?)</h3>").Groups["name"].Value);
                var car = Clean(Match(body, @"<span\b[^>]*class=[""'][^""']*absolute[^""']*bottom[^""']*[""'][^>]*>(?<car>[\s\S]*?)</span>").Groups["car"].Value);
                foreach (Match driver in Matches(body, @"<span\b[^>]*class=[""'][^""']*text-xs\s+font-semibold\s+text-slate-300[^""']*[""'][^>]*>(?<name>[\s\S]*?)</span>"))
                {
                    var name = Clean(driver.Groups["name"].Value);
                    if (name.Length > 0) result.Add(new("—", name, team.Length > 0 ? team : null, car));
                }
            }
        }
        else
        {
            var boundaries = Matches(pane, @"<!--\s*Race Number\s*\(Dorsal\)\s*-->").Cast<Match>().ToArray();
            for (var i = 0; i < boundaries.Length; i++)
            {
                var card = pane[boundaries[i].Index..(i + 1 < boundaries.Length ? boundaries[i + 1].Index : pane.Length)];
                var driver = Clean(Match(card, @"<a\b[^>]*href=[""']/pilot/[^""']+[""'][^>]*>(?<name>[\s\S]*?)</a>").Groups["name"].Value);
                if (driver.Length == 0) continue;
                var number = Clean(Match(card, @"<span\b[^>]*>(?<number>[\s\S]*?)</span>").Groups["number"].Value);
                var car = Clean(Match(card, @"<i\b[^>]*fa-car\b[^>]*></i>\s*<p\b[^>]*>(?<car>[\s\S]*?)</p>").Groups["car"].Value);
                var team = Clean(Match(card, @"<a\b[^>]*href=[""']/teams/[^""']+[""'][^>]*>(?<team>[\s\S]*?)</a>").Groups["team"].Value);
                result.Add(new(number.Length > 0 ? number : "—", driver, team.Length > 0 ? team : null, car));
            }
        }
        return result.DistinctBy(p => (Normalize(p.Driver), p.Number, p.Team)).Take(1000).ToArray();
    }

    public static ChampionshipStanding[] ParseStandings(string html)
    {
        var pane = ElementById(html, "standings-pane-pilots");
        if (pane.Length == 0) return [];
        var result = new List<ChampionshipStanding>();
        foreach (Match row in Matches(pane, @"<tr\b[^>]*>(?<body>[\s\S]*?)</tr>"))
        {
            var cells = Matches(row.Groups["body"].Value, @"<td\b[^>]*>(?<body>[\s\S]*?)</td>")
                .Select(cell => cell.Groups["body"].Value).ToArray();
            if (cells.Length < 4 || !int.TryParse(Clean(cells[0]), NumberStyles.Integer, CultureInfo.InvariantCulture, out var position)) continue;
            var teams = cells.SelectMany(cell => Matches(cell, @"<a\b[^>]*href=[""']/teams/[^""']+[""'][^>]*>(?<name>[\s\S]*?)</a>"))
                .Select(team => Clean(team.Groups["name"].Value)).Where(team => team.Length > 0).Distinct().ToArray();
            if (teams.Length == 0 && cells.Length >= 7)
            {
                var team = Clean(cells[^2]);
                if (team is not ("" or "—" or "-")) teams = [team];
            }
            result.Add(new(position, Clean(cells[1]), Clean(cells[2]), Clean(cells[^1]), teams));
        }
        return result.DistinctBy(s => (Normalize(s.Driver), s.Number)).Take(1000).ToArray();
    }

    public static RaceDetailSession[] ParseFullResults(string html)
    {
        var names = Matches(html, @"<button\b[^>]*\bid=[""']btn-session-(?<id>\d+)[""'][^>]*>(?<name>[\s\S]*?)</button>")
            .ToDictionary(button => button.Groups["id"].Value, button => Clean(button.Groups["name"].Value));
        var sessions = new Dictionary<string, List<RaceDetailEntry>>();
        foreach (Match row in Matches(html, @"<tr\b[^>]*\bclass\s*=\s*[""'][^""']*\bresult-row-(?<id>\d+)\b[^""']*[""'][^>]*>(?<body>[\s\S]*?)</tr>"))
        {
            var cells = Matches(row.Groups["body"].Value, @"<td\b[^>]*>(?<body>[\s\S]*?)</td>")
                .Select(cell => cell.Groups["body"].Value).ToArray();
            // A private pilot can have plain text instead of a profile link. Cell shape is stable across public race/qualifying tables.
            if (cells.Length < 7) continue;
            var driverIndex = cells.Length >= 10 ? 2 : 1;
            var driverCell = cells[driverIndex];
            var driver = Clean(Match(driverCell, @"<a\b[^>]*href=[""']/pilot/[^""']+[""'][^>]*>(?<name>[\s\S]*?)</a>").Groups["name"].Value);
            var car = Clean(Match(driverCell, @"<div\b[^>]*class=[""'][^""']*font-mono[^""']*[""'][^>]*>(?<car>[\s\S]*?)</div>").Groups["car"].Value);
            if (driver.Length == 0)
            {
                driver = Clean(driverCell);
                if (car.Length > 0 && driver.EndsWith(car, StringComparison.Ordinal)) driver = driver[..^car.Length].Trim();
            }
            var race = driverIndex == 2;
            var timeIndex = race ? 9 : cells.Length - 1;
            if (timeIndex >= cells.Length || driver.Length == 0) continue;
            var team = Clean(cells[driverIndex + 2]);
            var id = row.Groups["id"].Value;
            if (!sessions.TryGetValue(id, out var entries)) sessions[id] = entries = [];
            var positionText = Clean(cells[0]);
            var position = int.TryParse(positionText, out var rankedPosition) ? rankedPosition : 0;
            var timeSpans = Matches(cells[timeIndex], @"<span\b[^>]*>(?<time>[\s\S]*?)</span>")
                .Select(span => Clean(span.Groups["time"].Value)).Where(time => time.Length > 0).ToArray();
            var time = timeSpans.Length > 1 && timeSpans[1].StartsWith('+') ? timeSpans[1]
                : timeSpans.FirstOrDefault() ?? Clean(cells[timeIndex]);
            entries.Add(new(position, "—", driver, car, time, team is "" or "—" or "-" ? null : team,
                position == 0 && positionText.Length > 0 ? positionText : null));
        }
        return sessions.Take(20).Select(session => new RaceDetailSession(names.GetValueOrDefault(session.Key, "Session " + session.Key),
            session.Value.Take(1000).ToArray())).Where(session => session.Results.Length > 0).ToArray();
    }

    static string ElementById(string html, string id)
    {
        var opening = Match(html, @"<div\b[^>]*\bid\s*=\s*[""']" + Regex.Escape(id) + @"[""'][^>]*>");
        if (!opening.Success) return "";
        var start = opening.Index + opening.Length;
        var depth = 1;
        foreach (Match tag in Matches(html[start..], @"</?div\b[^>]*>"))
        {
            depth += tag.Value.StartsWith("</", StringComparison.Ordinal) ? -1 : 1;
            if (depth == 0) return html[start..(start + tag.Index)];
        }
        return "";
    }
    static Match Match(string input, string pattern) => Regex.Match(input, pattern, RegexOptions.IgnoreCase | RegexOptions.CultureInvariant, TimeSpan.FromSeconds(2));
    static MatchCollection Matches(string input, string pattern) => Regex.Matches(input, pattern, RegexOptions.IgnoreCase | RegexOptions.CultureInvariant, TimeSpan.FromSeconds(3));
    static string Clean(string value) => Regex.Replace(WebUtility.HtmlDecode(Regex.Replace(value, @"<[^>]*>", " ", RegexOptions.None, TimeSpan.FromSeconds(2))), @"\s+", " ", RegexOptions.None, TimeSpan.FromSeconds(2)).Trim();
    static string Normalize(string value) => Regex.Replace(value.Normalize(NormalizationForm.FormD), @"\p{Mn}|[^\p{L}\p{N}]", "", RegexOptions.None, TimeSpan.FromSeconds(2)).ToLowerInvariant();
}
