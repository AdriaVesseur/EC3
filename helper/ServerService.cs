using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Win32;

namespace Eurocup3;

public sealed record ServerInfo(
    string? Name,
    string? Track,
    int? CurrentPlayers,
    int? MaxPlayers,
    int? Session,
    long? TimeLeft,
    string[] Cars,
    bool? PasswordRequired
);
public sealed record ServerError(string Code, string Message);
public sealed record ServerStatus(
    PortalServer Server,
    string State,
    ServerInfo? Info,
    ServerError? Error,
    DateTimeOffset CheckedAt,
    bool JoinAvailable
);
public sealed record ServersSnapshot(
    ServerStatus[] Servers,
    bool ContentManagerAvailable,
    PortalConfigError[] Errors,
    DateTimeOffset CheckedAt
)
{
    public bool AssettoCorsaAvailable { get; init; }
}
public sealed record ServerJoinResult(string ServerId, bool Launched, string Message);

public sealed class ServerService(PortalConfigService portal, AssettoDetectionService assetto)
{
    readonly SemaphoreSlim gate = new(1, 1);
    ServersSnapshot? cached;
    PortalServer[] cachedConfig = [];

    public async Task<ServersSnapshot> Get(bool force = false, CancellationToken ct = default)
    {
        var configuration = await portal.Get(force, ct);
        bool available = IsLaunchable(assetto.Find());
        bool contentManagerAvailable = ContentManagerAvailable();
        if (!force && cached is { } current && configuration.Servers.SequenceEqual(cachedConfig) &&
            DateTimeOffset.UtcNow - current.CheckedAt < TimeSpan.FromSeconds(15))
            return WithAvailability(current, available, contentManagerAvailable) with { Errors = configuration.Errors };
        await gate.WaitAsync(ct);
        try
        {
            if (!force && cached is { } latest && configuration.Servers.SequenceEqual(cachedConfig) &&
                DateTimeOffset.UtcNow - latest.CheckedAt < TimeSpan.FromSeconds(15))
                return WithAvailability(latest, available, contentManagerAvailable) with { Errors = configuration.Errors };
            using var concurrency = new SemaphoreSlim(4, 4);
            var tasks = configuration.Servers.Select(async server =>
            {
                await concurrency.WaitAsync(ct);
                try { return await Query(server, available, ct); }
                finally { concurrency.Release(); }
            }).ToArray();
            var states = await Task.WhenAll(tasks);
            cachedConfig = configuration.Servers;
            cached = new(states, contentManagerAvailable, configuration.Errors, DateTimeOffset.UtcNow)
            {
                AssettoCorsaAvailable = available,
            };
            return cached;
        }
        finally
        {
            gate.Release();
        }
    }

    static async Task<ServerStatus> Query(PortalServer server, bool available, CancellationToken ct)
    {
        try
        {
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
            timeout.CancelAfter(TimeSpan.FromSeconds(8));
            var info = await FetchInfo(server, timeout.Token);
            return new(server, "online", info, null, DateTimeOffset.UtcNow, available);
        }
        catch (Exception ex) when (!ct.IsCancellationRequested &&
            ex is AppFault or HttpRequestException or SocketException or OperationCanceledException or JsonException or IOException)
        {
            string code = ex switch
            {
                AppFault fault => fault.Code,
                OperationCanceledException => "SERVER_TIMEOUT",
                JsonException => "SERVER_INVALID_RESPONSE",
                _ => "SERVER_UNAVAILABLE",
            };
            string message = ex is AppFault ? ex.Message : code == "SERVER_TIMEOUT"
                ? "The server did not respond within eight seconds."
                : "Could not read this Assetto Corsa server's /INFO status.";
            return new(server, "offline", null, new(code, message), DateTimeOffset.UtcNow, false);
        }
    }

    public static ServersSnapshot WithContentManagerAvailability(ServersSnapshot snapshot, bool available) =>
        snapshot with
        {
            ContentManagerAvailable = available,
            Servers = snapshot.Servers.Select(s => s with { JoinAvailable = available && s.State == "online" }).ToArray(),
        };

    static ServersSnapshot WithAvailability(ServersSnapshot snapshot, bool assettoAvailable, bool contentManagerAvailable) =>
        snapshot with
        {
            AssettoCorsaAvailable = assettoAvailable,
            ContentManagerAvailable = contentManagerAvailable,
            Servers = snapshot.Servers.Select(s => s with { JoinAvailable = assettoAvailable && s.State == "online" }).ToArray(),
        };

    static async Task<ServerInfo> FetchInfo(PortalServer server, CancellationToken ct)
    {
        string addressText = ServerNetworkPolicy.ConfiguredAddress(server);
        var addresses = IPAddress.TryParse(addressText, out var literal)
            ? new[] { literal }
            : await Dns.GetHostAddressesAsync(addressText, ct);
        if (addresses.Length is 0 or > 16)
            throw new AppFault("SERVER_ADDRESS_BLOCKED", "The configured host did not resolve to an allowed server address.");
        foreach (var address in addresses)
            ServerNetworkPolicy.ValidateAddress(address, server.AllowLan);

        // Connect to the validated DNS results, rather than resolving again during HTTP connection.
        // Redirects and proxies are disabled so /INFO cannot lead to an unrelated host.
        using var handler = new SocketsHttpHandler
        {
            AllowAutoRedirect = false,
            UseProxy = false,
            MaxResponseHeadersLength = 16,
            ConnectCallback = async (context, cancellation) =>
            {
                Exception? last = null;
                foreach (var address in addresses.Take(4))
                {
                    var socket = new Socket(address.AddressFamily, SocketType.Stream, ProtocolType.Tcp);
                    try
                    {
                        await socket.ConnectAsync(new IPEndPoint(address, server.HttpPort), cancellation);
                        return new NetworkStream(socket, ownsSocket: true);
                    }
                    catch (Exception ex) when (ex is SocketException or OperationCanceledException)
                    {
                        socket.Dispose();
                        cancellation.ThrowIfCancellationRequested();
                        last = ex;
                    }
                }
                throw new HttpRequestException("Could not connect to the configured AC server.", last);
            },
        };
        using var http = new HttpClient(handler) { Timeout = Timeout.InfiniteTimeSpan };
        var uri = new UriBuilder("http", addressText, server.HttpPort, "/INFO").Uri;
        using var response = await http.GetAsync(uri, HttpCompletionOption.ResponseHeadersRead, ct);
        response.EnsureSuccessStatusCode();
        var bytes = await PortalConfigService.ReadLimited(response.Content, 256 * 1024, ct);
        return ParseInfo(System.Text.Encoding.UTF8.GetString(bytes));
    }

    public async Task<ServerJoinResult> Join(string id, CancellationToken ct = default)
    {
        var configuration = await portal.Get(ct: ct);
        var server = configuration.Servers.FirstOrDefault(s => s.Id == id)
            ?? throw new AppFault("SERVER_NOT_FOUND", "This server is not in servers.json.");
        string gameRoot = assetto.Require();
        string executable = Path.Combine(gameRoot, "AssettoCorsa.exe");
        if (!File.Exists(executable))
            throw new AppFault("ASSETTO_LAUNCHER_NOT_FOUND", "Assetto Corsa was detected, but AssettoCorsa.exe is missing from the selected game folder.");
        ct.ThrowIfCancellationRequested();
        try
        {
            using var process = Process.Start(new ProcessStartInfo(executable)
            {
                WorkingDirectory = gameRoot,
                UseShellExecute = true,
            });
            if (process is null)
                throw new InvalidOperationException("Windows did not start Assetto Corsa.");
            return new(server.Id, true, "Assetto Corsa has opened. Select Online > Direct Connect in the game to finish joining.");
        }
        catch (Exception ex) when (ex is System.ComponentModel.Win32Exception or InvalidOperationException)
        {
            throw new AppFault("ASSETTO_LAUNCH_FAILED", "Windows could not open Assetto Corsa. " + ex.Message);
        }
    }

    static bool IsLaunchable(string? root) =>
        OperatingSystem.IsWindows() && root is not null && File.Exists(Path.Combine(root, "AssettoCorsa.exe"));

    public static string BuildJoinUri(PortalServer server)
    {
        string addressText = ServerNetworkPolicy.ConfiguredAddress(server);
        if (server.HttpPort is < 1 or > 65535)
            throw new AppFault("INVALID_SERVERS", "The Content Manager join command requires a valid HTTP port.");
        return "acmanager://race/online/join?ip=" + Uri.EscapeDataString(addressText) +
            "&httpPort=" + server.HttpPort.ToString(System.Globalization.CultureInfo.InvariantCulture);
    }

    public static bool ContentManagerAvailable()
    {
        if (!OperatingSystem.IsWindows())
            return false;
        try
        {
            using var registration = Registry.ClassesRoot.OpenSubKey("acmanager");
            using var commandKey = registration?.OpenSubKey(@"shell\open\command");
            if (registration?.GetValue("URL Protocol") is null || commandKey?.GetValue(null) is not string command)
                return false;
            var match = Regex.Match(command, @"^\s*(?:""(?<path>[^""]+\.exe)""|(?<path>[^\s""]+\.exe))(?:\s|$)", RegexOptions.IgnoreCase);
            return match.Success && File.Exists(Environment.ExpandEnvironmentVariables(match.Groups["path"].Value));
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or System.Security.SecurityException)
        {
            return false;
        }
    }

    public static ServerInfo ParseInfo(string json)
    {
        JsonDocument document;
        try { document = JsonDocument.Parse(json); }
        catch (JsonException ex) { throw new AppFault("SERVER_INVALID_RESPONSE", "Invalid /INFO JSON. " + ex.Message); }
        using var documentLifetime = document;
        var root = document.RootElement;
        if (root.ValueKind != JsonValueKind.Object)
            throw new AppFault("SERVER_INVALID_RESPONSE", "/INFO must return a JSON object.");
        string? Text(string key, int limit)
        {
            if (!root.TryGetProperty(key, out var value) || value.ValueKind == JsonValueKind.Null)
                return null;
            if (value.ValueKind != JsonValueKind.String || value.GetString()!.Length > limit)
                throw new AppFault("SERVER_INVALID_RESPONSE", "Invalid /INFO " + key + " field.");
            return value.GetString();
        }
        long? Number(string key, long minimum, long maximum)
        {
            if (!root.TryGetProperty(key, out var value) || value.ValueKind == JsonValueKind.Null)
                return null;
            if (value.ValueKind != JsonValueKind.Number || !value.TryGetInt64(out var number) || number < minimum || number > maximum)
                throw new AppFault("SERVER_INVALID_RESPONSE", "Invalid /INFO " + key + " field.");
            return number;
        }
        bool? password = null;
        if (root.TryGetProperty("pass", out var passwordValue) && passwordValue.ValueKind != JsonValueKind.Null)
        {
            if (passwordValue.ValueKind is not (JsonValueKind.True or JsonValueKind.False))
                throw new AppFault("SERVER_INVALID_RESPONSE", "Invalid /INFO pass field.");
            password = passwordValue.GetBoolean();
        }
        string[] cars = [];
        if (root.TryGetProperty("cars", out var carValues) && carValues.ValueKind != JsonValueKind.Null)
        {
            if (carValues.ValueKind != JsonValueKind.Array || carValues.GetArrayLength() > 128)
                throw new AppFault("SERVER_INVALID_RESPONSE", "Invalid /INFO cars field.");
            cars = carValues.EnumerateArray().Select(car => car.ValueKind == JsonValueKind.String &&
                car.GetString()!.Length <= 160 ? car.GetString()! : throw new AppFault("SERVER_INVALID_RESPONSE", "Invalid /INFO car identifier.")).ToArray();
        }
        var info = new ServerInfo(Text("name", 256), Text("track", 256),
            (int?)Number("clients", 0, 1000), (int?)Number("maxclients", 0, 1000),
            (int?)Number("session", 0, 255), Number("timeleft", -86400, 31536000), cars, password);
        if (info.Name is null && info.Track is null && info.CurrentPlayers is null && info.MaxPlayers is null && cars.Length == 0)
            throw new AppFault("SERVER_INVALID_RESPONSE", "The response does not contain Assetto Corsa /INFO fields.");
        return info;
    }
}

public static class ServerNetworkPolicy
{
    public static string ConfiguredAddress(PortalServer server)
    {
        if ((server.Ip is null) == (server.Host is null))
            throw new AppFault("INVALID_SERVERS", "Configure one ip address, or one legacy host, never both.");
        if (server.Ip is { } ip)
        {
            ValidateIp(ip, server.AllowLan);
            return ip;
        }
        ValidateHost(server.Host, server.AllowLan);
        return server.Host!;
    }

    public static void ValidateIp(string? ip, bool allowLan)
    {
        if (string.IsNullOrWhiteSpace(ip) || ip.Length > 45 || ip.Any(char.IsWhiteSpace) ||
            !IPAddress.TryParse(ip, out var address) ||
            (address.AddressFamily == AddressFamily.InterNetwork &&
                !Regex.IsMatch(ip, @"^(?:0|[1-9][0-9]{0,2})(?:\.(?:0|[1-9][0-9]{0,2})){3}$")) ||
            (address.AddressFamily == AddressFamily.InterNetworkV6 &&
                (!ip.Contains(':') || !Regex.IsMatch(ip, @"^[0-9A-Fa-f:.]+$"))))
            throw new AppFault("INVALID_SERVERS", "ip must contain a literal IPv4 or IPv6 address without a URL, brackets, port or hostname.");
        ValidateAddress(address, allowLan);
    }

    public static void ValidateHost(string? host, bool allowLan)
    {
        if (string.IsNullOrWhiteSpace(host) || host.Length > 253 || host != host.Trim() ||
            host.Contains('%') || host.Any(char.IsWhiteSpace))
            throw new AppFault("INVALID_SERVERS", "host must be an IP address or a hostname without a URL, port or credentials.");
        if (IPAddress.TryParse(host, out var address))
        {
            ValidateAddress(address, allowLan);
            return;
        }
        if (!Regex.IsMatch(host, @"^(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$") ||
            host.Equals("localhost", StringComparison.OrdinalIgnoreCase) || host.EndsWith(".localhost", StringComparison.OrdinalIgnoreCase) ||
            host.Equals("metadata.google.internal", StringComparison.OrdinalIgnoreCase) ||
            host.Equals("instance-data", StringComparison.OrdinalIgnoreCase) ||
            (!allowLan && !host.Contains('.')))
            throw new AppFault("SERVER_ADDRESS_BLOCKED", "This hostname is not an allowed AC server address.");
    }

    public static void ValidateAddress(IPAddress address, bool allowLan)
    {
        if (address.IsIPv4MappedToIPv6)
            address = address.MapToIPv4();
        var bytes = address.GetAddressBytes();
        bool blocked;
        bool local;
        if (address.AddressFamily == AddressFamily.InterNetwork)
        {
            blocked = bytes[0] is 0 or 127 || bytes[0] >= 224 || (bytes[0] == 169 && bytes[1] == 254) ||
                address.Equals(IPAddress.Parse("100.100.100.200")) || address.Equals(IPAddress.Parse("168.63.129.16")) ||
                address.Equals(IPAddress.Parse("192.0.0.192"));
            local = bytes[0] == 10 || (bytes[0] == 172 && bytes[1] is >= 16 and <= 31) ||
                (bytes[0] == 192 && bytes[1] == 168) || (bytes[0] == 100 && bytes[1] is >= 64 and <= 127) ||
                (bytes[0] == 198 && bytes[1] is 18 or 19);
        }
        else if (address.AddressFamily == AddressFamily.InterNetworkV6)
        {
            local = (bytes[0] & 0xfe) == 0xfc || address.IsIPv6SiteLocal;
            blocked = IPAddress.IsLoopback(address) || address.Equals(IPAddress.IPv6Any) ||
                address.IsIPv6LinkLocal || address.IsIPv6Multicast || address.ScopeId != 0 ||
                address.Equals(IPAddress.Parse("fd00:ec2::254")) || (!local && (bytes[0] & 0xe0) != 0x20);
        }
        else
        {
            blocked = true;
            local = false;
        }
        if (blocked || (local && !allowLan))
            throw new AppFault("SERVER_ADDRESS_BLOCKED", "Loopback, link-local, cloud metadata and unapproved LAN addresses cannot be queried.");
    }
}
