using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using System.Net;
using System.Globalization;

namespace Eurocup3;

public sealed record PortalServer(
    string Id,
    string Name,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Host,
    int HttpPort,
    string? Description = null,
    bool AllowLan = false,
    string? LiveTimingUrl = null,
    bool EmbedTiming = false,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Ip = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Image = null
);

public sealed record PortalSponsor(string Id, string Name, string Logo, string Url, int Order = 0);
public sealed record PortalTeam(string Id, string Name, string Color, string Logo, string[] DriverNames, string[] LiveTimingNames);
public sealed record PortalConfigError(string Source, string Code, string Message);
public sealed record PortalSnapshot(
    PortalServer[] Servers,
    PortalSponsor[] Sponsors,
    PortalTeam[] Teams,
    PortalConfigError[] Errors,
    DateTimeOffset FetchedAt
);

public sealed class PortalConfigService(ConfigService config)
{
    const int MaxConfigBytes = 512 * 1024;
    static readonly JsonSerializerOptions StrictJson = new(Json.Options)
    {
        UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow,
    };
    static readonly HttpClient Http = new(new HttpClientHandler { AllowAutoRedirect = false })
    {
        Timeout = TimeSpan.FromSeconds(10),
    };
    readonly SemaphoreSlim gate = new(1, 1);
    PortalSnapshot? cached;

    public async Task<PortalSnapshot> Get(bool force = false, CancellationToken ct = default)
    {
        if (!force && cached is { } current && DateTimeOffset.UtcNow - current.FetchedAt < TimeSpan.FromMinutes(5))
            return current;
        await gate.WaitAsync(ct);
        try
        {
            if (!force && cached is { } latest && DateTimeOffset.UtcNow - latest.FetchedAt < TimeSpan.FromMinutes(5))
                return latest;
            var serversTask = Read("servers", ParseServers, cached?.Servers ?? [], ct);
            var sponsorsTask = Read("sponsors", ParseSponsors, cached?.Sponsors ?? [], ct);
            var teamsTask = Read("teams", ParseTeams, cached?.Teams ?? [], ct);
            await Task.WhenAll(serversTask, sponsorsTask, teamsTask);
            var servers = await serversTask;
            var sponsors = await sponsorsTask;
            var teams = await teamsTask;
            cached = new(servers.Items, sponsors.Items, teams.Items,
                new[] { servers.Error, sponsors.Error, teams.Error }.OfType<PortalConfigError>().ToArray(), DateTimeOffset.UtcNow);
            return cached;
        }
        finally
        {
            gate.Release();
        }
    }

    async Task<(T[] Items, PortalConfigError? Error)> Read<T>(
        string source, Func<string, T[]> parse, T[] previous, CancellationToken ct)
    {
        try
        {
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
            timeout.CancelAfter(TimeSpan.FromSeconds(10));
            var url = BuildConfigUrl(config.Value.ManifestUrl, config.Value.ContentRepository,
                source + ".json", config.TestMode);
            using var request = new HttpRequestMessage(HttpMethod.Get, url);
            request.Headers.CacheControl = new() { NoCache = true };
            using var response = await Http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, timeout.Token);
            response.EnsureSuccessStatusCode();
            var bytes = await ReadLimited(response.Content, MaxConfigBytes, timeout.Token);
            return (parse(System.Text.Encoding.UTF8.GetString(bytes)), null);
        }
        catch (Exception ex) when (!ct.IsCancellationRequested &&
            ex is AppFault or HttpRequestException or OperationCanceledException or JsonException or IOException)
        {
            string code = ex is AppFault fault ? fault.Code : "PORTAL_UNAVAILABLE";
            return (previous, new(source, code, "Could not load " + source + ".json. " + ex.Message));
        }
    }

    public static string BuildConfigUrl(string manifestUrl, string repository, string filename, bool testMode = false)
    {
        if (filename is not ("servers.json" or "sponsors.json" or "teams.json") ||
            !Uri.TryCreate(manifestUrl, UriKind.Absolute, out var uri) ||
            uri.UserInfo.Length != 0 || uri.Fragment.Length != 0)
            throw new AppFault("UNTRUSTED_PORTAL_CONFIG", "Portal configuration must use the configured catalog location.");
        bool fixture = testMode && uri.Scheme == "http" && uri.Host == "127.0.0.1" && uri.Port == 32146;
        if (!fixture && (uri.Scheme != "https" || uri.Host != "raw.githubusercontent.com" ||
            !uri.IsDefaultPort || !Regex.IsMatch(repository, @"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$") ||
            !uri.AbsolutePath.StartsWith("/" + repository + "/", StringComparison.Ordinal) ||
            !uri.AbsolutePath.EndsWith("/content-repository/manifest.json", StringComparison.Ordinal)))
            throw new AppFault("UNTRUSTED_PORTAL_CONFIG", "Portal configuration must belong to the configured GitHub repository.");
        if (!uri.AbsolutePath.EndsWith("/manifest.json", StringComparison.Ordinal))
            throw new AppFault("UNTRUSTED_PORTAL_CONFIG", "The catalog URL must end with manifest.json.");
        return new UriBuilder(uri) { Path = uri.AbsolutePath[..^"manifest.json".Length] + filename, Query = "", Fragment = "" }.Uri.AbsoluteUri;
    }

    public static PortalServer[] ParseServers(string json)
    {
        var document = Deserialize<ServersDocument>(json, "INVALID_SERVERS")
            ?? throw new AppFault("INVALID_SERVERS", "Empty servers configuration.");
        if (document.Servers is null || document.Servers.Length > 32)
            throw new AppFault("INVALID_SERVERS", "servers must be an array containing at most 32 entries.");
        // Preserve the distinction between an omitted alias and an explicitly null alias.
        // Constructor binding alone maps both cases to null and would accept JSON the schema rejects.
        using var source = JsonDocument.Parse(json);
        var entries = source.RootElement.EnumerateObject()
            .Last(p => p.Name.Equals("servers", StringComparison.OrdinalIgnoreCase)).Value;
        foreach (var entry in entries.EnumerateArray())
        {
            if (entry.ValueKind != JsonValueKind.Object)
                continue;
            var addresses = entry.EnumerateObject().Where(p =>
                p.Name.Equals("ip", StringComparison.OrdinalIgnoreCase) ||
                p.Name.Equals("host", StringComparison.OrdinalIgnoreCase)).ToArray();
            if (addresses.Length != 1 || addresses[0].Value.ValueKind == JsonValueKind.Null)
                throw new AppFault("INVALID_SERVERS", "Each server must contain exactly one non-null ip or legacy host field.");
        }
        var ids = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var server in document.Servers)
        {
            if (server is null)
                throw new AppFault("INVALID_SERVERS", "Server entries must be objects.");
            ValidateId(server.Id, ids, "INVALID_SERVERS");
            ValidateText(server.Name, 120, false, "Server name", "INVALID_SERVERS");
            ValidateText(server.Description, 1000, true, "Server description", "INVALID_SERVERS");
            if (server.Image is not null)
                ValidateHttpsUrl(server.Image, "INVALID_SERVERS");
            ServerNetworkPolicy.ConfiguredAddress(server);
            if (server.HttpPort is < 1 or > 65535)
                throw new AppFault("INVALID_SERVERS", "httpPort must be between 1 and 65535.");
            if (server.LiveTimingUrl is not null)
                ValidateLiveTimingUrl(server.LiveTimingUrl, "INVALID_SERVERS");
            if (server.EmbedTiming && server.LiveTimingUrl is null)
                throw new AppFault("INVALID_SERVERS", "embedTiming requires a liveTimingUrl.");
        }
        return document.Servers;
    }

    public static PortalSponsor[] ParseSponsors(string json)
    {
        var document = Deserialize<SponsorsDocument>(json, "INVALID_SPONSORS")
            ?? throw new AppFault("INVALID_SPONSORS", "Empty sponsors configuration.");
        if (document.Sponsors is null || document.Sponsors.Length > 32)
            throw new AppFault("INVALID_SPONSORS", "sponsors must be an array containing at most 32 entries.");
        var ids = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var sponsor in document.Sponsors)
        {
            if (sponsor is null)
                throw new AppFault("INVALID_SPONSORS", "Sponsor entries must be objects.");
            ValidateId(sponsor.Id, ids, "INVALID_SPONSORS");
            ValidateText(sponsor.Name, 120, false, "Sponsor name", "INVALID_SPONSORS");
            ValidateHttpsUrl(sponsor.Logo, "INVALID_SPONSORS");
            ValidateHttpsUrl(sponsor.Url, "INVALID_SPONSORS");
            if (sponsor.Order is < 0 or > 10000)
                throw new AppFault("INVALID_SPONSORS", "Sponsor order must be between 0 and 10000.");
        }
        return document.Sponsors.OrderBy(s => s.Order).ThenBy(s => s.Id, StringComparer.Ordinal).ToArray();
    }

    public static PortalTeam[] ParseTeams(string json)
    {
        var document = Deserialize<TeamsDocument>(json, "INVALID_TEAMS")
            ?? throw new AppFault("INVALID_TEAMS", "Empty teams configuration.");
        if (document.Teams is null || document.Teams.Length > 32)
            throw new AppFault("INVALID_TEAMS", "teams must be an array containing at most 32 entries.");
        var ids = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var driverAliases = new HashSet<string>(StringComparer.Ordinal);
        var timingAliases = new HashSet<string>(StringComparer.Ordinal);
        foreach (var team in document.Teams)
        {
            if (team is null)
                throw new AppFault("INVALID_TEAMS", "Team entries must be objects.");
            ValidateId(team.Id, ids, "INVALID_TEAMS");
            ValidateText(team.Name, 120, false, "Team name", "INVALID_TEAMS");
            if (!Regex.IsMatch(team.Color ?? "", "^#[0-9A-Fa-f]{6}$"))
                throw new AppFault("INVALID_TEAMS", "Team color must be a six-digit hexadecimal color such as #E52E46.");
            ValidateHttpsUrl(team.Logo, "INVALID_TEAMS");
            if (team.DriverNames is null || team.DriverNames.Length > 100 ||
                team.LiveTimingNames is null || team.LiveTimingNames.Length > 100)
                throw new AppFault("INVALID_TEAMS", "Each team must have driverNames and liveTimingNames arrays with at most 100 entries.");
            foreach (var name in team.DriverNames)
            {
                ValidateText(name, 120, false, "Driver name", "INVALID_TEAMS");
                if (!driverAliases.Add(NormalizeTeamAlias(name)))
                    throw new AppFault("INVALID_TEAMS", "A driver name cannot be assigned to multiple teams.");
            }
            foreach (var name in team.LiveTimingNames)
            {
                ValidateText(name, 120, false, "Live timing team name", "INVALID_TEAMS");
                if (!timingAliases.Add(NormalizeTeamAlias(name)))
                    throw new AppFault("INVALID_TEAMS", "A live timing team name cannot be assigned to multiple teams.");
            }
        }
        return document.Teams;
    }

    static string NormalizeTeamAlias(string value) => string.Concat(value
        .Normalize(NormalizationForm.FormKD)
        .Where(c => CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark && char.IsLetterOrDigit(c)))
        .ToLowerInvariant();

    static void ValidateId(string id, HashSet<string> ids, string code)
    {
        if (id is null || !Regex.IsMatch(id, @"^[a-z0-9][a-z0-9-]{0,63}$") || !ids.Add(id))
            throw new AppFault(code, "Each entry requires a unique id using lowercase letters, numbers and hyphens.");
    }

    static void ValidateText(string? value, int max, bool optional, string label, string code)
    {
        if (optional && value is null)
            return;
        if (string.IsNullOrWhiteSpace(value) || value.Length > max || value.Any(char.IsControl))
            throw new AppFault(code, label + " is empty, too long or contains control characters.");
    }

    public static void ValidateHttpsUrl(string? value, string code = "INVALID_PORTAL_URL")
    {
        if (string.IsNullOrWhiteSpace(value) || value.Length > 2048 || value.Any(char.IsWhiteSpace) ||
            value.Contains('\\') || !Uri.TryCreate(value, UriKind.Absolute, out var uri) ||
            uri.Scheme != "https" || uri.UserInfo.Length != 0 || string.IsNullOrEmpty(uri.Host) ||
            value.Contains('@'))
            throw new AppFault(code, "Image, website and timing URLs must use HTTPS without credentials.");
        // These URLs are browser links/images only. The helper never fetches a configured timing URL.
    }

    public static void ValidateLiveTimingUrl(string? value, string code = "INVALID_PORTAL_URL")
    {
        if (IsLiveTimingJsonUrl(value))
        {
            var api = new Uri(value!);
            if (api.Scheme == Uri.UriSchemeHttp)
            {
                if (!IPAddress.TryParse(api.Host, out var address))
                    throw new AppFault(code, "HTTP live timing APIs must use a public IP address; use HTTPS for hostnames.");
                ServerNetworkPolicy.ValidateAddress(address, false);
            }
            else if (api.Scheme != Uri.UriSchemeHttps)
                throw new AppFault(code, "Live timing API URLs must use HTTP or HTTPS.");
            return;
        }
        ValidateHttpsUrl(value, code);
    }

    public static bool IsLiveTimingJsonUrl(string? value) =>
        !string.IsNullOrWhiteSpace(value) && value.Length <= 2048 && !value.Any(char.IsWhiteSpace) &&
        !value.Contains('\\') && Uri.TryCreate(value, UriKind.Absolute, out var uri) &&
        uri.UserInfo.Length == 0 && string.IsNullOrEmpty(uri.Fragment) &&
        uri.AbsolutePath.EndsWith(".json", StringComparison.OrdinalIgnoreCase) && !value.Contains('@');

    static T? Deserialize<T>(string json, string code)
    {
        try { return JsonSerializer.Deserialize<T>(json, StrictJson); }
        catch (JsonException ex) { throw new AppFault(code, "Invalid configuration JSON. " + ex.Message); }
    }

    internal static async Task<byte[]> ReadLimited(HttpContent content, int maxBytes, CancellationToken ct)
    {
        if (content.Headers.ContentLength > maxBytes)
            throw new AppFault("RESPONSE_TOO_LARGE", "The response exceeds its size limit.");
        await using var stream = await content.ReadAsStreamAsync(ct);
        using var output = new MemoryStream();
        var buffer = new byte[8192];
        int count;
        while ((count = await stream.ReadAsync(buffer, ct)) > 0)
        {
            if (output.Length + count > maxBytes)
                throw new AppFault("RESPONSE_TOO_LARGE", "The response exceeds its size limit.");
            output.Write(buffer, 0, count);
        }
        return output.ToArray();
    }

    sealed record ServersDocument(PortalServer[] Servers);
    sealed record SponsorsDocument(PortalSponsor[] Sponsors);
    sealed record TeamsDocument(PortalTeam[] Teams);
}
