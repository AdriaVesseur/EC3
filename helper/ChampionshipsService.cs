using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.RegularExpressions;

namespace Eurocup3;

public sealed record ActiveChampionship(string Id, string Name, string Url, string? Image, string Status,
    string? Car = null, int? Registered = null, int? Capacity = null, string? License = null,
    string? Format = null, int? Rounds = null, string? DateLabel = null);
public sealed record ActiveChampionshipCatalog(string SourceUrl, DateTimeOffset UpdatedAt, ActiveChampionship[] Championships, string[] Warnings);
public sealed record ChampionshipCalendarRound(string Id, string Name, string Track, string DateLabel, DateTimeOffset? StartAt, string Status);
public sealed record ActiveChampionshipDetails(string ChampionshipId, string SourceUrl, DateTimeOffset UpdatedAt,
    string? Description, RaceParticipant[] Participants, ChampionshipCalendarRound[] Calendar, string[] Warnings);

/// <summary>The public active list is the authority for available championship selectors.</summary>
public sealed class ChampionshipsService
{
    public const string SourceUrl = RacesService.Origin + "/championships";
    static readonly HttpClient DefaultHttp = new(new HttpClientHandler
    {
        AllowAutoRedirect = false,
        AutomaticDecompression = DecompressionMethods.All,
    })
    {
        Timeout = TimeSpan.FromSeconds(20),
        DefaultRequestHeaders = { UserAgent = { ProductInfoHeaderValue.Parse("MKBT-ContentManager/1.0") } },
    };
    readonly ResultsService results;
    readonly HttpClient http;
    readonly SemaphoreSlim catalogGate = new(1, 1);
    readonly SemaphoreSlim resultGate = new(1, 1);
    readonly SemaphoreSlim detailsGate = new(1, 1);
    readonly object cacheLock = new();
    readonly Dictionary<string, (DateTimeOffset At, RaceDetailResult Value)> fullCache = new(StringComparer.Ordinal);
    readonly Dictionary<string, ActiveChampionshipDetails> detailsCache = new(StringComparer.Ordinal);
    ActiveChampionshipCatalog? cached;

    public ChampionshipsService(ResultsService results) : this(results, DefaultHttp) { }
    public ChampionshipsService(ResultsService results, HttpClient http) { this.results = results; this.http = http; }

    public async Task<ActiveChampionshipCatalog> Get(bool refresh = false, CancellationToken ct = default)
    {
        if (!refresh && cached is { } current && Fresh(current.UpdatedAt)) return current;
        await catalogGate.WaitAsync(ct);
        try
        {
            if (!refresh && cached is { } latest && Fresh(latest.UpdatedAt)) return latest;
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
            timeout.CancelAfter(TimeSpan.FromSeconds(22));
            try
            {
                var html = await Fetch(SourceUrl, 8 * 1024 * 1024, timeout.Token);
                var entries = Parse(html);
                cached = new(SourceUrl, DateTimeOffset.UtcNow, entries, []);
                return cached;
            }
            catch (Exception ex) when (!ct.IsCancellationRequested && Recoverable(ex))
            {
                if (cached is { } previous)
                    return previous with { Warnings = ["Showing the last available active championships. Refresh to try again."] };
                throw new AppFault("CHAMPIONSHIPS_UNAVAILABLE", "Could not load active championships from MKBT. Try refreshing in a moment.");
            }
        }
        finally { catalogGate.Release(); }
    }

    public async Task<ChampionshipResults> GetResults(string id, bool refresh = false, CancellationToken ct = default)
    {
        var entry = await Resolve(id, ct);
        return await results.Get(new Championship("", "1.0.0", "1.0.0", [], [], entry.Url), refresh, ct);
    }

    public async Task<ActiveChampionshipDetails> GetDetails(string id, bool refresh = false, CancellationToken ct = default)
    {
        ct.ThrowIfCancellationRequested();
        ValidateId(id);
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeout.CancelAfter(TimeSpan.FromSeconds(30));
        var entry = await Resolve(id, timeout.Token);
        lock (cacheLock)
            if (!refresh && detailsCache.TryGetValue(id, out var current) && Fresh(current.UpdatedAt)) return current;
        await detailsGate.WaitAsync(timeout.Token);
        try
        {
            lock (cacheLock)
                if (!refresh && detailsCache.TryGetValue(id, out var current) && Fresh(current.UpdatedAt)) return current;
            try
            {
                var html = await Fetch(entry.Url, 8 * 1024 * 1024, timeout.Token);
                var loaded = ParseDetails(html, entry.Id, entry.Url);
                ct.ThrowIfCancellationRequested();
                lock (cacheLock)
                {
                    detailsCache[id] = loaded;
                    while (detailsCache.Count > 60) detailsCache.Remove(detailsCache.Keys.First());
                }
                return loaded;
            }
            catch (Exception ex) when (!ct.IsCancellationRequested && Recoverable(ex))
            {
                lock (cacheLock)
                    if (detailsCache.TryGetValue(id, out var previous))
                        return previous with { Warnings = [.. previous.Warnings, "Showing the last available championship information. Refresh to try again."] };
                throw new AppFault("CHAMPIONSHIP_DETAILS_UNAVAILABLE", "Could not load this championship's public information from MKBT. Try refreshing in a moment.");
            }
        }
        finally { detailsGate.Release(); }
    }

    public async Task<RaceDetailResult> GetResult(string id, string resultId, bool refresh = false, CancellationToken ct = default)
    {
        ValidateId(id);
        if (!Guid.TryParseExact(resultId, "D", out _))
            throw new AppFault("INVALID_RACE_RESULT", "Unsupported race result identifier.");
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeout.CancelAfter(TimeSpan.FromSeconds(30));
        var summary = await GetResults(id, false, timeout.Token);
        var result = summary.Races.FirstOrDefault(r => r.Id.Equals(resultId, StringComparison.OrdinalIgnoreCase))
            ?? throw new AppFault("RACE_RESULT_NOT_FOUND", "This result is not published for the selected championship.");
        var url = RaceDetailsService.ValidateResultUrl(result.Url);
        if (!new Uri(url).AbsolutePath.StartsWith("/championships/" + id + "/events/", StringComparison.Ordinal))
            throw new AppFault("INVALID_RACE_RESULT", "This result does not belong to the selected championship.");
        lock (cacheLock)
            if (!refresh && fullCache.TryGetValue(url, out var current) && Fresh(current.At)) return current.Value;
        await resultGate.WaitAsync(timeout.Token);
        try
        {
            lock (cacheLock)
                if (!refresh && fullCache.TryGetValue(url, out var current) && Fresh(current.At)) return current.Value;
            var html = await Fetch(url, 32 * 1024 * 1024, timeout.Token);
            var sessions = RaceDetailsService.ParseFullResults(html);
            if (sessions.Length == 0)
                throw new AppFault("RACE_RESULT_UNAVAILABLE", "MKBT has not published a supported full result for this round yet.");
            var full = new RaceDetailResult(result.Id, result.Name, result.Round, result.Venue, url,
                sessions.Select(session => session with
                {
                    Results = session.Results.Select(entry => entry with
                    {
                        Number = summary.Standings.FirstOrDefault(s => Normalize(s.Driver) == Normalize(entry.Driver))?.Number ?? entry.Number,
                        Team = entry.Team ?? summary.Standings.FirstOrDefault(s => Normalize(s.Driver) == Normalize(entry.Driver))?.TeamNames?.FirstOrDefault(),
                    }).ToArray(),
                }).ToArray(), "full");
            lock (cacheLock)
            {
                fullCache[url] = (DateTimeOffset.UtcNow, full);
                while (fullCache.Count > 80) fullCache.Remove(fullCache.Keys.First());
            }
            return full;
        }
        catch (Exception ex) when (!ct.IsCancellationRequested && Recoverable(ex))
        { throw new AppFault("RACE_RESULT_UNAVAILABLE", "Could not load the full result from MKBT. Retry or open the official result page."); }
        finally { resultGate.Release(); }
    }

    async Task<ActiveChampionship> Resolve(string id, CancellationToken ct)
    {
        ValidateId(id);
        var catalog = await Get(false, ct);
        return catalog.Championships.FirstOrDefault(entry => entry.Id == id)
            ?? throw new AppFault("CHAMPIONSHIP_NOT_FOUND", "This championship is no longer in the active MKBT list. Refresh the championships.");
    }

    public static ActiveChampionship[] Parse(string html)
    {
        // Parse only the official current-season block, never archived Hall of Fame cards.
        var heading = Match(html, @"<h2\b[^>]*>\s*Campeonatos\s+activos\s*</h2>");
        if (!heading.Success)
        {
            if (Match(Clean(html), @"\b(?:no\s+hay|sin|0)\s+campeonatos\s+activos\b").Success) return [];
            throw new AppFault("CHAMPIONSHIPS_INVALID_RESPONSE", "The official active championship section is unavailable.");
        }
        var section = html[(heading.Index + heading.Length)..];
        var archive = Match(section, @"<h2\b[^>]*>[\s\S]*?(?:Salón\s+de\s+la\s+Fama|Campeonatos\s+finalizados)[\s\S]*?</h2>");
        if (archive.Success) section = section[..archive.Index];
        var entries = new List<ActiveChampionship>();
        var cards = Regex.Matches(section, @"<div\b[^>]*class=[""'][^""']*\bglass-card\s+group/card\b[^""']*[""'][^>]*>", RegexOptions.IgnoreCase, TimeSpan.FromSeconds(2));
        foreach (Match start in cards)
        {
            var bodyStart = start.Index + start.Length;
            int depth = 1;
            string? card = null;
            foreach (Match tag in Regex.Matches(section[bodyStart..], @"<(?<close>/)?div\b[^>]*>", RegexOptions.IgnoreCase, TimeSpan.FromSeconds(2)))
            {
                depth += tag.Groups["close"].Success ? -1 : 1;
                if (depth != 0) continue;
                card = section[bodyStart..(bodyStart + tag.Index)];
                break;
            }
            if (card == null) throw new AppFault("CHAMPIONSHIPS_INVALID_RESPONSE", "An active championship card is incomplete.");
            var text = Clean(card);
            if (Match(text, @"\b(?:Finalizado|Finalizada|Completado|Completada|Borrador|Draft|Serie\s+Finalizada)\b").Success) continue;
            var status = Match(text, @"\bEn\s+Curso\b").Success ? "active"
                : Match(text, @"\b(?:Próxim[oa]|Inscripciones?\s+abiertas?|Inscripción\s+abierta|Abierto)\b").Success ? "upcoming" : null;
            if (status == null) continue;
            var title = Match(card, @"<h3\b[^>]*>[\s\S]*?<a\b[^>]*href=[""'](?<url>/championships/(?<id>[a-z0-9][a-z0-9-]{0,150}))[""'][^>]*>(?<name>[\s\S]*?)</a>[\s\S]*?</h3>");
            var id = title.Groups["id"].Value;
            var name = Clean(title.Groups["name"].Value);
            if (!title.Success || id == "calendar" || name.Length is 0 or > 200 || entries.Any(e => e.Id == id)) continue;
            var imageValue = WebUtility.HtmlDecode(Match(card, @"<img\b[^>]*src=[""'](?<src>[^""']+)[""']").Groups["src"].Value);
            string? image = null;
            if (imageValue.Length > 0 && Uri.TryCreate(new Uri(SourceUrl), imageValue, out var candidate)
                && candidate.Scheme == "https" && candidate.UserInfo.Length == 0 && candidate.IsDefaultPort
                && candidate.Host is "makrobeasts.com" or "www.makrobeasts.com" or "i.imgur.com") image = candidate.AbsoluteUri;
            var capacity = Match(text, @"\b(?<count>\d{1,5})\s*/\s*(?<max>\d{1,5})\b");
            var license = Match(card, @"Lic\.\s*mín\.[\s\S]*?</span>\s*<span\b[^>]*>(?<name>[\s\S]*?)</span>");
            var cars = Regex.Matches(card, @"showAssetPopup\(this,\s*'car',\s*'[^']+',\s*'(?<car>[^']+)'", RegexOptions.IgnoreCase, TimeSpan.FromSeconds(2))
                .Select(m => Clean(m.Groups["car"].Value)).Where(car => car.Length > 0).Distinct().Take(80).ToArray();
            var formats = Regex.Matches(text, @"\b(Ranked|Unranked|Semi-Fixed|Fixed|Open|Salida en Lanzado|Salida en Parado)\b", RegexOptions.IgnoreCase, TimeSpan.FromSeconds(2))
                .Select(m => m.Value).Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
            var rounds = Match(text, @"\b(?<count>\d{1,3})\s+Rondas?\b");
            var nextDate = Match(card, @">\s*(?<date>(?:lunes|martes|miércoles|jueves|viernes|sábado|domingo),[^<]{1,160})<");
            entries.Add(new(id, name, RacesService.Origin + title.Groups["url"].Value, image, status,
                cars.Length > 0 ? string.Join(" · ", cars) : null,
                Number(capacity.Groups["count"].Value), Number(capacity.Groups["max"].Value),
                license.Success ? Clean(license.Groups["name"].Value) : null,
                formats.Length > 0 ? string.Join(" · ", formats) : null, Number(rounds.Groups["count"].Value),
                nextDate.Success ? Clean(nextDate.Groups["date"].Value) : null));
        }
        if (cards.Count == 0 && Match(section, @"href=[""']/championships/(?!calendar)[a-z0-9-]+[""']").Success)
            throw new AppFault("CHAMPIONSHIPS_INVALID_RESPONSE", "The active championship card layout is unsupported.");
        return entries.Take(60).ToArray();
    }

    public static ActiveChampionshipDetails ParseDetails(string html, string id, string sourceUrl)
    {
        ValidateId(id);
        ResultsService.ValidateSourceUrl(sourceUrl);
        if (new Uri(sourceUrl).AbsolutePath != "/championships/" + id)
            throw new AppFault("INVALID_CHAMPIONSHIP", "The championship information source does not match its identifier.");
        if (!Match(html, @"\bid\s*=\s*[""'](?:tab-pane-entrants|tab-pane-results|standings-pane-pilots|tab-pane-calendar|tab-pane-info)[""']").Success)
            throw new AppFault("CHAMPIONSHIP_DETAILS_INVALID_RESPONSE", "The public championship information is unavailable.");
        var participants = RaceDetailsService.ParseParticipants(html, "championship");
        var standings = RaceDetailsService.ParseStandings(html);
        participants = participants.Select(p => p with
        {
            Team = p.Team ?? standings.FirstOrDefault(s => Normalize(s.Driver) == Normalize(p.Driver))?.TeamNames?.FirstOrDefault(),
        }).ToArray();
        var info = ElementById(html, "tab-pane-info");
        var descriptionStart = Match(info, @"<div\b[^>]*class=[""'][^""']*\bmarkdown-content\b[^""']*[""'][^>]*>");
        var description = descriptionStart.Success ? Clean(info[(descriptionStart.Index + descriptionStart.Length)..]) : "";
        if (description.Length > 16000) description = description[..16000].TrimEnd() + "…";
        var calendarPane = ElementById(html, "tab-pane-calendar");
        var calendar = new List<ChampionshipCalendarRound>();
        foreach (var card in DivCards(calendarPane))
        {
            var name = Clean(Match(card, @"<h3\b[^>]*>(?<name>[\s\S]*?)</h3>").Groups["name"].Value);
            if (name.Length == 0) continue;
            var track = Clean(Match(card, @"<i\b[^>]*\bfa-location-dot\b[^>]*></i>(?<track>[\s\S]*?)</span>").Groups["track"].Value);
            if (track.Length == 0) track = Clean(Match(card, @"<img\b[^>]*\balt=[""'](?<track>[^""']*)[""']").Groups["track"].Value);
            var date = Clean(Match(card, @"<i\b[^>]*\bfa-calendar\b[^>]*></i>(?<date>[\s\S]*?)</span>").Groups["date"].Value);
            var completed = Match(Clean(card), @"\b(?:Finalizad[oa]|Completad[oa])\b").Success;
            var upcoming = Match(Clean(card), @"\bPróxim[oa]\b").Success;
            var linkedId = Match(card, @"/events/(?<id>[0-9a-f-]{36})/results").Groups["id"].Value;
            var roundId = Guid.TryParseExact(linkedId, "D", out _) ? linkedId : "round-" + (calendar.Count + 1);
            calendar.Add(new(roundId, name, track, date, null, completed ? "completed" : upcoming ? "upcoming" : "pending"));
            if (calendar.Count >= 100) break;
        }
        var warnings = calendar.Count == 0 && Match(calendarPane, @"<h3\b|\bglass-card\b").Success
            ? new[] { "The published championship calendar could not be read. Open the official page for the latest rounds." } : [];
        return new(id, sourceUrl, DateTimeOffset.UtcNow, description.Length > 0 ? description : null, participants, calendar.ToArray(), warnings);
    }

    static string ElementById(string html, string id)
    {
        var opening = Match(html, @"<div\b[^>]*\bid=[""']" + Regex.Escape(id) + @"[""'][^>]*>");
        return opening.Success ? DivBody(html, opening.Index + opening.Length) ?? "" : "";
    }
    static string? DivBody(string html, int start)
    {
        var depth = 1;
        foreach (Match tag in Regex.Matches(html[start..], @"<(?<close>/)?div\b[^>]*>", RegexOptions.IgnoreCase, TimeSpan.FromSeconds(2)))
        {
            depth += tag.Groups["close"].Success ? -1 : 1;
            if (depth == 0) return html[start..(start + tag.Index)];
        }
        return null;
    }
    static IEnumerable<string> DivCards(string html)
    {
        foreach (Match opening in Regex.Matches(html, @"<div\b[^>]*class=[""'][^""']*\bglass-card\b[^""']*[""'][^>]*>", RegexOptions.IgnoreCase, TimeSpan.FromSeconds(2)))
        {
            var body = DivBody(html, opening.Index + opening.Length);
            if (body != null) yield return body;
        }
    }

    async Task<string> Fetch(string url, int limit, CancellationToken ct)
    {
        using var response = await http.GetAsync(url, HttpCompletionOption.ResponseHeadersRead, ct);
        response.EnsureSuccessStatusCode();
        if (response.Content.Headers.ContentLength > limit) throw new AppFault("CHAMPIONSHIPS_TOO_LARGE", "The MKBT source exceeds the allowed size.");
        await using var stream = await response.Content.ReadAsStreamAsync(ct);
        using var buffer = new MemoryStream();
        var chunk = new byte[16384];
        int count;
        while ((count = await stream.ReadAsync(chunk, ct)) > 0)
        {
            if (buffer.Length + count > limit) throw new AppFault("CHAMPIONSHIPS_TOO_LARGE", "The MKBT source exceeds the allowed size.");
            buffer.Write(chunk, 0, count);
        }
        return Encoding.UTF8.GetString(buffer.GetBuffer(), 0, (int)buffer.Length);
    }
    static void ValidateId(string id)
    {
        if (!Match(id, @"^[a-z0-9][a-z0-9-]{0,150}$").Success || id == "calendar")
            throw new AppFault("INVALID_CHAMPIONSHIP", "Unsupported championship identifier.");
    }
    static bool Fresh(DateTimeOffset at) => DateTimeOffset.UtcNow - at < TimeSpan.FromMinutes(5);
    static int? Number(string value) => int.TryParse(value, out var number) ? number : null;
    static bool Recoverable(Exception ex) => ex is HttpRequestException or IOException or OperationCanceledException or AppFault or RegexMatchTimeoutException;
    static Match Match(string input, string pattern) => Regex.Match(input, pattern, RegexOptions.IgnoreCase | RegexOptions.CultureInvariant, TimeSpan.FromSeconds(2));
    static string Clean(string value) => Regex.Replace(WebUtility.HtmlDecode(Regex.Replace(value, @"<[^>]*>", " ", RegexOptions.None, TimeSpan.FromSeconds(2))), @"\s+", " ", RegexOptions.None, TimeSpan.FromSeconds(2)).Trim();
    static string Normalize(string value) => Regex.Replace(value.Normalize(NormalizationForm.FormD), @"\p{Mn}|[^\p{L}\p{N}]", "").ToLowerInvariant();
}
