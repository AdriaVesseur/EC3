using System.Globalization;
using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Eurocup3;

public sealed record RaceCatalog(string SourceUrl, DateTimeOffset UpdatedAt, string TimeZone, RaceEntry[] Races, string[] Warnings);
public sealed record RaceEntry(
    string Id, string Name, string Championship, string Kind, DateTimeOffset? StartAt,
    string DateLabel, string Track, string Car, string? Image, string Url, string? RegistrationUrl,
    string Status, string RegistrationStatus, int? Registered, int? Capacity, string? License, string? Format,
    string? SeriesImage = null);

public sealed class RacesService
{
    public const string Origin = "https://www.makrobeasts.com";
    public const string SourceUrl = Origin + "/championships/calendar";
    public const string CalendarTimeZone = "Europe/Madrid";
    const int MaxPageBytes = 8 * 1024 * 1024;
    static readonly HttpClient DefaultHttp = new(new HttpClientHandler { AllowAutoRedirect = false })
    {
        Timeout = TimeSpan.FromSeconds(18),
        DefaultRequestHeaders = { UserAgent = { ProductInfoHeaderValue.Parse("EpicSimracing-ContentManager/1.0") } },
    };
    readonly HttpClient http;
    readonly SemaphoreSlim gate = new(1, 1);
    RaceCatalog? cached;

    public RacesService() : this(DefaultHttp) { }
    public RacesService(HttpClient http) => this.http = http;

    public async Task<RaceCatalog> Get(bool refresh = false, CancellationToken ct = default)
    {
        if (!refresh && cached is { } current && DateTimeOffset.UtcNow - current.UpdatedAt < TimeSpan.FromMinutes(5))
            return current;
        await gate.WaitAsync(ct);
        try
        {
            if (!refresh && cached is { } latest && DateTimeOffset.UtcNow - latest.UpdatedAt < TimeSpan.FromMinutes(5))
                return latest;
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
            timeout.CancelAfter(TimeSpan.FromSeconds(22));
            var pages = await Task.WhenAll(
                Fetch(SourceUrl, timeout.Token, ct),
                Fetch(Origin + "/championships", timeout.Token, ct),
                Fetch(Origin + "/events", timeout.Token, ct));
            ct.ThrowIfCancellationRequested();
            var warnings = pages.Where(p => p.Error != null).Select(p => p.Error!).ToList();
            var races = new List<RaceEntry>();
            ChampionshipRaceInfo[] metadata = [];
            if (pages[1].Html is { } championshipHtml)
            {
                try { metadata = ParseChampionships(championshipHtml); }
                catch (Exception ex) when (ex is AppFault or RegexMatchTimeoutException)
                { warnings.Add("MKBT championship details could not be read; entry requirements may be missing."); }
            }
            if (pages[0].Html is { } calendarHtml)
            {
                try { races.AddRange(ParseCalendar(calendarHtml, metadata)); }
                catch (Exception ex) when (ex is AppFault or JsonException or RegexMatchTimeoutException)
                { warnings.Add("MKBT championship calendar could not be read; championship rounds may be missing."); }
            }
            if (pages[2].Html is { } eventsHtml)
            {
                try { races.AddRange(ParseEvents(eventsHtml)); }
                catch (Exception ex) when (ex is AppFault or RegexMatchTimeoutException)
                { warnings.Add("MKBT events could not be read; independent events may be missing."); }
            }
            if (races.Count == 0 && warnings.Count > 0)
            {
                if (cached is { } previous)
                    return previous with { Warnings = [.. warnings, "Showing the last available race calendar. Refresh to try again."] };
                throw new AppFault("RACES_UNAVAILABLE", "Could not load the race calendar from MKBT. Try refreshing in a moment.");
            }
            cached = new(SourceUrl, DateTimeOffset.UtcNow, CalendarTimeZone,
                races.DistinctBy(r => r.Id).OrderBy(r => r.StartAt ?? DateTimeOffset.MaxValue).ToArray(), warnings.ToArray());
            return cached;
        }
        finally { gate.Release(); }
    }

    async Task<(string? Html, string? Error)> Fetch(string url, CancellationToken timeout, CancellationToken caller)
    {
        try
        {
            if (OfficialUrl(url) != url) throw new AppFault("INVALID_RACES_SOURCE", "Unsupported race source.");
            using var response = await http.GetAsync(url, HttpCompletionOption.ResponseHeadersRead, timeout);
            response.EnsureSuccessStatusCode();
            // Redirects are disabled. Never follow a source to another host or a login page.
            if (response.Content.Headers.ContentLength > MaxPageBytes)
                throw new AppFault("RACES_PAGE_TOO_LARGE", "Race source exceeds the allowed size.");
            await using var stream = await response.Content.ReadAsStreamAsync(timeout);
            using var buffer = new MemoryStream();
            byte[] chunk = new byte[16384];
            int length;
            while ((length = await stream.ReadAsync(chunk, timeout)) > 0)
            {
                if (buffer.Length + length > MaxPageBytes)
                    throw new AppFault("RACES_PAGE_TOO_LARGE", "Race source exceeds the allowed size.");
                buffer.Write(chunk, 0, length);
            }
            return (Encoding.UTF8.GetString(buffer.ToArray()), null);
        }
        catch (Exception ex) when (!caller.IsCancellationRequested && (ex is HttpRequestException or IOException or OperationCanceledException or AppFault))
        {
            var source = new Uri(url).AbsolutePath switch
            {
                "/events" => "special events",
                "/championships" => "championship details",
                _ => "race calendar",
            };
            return (null, "Could not refresh MKBT " + source + "; some races or details may be missing.");
        }
    }

    public static RaceEntry[] ParseCalendar(string html, ChampionshipRaceInfo[]? metadata = null, DateTimeOffset? now = null)
    {
        var marker = Match(html, @"\bconst\s+calendarEvents\s*=\s*");
        if (!marker.Success) throw new AppFault("RACES_INVALID_RESPONSE", "The official race calendar has no supported data.");
        var bytes = Encoding.UTF8.GetBytes(html[(marker.Index + marker.Length)..]);
        var reader = new Utf8JsonReader(bytes, new JsonReaderOptions { MaxDepth = 32 });
        using var json = JsonDocument.ParseValue(ref reader);
        if (json.RootElement.ValueKind != JsonValueKind.Array)
            throw new AppFault("RACES_INVALID_RESPONSE", "The official race calendar is not a list.");
        var result = new List<RaceEntry>();
        foreach (var item in json.RootElement.EnumerateArray().Take(5000))
        {
            if (item.ValueKind != JsonValueKind.Object) continue;
            var id = Text(item, "eventId");
            var slug = Text(item, "champSlug");
            if (!Guid.TryParse(id, out _) || !Match(slug, @"^[a-z0-9][a-z0-9-]{0,150}$").Success) continue;
            var url = OfficialUrl("/championships/" + slug);
            if (url == null) continue;
            var info = metadata?.FirstOrDefault(m => m.Url == url);
            var completed = item.TryGetProperty("isCompleted", out var finished) && finished.ValueKind == JsonValueKind.True;
            DateTimeOffset? startAt = DateTimeOffset.TryParse(Text(item, "dateIso"), CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out var date) ? date : null;
            var status = completed ? "completed" : startAt > (now ?? DateTimeOffset.UtcNow) ? "upcoming" : "pending";
            var trackId = Text(item, "trackId");
            var seriesImage = SafeImage(Text(item, "champImage"));
            var image = Match(trackId, @"^[A-Za-z0-9_/-]{1,240}$").Success && !trackId.Split('/').Any(x => x is ".." or ".")
                ? Origin + "/admin/api/ac-image/track/" + string.Join('/', trackId.Split('/').Select(Uri.EscapeDataString)) + "/preview"
                : seriesImage;
            result.Add(new("championship:" + id, Text(item, "eventName"), Text(item, "champName"), "championship", startAt,
                startAt is { } instant ? MadridDate(instant) : Text(item, "dateKey"), Text(item, "trackName"), info?.Car ?? "", image,
                url + (completed ? "#results" : "#calendar"), completed ? null : url,
                status, completed ? "closed" : info?.RegistrationStatus ?? "unknown", info?.Registered, info?.Capacity, info?.License, info?.Format, seriesImage));
        }
        if (json.RootElement.GetArrayLength() > 0 && result.Count == 0)
            throw new AppFault("RACES_INVALID_RESPONSE", "The official race calendar contains no supported round entries.");
        return result.ToArray();
    }

    public sealed record ChampionshipRaceInfo(string Url, string Car, int? Registered, int? Capacity, string? License, string? Format, string RegistrationStatus);

    public static ChampionshipRaceInfo[] ParseChampionships(string html)
    {
        var cards = ChampionshipCards(html);
        var result = new List<ChampionshipRaceInfo>();
        foreach (var card in cards)
        {
            var link = Match(card, @"href=[""'](?<url>/championships/[a-z0-9-]+)[""']");
            var url = OfficialUrl(link.Groups["url"].Value);
            if (url == null) continue;
            var text = Clean(card);
            var capacity = Match(text, @"\b(?<count>\d{1,5})\s*/\s*(?<max>\d{1,5})\b");
            int? registered = Number(capacity.Groups["count"].Value), max = Number(capacity.Groups["max"].Value);
            var license = Match(card, @"Lic\.\s*mín\.[\s\S]*?</span>\s*<span\b[^>]*>(?<name>[\s\S]*?)</span>");
            var carNames = Regex.Matches(card, @"showAssetPopup\(this,\s*'car',\s*'[^']+',\s*'(?<car>[^']+)'", RegexOptions.IgnoreCase, TimeSpan.FromSeconds(2))
                .Select(m => WebUtility.HtmlDecode(m.Groups["car"].Value)).Distinct().ToArray();
            var formats = Regex.Matches(text, @"\b(Ranked|Unranked|Semi-Fixed|Fixed|Open|Salida en Lanzado|Salida en Parado)\b", RegexOptions.IgnoreCase, TimeSpan.FromSeconds(2))
                .Select(m => m.Value).Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
            var closed = text.Contains("Finalizado", StringComparison.OrdinalIgnoreCase);
            result.Add(new(url, string.Join(" · ", carNames), registered, max,
                license.Success ? Clean(license.Groups["name"].Value) : null,
                formats.Length > 0 ? string.Join(" · ", formats) : null,
                closed ? "closed" : registered >= max && max > 0 ? "full" : "unknown"));
        }
        if (result.Count == 0 && !ExplicitEmpty(html, "championships"))
            throw new AppFault("RACES_INVALID_RESPONSE", "The official championship list has no supported cards or empty state.");
        return result.ToArray();
    }

    public static RaceEntry[] ParseEvents(string html)
    {
        var articles = Regex.Matches(html, @"<article\b[^>]*>(?<body>[\s\S]*?)</article>", RegexOptions.IgnoreCase, TimeSpan.FromSeconds(2));
        var result = new List<RaceEntry>();
        foreach (Match article in articles)
        {
            var body = article.Groups["body"].Value;
            var link = Match(body, @"href=[""'](?<url>/events/(?<id>[0-9a-f-]{36}))[""']");
            var url = OfficialUrl(link.Groups["url"].Value);
            if (url == null || !Guid.TryParse(link.Groups["id"].Value, out _)) continue;
            var text = Clean(body);
            var name = Clean(Match(body, @"<h3\b[^>]*>(?<name>[\s\S]*?)</h3>").Groups["name"].Value);
            if (name.Length == 0)
                name = Clean(Match(body, @"aria-label=[""']Ver evento:\s*(?<name>[^""']+)[""']").Groups["name"].Value);
            if (name.Length == 0) continue;
            var championship = Match(body, @"<p\b[^>]*>\s*(?<name>[^<>]+)\s*</p>\s*<h3\b").Groups["name"].Value.Trim();
            var dateLabel = Clean(Match(body, @">\s*Fecha\s*</span>[\s\S]*?</div>\s*<span\b[^>]*>(?<date>[\s\S]*?)</span>").Groups["date"].Value);
            var track = Clean(Match(body, @">\s*Circuito\s*</span>[\s\S]*?</div>\s*<span\b[^>]*>(?<track>[\s\S]*?)</span>").Groups["track"].Value);
            var car = string.Join(" · ", Regex.Matches(body, @"<figcaption\b[^>]*>(?<car>[\s\S]*?)</figcaption>", RegexOptions.IgnoreCase, TimeSpan.FromSeconds(2))
                .Select(m => Clean(m.Groups["car"].Value)).Distinct());
            var image = SafeImage(Match(body, @"<img\b[^>]*src=[""'](?<src>[^""']+)[""']").Groups["src"].Value);
            var completed = Match(text, @"\b(Finalizado|Completado|Completada)\b").Success;
            var status = completed ? "completed" : Match(text, @"\b(Próximo|Próxima|En curso)\b").Success ? "upcoming" : "pending";
            var registration = completed ? "closed" : text.Contains("Inscripción abierta", StringComparison.OrdinalIgnoreCase) ? "open"
                : text.Contains("Inscripción cerrada", StringComparison.OrdinalIgnoreCase) ? "closed" : "unknown";
            // Independent event cards publish a localized date without a year or offset. Keep it verbatim; do not invent an instant.
            result.Add(new("event:" + link.Groups["id"].Value, name, championship, "event", null, dateLabel, track, car, image,
                url, registration == "closed" ? null : url, status, registration, null, null, null, null, image));
        }
        if (result.Count == 0 && !ExplicitEmpty(html, "events"))
            throw new AppFault("RACES_INVALID_RESPONSE", "The official event list has no supported cards or empty state.");
        return result.ToArray();
    }

    static IEnumerable<string> ChampionshipCards(string html)
    {
        var starts = Regex.Matches(html, @"<div\b[^>]*class=[""'][^""']*\bglass-card\s+group/card\b[^""']*[""'][^>]*>", RegexOptions.IgnoreCase, TimeSpan.FromSeconds(2));
        foreach (Match start in starts)
        {
            var bodyStart = start.Index + start.Length;
            int depth = 1;
            foreach (Match tag in Regex.Matches(html[bodyStart..], @"<(?<close>/)?div\b[^>]*>", RegexOptions.IgnoreCase, TimeSpan.FromSeconds(2)))
            {
                depth += tag.Groups["close"].Success ? -1 : 1;
                if (depth != 0) continue;
                yield return html[bodyStart..(bodyStart + tag.Index)];
                break;
            }
            if (depth != 0)
                throw new AppFault("RACES_INVALID_RESPONSE", "An official championship card is incomplete.");
        }
    }

    static bool ExplicitEmpty(string html, string kind)
    {
        var main = Match(html, @"<main\b[^>]*>(?<body>[\s\S]*?)</main>");
        var body = main.Success ? main.Groups["body"].Value : html;
        var link = kind == "events" ? @"href=[""']/events/[0-9a-f-]{36}[""']" : @"href=[""']/championships/(?!calendar[""'])[a-z0-9-]+[""']";
        // A changed card layout with published entries must never be mistaken for an empty catalogue.
        if (Match(body, link).Success) return false;
        var entities = kind == "events" ? "(?:eventos|carreras)" : "campeonatos";
        return Match(Clean(body), @"\b(?:0\s+" + entities + @"|(?:no\s+hay|no\s+se\s+han\s+publicado|sin)\s+(?:todavía\s+|aún\s+)?" + entities + @")\b").Success;
    }

    public static string? OfficialUrl(string value)
    {
        if (!Uri.TryCreate(new Uri(Origin), WebUtility.HtmlDecode(value), out var uri)
            || uri.Scheme != "https" || uri.UserInfo.Length != 0 || !uri.IsDefaultPort
            || uri.Host is not ("makrobeasts.com" or "www.makrobeasts.com")
            || !Match(uri.AbsolutePath, @"^/(championships(?:/[a-z0-9-]+)?|events(?:/[0-9a-f-]{36})?)$").Success)
            return null;
        return Origin + uri.AbsolutePath;
    }

    static string? SafeImage(string value)
    {
        if (string.IsNullOrWhiteSpace(value) || !Uri.TryCreate(new Uri(Origin), WebUtility.HtmlDecode(value), out var uri)
            || uri.Scheme != "https" || uri.UserInfo.Length != 0 || !uri.IsDefaultPort
            || uri.Host is not ("makrobeasts.com" or "www.makrobeasts.com" or "i.imgur.com")) return null;
        return uri.AbsoluteUri;
    }

    static string MadridDate(DateTimeOffset instant)
    {
        var zone = TimeZoneInfo.FindSystemTimeZoneById(CalendarTimeZone);
        return TimeZoneInfo.ConvertTime(instant, zone).ToString("dd MMM yyyy · HH:mm", CultureInfo.GetCultureInfo("es-ES")) + " · Europe/Madrid";
    }
    static Match Match(string input, string pattern) => Regex.Match(input, pattern, RegexOptions.IgnoreCase | RegexOptions.CultureInvariant, TimeSpan.FromSeconds(2));
    static string Clean(string value) => Regex.Replace(WebUtility.HtmlDecode(Regex.Replace(value, @"<[^>]*>", " ", RegexOptions.None, TimeSpan.FromSeconds(2))), @"\s+", " ", RegexOptions.None, TimeSpan.FromSeconds(2)).Trim();
    static string Text(JsonElement item, string key) => item.ValueKind == JsonValueKind.Object && item.TryGetProperty(key, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() ?? "" : "";
    static int? Number(string value) => int.TryParse(value, NumberStyles.None, CultureInfo.InvariantCulture, out var number) ? number : null;
}
