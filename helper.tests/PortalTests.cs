using System.Net;
using System.Text.Json;
using Eurocup3;

public static class PortalTests
{
    public static void Run(Action<bool, string> assert, Action<Action, string> reject)
    {
        string ServerJson(PortalServer server) => JsonSerializer.Serialize(new { servers = new[] { server } }, Json.Options);
        var server = new PortalServer("ec3-practice", "Practice", "server.example.com", 8081,
            "Open practice", LiveTimingUrl: "https://timing.example.com/ec3", EmbedTiming: true);
        var parsed = PortalConfigService.ParseServers(ServerJson(server));
        assert(parsed.Length == 1 && parsed[0] == server, "portal preserves configured server identity, HTTP port and timing options");
        assert(PortalConfigService.ParseServers("{\"servers\":[]}").Length == 0 &&
            PortalConfigService.ParseSponsors("{\"sponsors\":[]}").Length == 0, "empty portal configurations are valid");
        assert(ServerService.BuildJoinUri(server) ==
            "acmanager://race/online/join?ip=server.example.com&httpPort=8081", "join URI uses CM's verified command and HTTP port");
        assert(ServerService.BuildJoinUri(server with { Host = "2001:4860:4860::8888" }).Contains("ip=2001%3A4860%3A4860%3A%3A8888"),
            "join URI encodes IPv6 host without injecting command parameters");
        reject(() => PortalConfigService.ParseServers(JsonSerializer.Serialize(new { servers = new[] { server, server } }, Json.Options)),
            "portal rejects duplicate server ids");
        reject(() => PortalConfigService.ParseServers("{}"), "portal requires its servers array");
        reject(() => PortalConfigService.ParseSponsors("{\"sponsors\":null}"), "portal rejects null sponsors array");
        reject(() => PortalConfigService.ParseServers("{\"servers\":[],\"command\":\"run.exe\"}"), "portal rejects arbitrary config properties");
        reject(() => PortalConfigService.ParseServers("not json"), "portal rejects malformed JSON with a config fault");
        reject(() => PortalConfigService.ParseServers(ServerJson(server with { HttpPort = 0 })), "portal rejects invalid HTTP port");
        reject(() => PortalConfigService.ParseServers(ServerJson(server with { Id = "Practice & run" })), "portal rejects unsafe server id");
        reject(() => PortalConfigService.ParseServers(ServerJson(server with { Host = "server.example.com/path" })), "server host cannot be an arbitrary URL path");
        reject(() => PortalConfigService.ParseServers(ServerJson(server with { Host = "server.example.com&password=secret" })), "server host cannot inject join arguments");
        reject(() => PortalConfigService.ParseServers(ServerJson(server with { LiveTimingUrl = null })), "embedding requires configured timing URL");
        reject(() => PortalConfigService.ParseServers(ServerJson(server with { LiveTimingUrl = "http://timing.example.com" })), "timing link requires HTTPS");
        reject(() => PortalConfigService.ParseServers(ServerJson(server with { LiveTimingUrl = "https://user:secret@timing.example.com" })), "timing link cannot include credentials");
        reject(() => PortalConfigService.ParseServers(ServerJson(server with { Host = "192.168.1.20" })), "LAN server requires explicit consent in config");
        assert(PortalConfigService.ParseServers(ServerJson(server with { Host = "192.168.1.20", AllowLan = true })).Length == 1,
            "explicitly configured private LAN server is supported");

        var sponsor = new PortalSponsor("sponsor-one", "Sponsor", "https://images.example.com/one.png", "https://sponsor.example.com", 10);
        var sponsors = PortalConfigService.ParseSponsors(JsonSerializer.Serialize(new { sponsors = new[]
        {
            sponsor, sponsor with { Id = "sponsor-two", Order = 2 },
        } }, Json.Options));
        assert(sponsors.Length == 2 && sponsors[0].Id == "sponsor-two" && sponsors[1] == sponsor,
            "portal sorts sponsors and preserves HTTPS logo and website");
        reject(() => PortalConfigService.ParseSponsors(JsonSerializer.Serialize(new { sponsors = new[] { sponsor, sponsor } }, Json.Options)),
            "portal rejects duplicate sponsor ids");
        reject(() => PortalConfigService.ParseSponsors(JsonSerializer.Serialize(new { sponsors = new[] { sponsor with { Logo = "data:image/png;base64,AAAA" } } }, Json.Options)),
            "sponsor logo requires public HTTPS URL");
        reject(() => PortalConfigService.ParseSponsors(JsonSerializer.Serialize(new { sponsors = new[] { sponsor with { Url = "https://@sponsor.example.com" } } }, Json.Options)),
            "sponsor URL cannot include an empty credential authority");
        reject(() => PortalConfigService.ParseSponsors("""
            {"sponsors":[{"id":"sponsor-one","name":"Sponsor","logo":"https://images.example.com/one.png"}]}
            """), "sponsor requires a website so every configured logo has an explicit destination");
        reject(() => PortalConfigService.ParseSponsors(JsonSerializer.Serialize(new { sponsors = new[] { sponsor with { Url = "http://sponsor.example.com" } } }, Json.Options)),
            "sponsor website must use HTTPS");

        const string manifest = "https://raw.githubusercontent.com/AdriaVesseur/EC3/main/content-repository/manifest.json";
        assert(PortalConfigService.BuildConfigUrl(manifest, "AdriaVesseur/EC3", "servers.json") ==
            "https://raw.githubusercontent.com/AdriaVesseur/EC3/main/content-repository/servers.json", "portal config derives trusted catalog directory");
        assert(PortalConfigService.BuildConfigUrl("http://127.0.0.1:32146/manifest.json", "AdriaVesseur/EC3", "sponsors.json", true) ==
            "http://127.0.0.1:32146/sponsors.json", "portal test fixture supports only dedicated catalog origin");
        reject(() => PortalConfigService.BuildConfigUrl("http://127.0.0.1:32146/manifest.json", "AdriaVesseur/EC3", "servers.json"),
            "portal loopback fixture is disabled outside test mode");
        reject(() => PortalConfigService.BuildConfigUrl(manifest.Replace("AdriaVesseur/EC3", "attacker/repo"), "AdriaVesseur/EC3", "servers.json"),
            "portal rejects a different repository");
        reject(() => PortalConfigService.BuildConfigUrl(manifest.Replace("raw.githubusercontent.com", "example.com"), "AdriaVesseur/EC3", "servers.json"),
            "portal rejects arbitrary config origins");
        reject(() => PortalConfigService.BuildConfigUrl(manifest, "AdriaVesseur/EC3", "../../secret"), "portal rejects arbitrary config filenames");

        ServerNetworkPolicy.ValidateAddress(IPAddress.Parse("8.8.8.8"), false);
        ServerNetworkPolicy.ValidateAddress(IPAddress.Parse("2001:4860:4860::8888"), false);
        assert(true, "public IPv4 and IPv6 server addresses are supported");
        foreach (var host in new[] { "127.0.0.1", "::1", "::ffff:127.0.0.1", "169.254.169.254", "fd00:ec2::254",
            "100.100.100.200", "168.63.129.16", "192.0.0.192", "0.0.0.0", "224.0.0.1", "fe80::1", "metadata.google.internal" })
            reject(() => ServerNetworkPolicy.ValidateHost(host, true), "block internal or metadata target even with LAN consent: " + host);
        reject(() => ServerNetworkPolicy.ValidateAddress(IPAddress.Parse("10.0.0.5"), false), "DNS resolution cannot bypass LAN policy");
        ServerNetworkPolicy.ValidateAddress(IPAddress.Parse("10.0.0.5"), true);
        assert(true, "DNS resolution supports explicitly approved LAN address");

        var info = ServerService.ParseInfo("""
            {"name":"EC3 server","track":"paul_ricard_2021","clients":12,"maxclients":24,
             "session":3,"timeleft":900,"cars":["ec3_car"],"pass":true,"drivers":[{"lap":99}]}
            """);
        assert(info.Name == "EC3 server" && info.Track == "paul_ricard_2021" && info.CurrentPlayers == 12 &&
            info.MaxPlayers == 24 && info.Session == 3 && info.TimeLeft == 900 && info.PasswordRequired == true &&
            info.Cars.SequenceEqual(new[] { "ec3_car" }), "AC /INFO fields are normalized without inventing timing data");
        var partial = ServerService.ParseInfo("{\"name\":\"AC\"}");
        assert(partial.CurrentPlayers is null && partial.TimeLeft is null && partial.Cars.Length == 0,
            "missing AC information remains unknown");
        var cachedStates = new ServersSnapshot(
            [
                new(server, "offline", null, new("SERVER_TIMEOUT", "Timeout"), DateTimeOffset.UtcNow, true),
                new(server with { Id = "ec3-race" }, "online", info, null, DateTimeOffset.UtcNow, false),
            ], false, [], DateTimeOffset.UtcNow);
        var cmPresent = ServerService.WithContentManagerAvailability(cachedStates, true);
        assert(!cmPresent.Servers[0].JoinAvailable && cmPresent.Servers[1].JoinAvailable &&
            cmPresent.Servers[0].Error == cachedStates.Servers[0].Error && cmPresent.Servers[1].Info == info,
            "cached offline status never enables Join when Content Manager becomes available");
        var cmMissing = ServerService.WithContentManagerAvailability(cmPresent, false);
        assert(!cmMissing.ContentManagerAvailable && cmMissing.Servers.All(s => !s.JoinAvailable),
            "cached online status disables Join when Content Manager registration disappears");
        reject(() => ServerService.ParseInfo("{}"), "unrelated empty JSON is not an online AC status");
        reject(() => ServerService.ParseInfo("not json"), "invalid server JSON is isolated as response fault");
        reject(() => ServerService.ParseInfo("{\"clients\":\"12\"}"), "wrong numeric server field type is rejected");
        reject(() => ServerService.ParseInfo("{\"clients\":-1}"), "negative connected player count is rejected");
        reject(() => ServerService.ParseInfo("{\"name\":\"AC\",\"cars\":[{}]}"), "malformed server car identifiers are rejected");
    }
}
