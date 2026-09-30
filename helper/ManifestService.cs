using System.Text.Json;
using System.Text.RegularExpressions;

namespace Eurocup3;

public sealed class ManifestService(ConfigService config)
{
    public Catalog? Current
    {
        get; private set;
    }
    public string? LastError
    {
        get; private set;
    }
    readonly SemaphoreSlim gate = new(1);

    public async Task<Catalog> Refresh(CancellationToken ct = default)
    {
        await gate.WaitAsync(ct);
        try
        {
            using var http = new HttpClient(new HttpClientHandler { AllowAutoRedirect = false })
            {
                Timeout = TimeSpan.FromSeconds(30),
            };
            async Task<T> Read<T>(string url)
            {
                ValidateCatalogUrl(url);
                using var r = await http.GetAsync(
                    url,
                    HttpCompletionOption.ResponseHeadersRead,
                    ct
                );
                r.EnsureSuccessStatusCode();
                if (r.Content.Headers.ContentLength > 4 * 1024 * 1024)
                    throw new AppFault("INVALID_MANIFEST", "Catalog exceeds 4 MB.");
                await using var s = await r.Content.ReadAsStreamAsync(ct);
                using var ms = new MemoryStream();
                var buffer = new byte[8192];
                int n;
                while ((n = await s.ReadAsync(buffer, ct)) > 0)
                {
                    if (ms.Length + n > 4 * 1024 * 1024)
                        throw new AppFault("INVALID_MANIFEST", "Catalog exceeds 4 MB.");
                    ms.Write(buffer, 0, n);
                }
                return JsonSerializer.Deserialize<T>(ms.ToArray(), Json.Options)
                    ?? throw new AppFault("INVALID_MANIFEST", "Empty catalog.");
            }
            var draft = await Read<ManifestDraft>(config.Value.ManifestUrl);
            var c = await Read<Championship>(config.Value.ChampionshipUrl);
            var packages = new List<Package>();
            foreach (var item in draft.Content)
            {
                ValidateIcon(item.Icon);
                ValidateImage(item.Image);
                if (item.Download.Contains("REPLACE-ME", StringComparison.Ordinal))
                    continue;

                ValidateDownload(item.Download);
                string metadataUrl = GeneratedMetadataUrl(
                    config.Value.ManifestUrl,
                    item.Id,
                    item.Version
                );
                var metadata = await Read<GeneratedPackageMetadata>(metadataUrl);
                packages.Add(NormalizePackage(item, metadata));
            }
            var m = new Manifest(draft.Championship, draft.Season, draft.Build, packages.ToArray(), draft.Demo);
            Validate(m, c);
            Current = new(m, c, DateTimeOffset.UtcNow);
            LastError = null;
            return Current;
        }
        catch (Exception ex)
        {
            LastError = ex.Message;
            throw new AppFault(
                "GITHUB_UNAVAILABLE",
                "Could not load a valid championship catalog. " + ex.Message
            );
        }
        finally
        {
            gate.Release();
        }
    }

    static string GeneratedMetadataUrl(string manifestUrl, string id, string version)
    {
        var uri = new Uri(manifestUrl);
        string filename = Uri.EscapeDataString(id + "-" + version + ".json");
        if (uri.Scheme == "http" && uri.Host == "127.0.0.1" && uri.Port == 32146)
            return new Uri(uri, "generated/" + filename).ToString();
        var marker = "/content-repository/manifest.json";
        if (!uri.AbsolutePath.EndsWith(marker, StringComparison.Ordinal))
            throw new AppFault("INVALID_MANIFEST_URL", "Manifest URL must end in content-repository/manifest.json.");
        var path = uri.AbsolutePath[..^"manifest.json".Length]
            + "generated/"
            + filename;
        return new UriBuilder(uri) { Path = path }.Uri.ToString();
    }

    public Catalog Require() =>
        Current
        ?? throw new AppFault("CATALOG_UNAVAILABLE", "Refresh the championship catalog first.");

    public async Task<Championship> ReadChampionship(CancellationToken ct = default)
    {
        ValidateCatalogUrl(config.Value.ChampionshipUrl);
        using var http = new HttpClient(new HttpClientHandler { AllowAutoRedirect = false })
        {
            Timeout = TimeSpan.FromSeconds(20),
        };
        using var response = await http.GetAsync(config.Value.ChampionshipUrl, ct);
        response.EnsureSuccessStatusCode();
        if (response.Content.Headers.ContentLength > 1024 * 1024)
            throw new AppFault("INVALID_CHAMPIONSHIP", "Championship configuration exceeds 1 MB.");
        var json = await response.Content.ReadAsStringAsync(ct);
        if (json.Length > 1024 * 1024)
            throw new AppFault("INVALID_CHAMPIONSHIP", "Championship configuration exceeds 1 MB.");
        var championship = JsonSerializer.Deserialize<Championship>(json, Json.Options)
            ?? throw new AppFault("INVALID_CHAMPIONSHIP", "Championship configuration is empty.");
        if (championship.ResultsUrl != null)
            ResultsService.ValidateSourceUrl(championship.ResultsUrl);
        return championship;
    }

    public static Package NormalizePackage(PackageDraft item, GeneratedPackageMetadata metadata)
    {
        if (metadata.Id != item.Id || metadata.Version != item.Version)
            throw new AppFault(
                "INVALID_PACKAGE_METADATA",
                $"Generated metadata does not match {item.Id} v{item.Version}."
            );
        ValidateIcon(item.Icon);
        ValidateImage(item.Image);
        return new Package(
            item.Id,
            item.Name,
            item.Type,
            item.Version,
            item.Download,
            metadata.Size,
            metadata.Sha256,
            metadata.InstallPath,
            item.Required,
            metadata.Files,
            [],
            item.Description,
            item.Changelog,
            Icon: item.Icon,
            Image: item.Image
        );
    }

    public static void ValidateIcon(string? url)
    {
        if (url is null)
            return;
        if (
            url.Length > 2048
            || url.Any(char.IsWhiteSpace)
            || url.Contains('\\')
            || Regex.IsMatch(url, @"^https://[^/?#]*@", RegexOptions.IgnoreCase)
            || !Uri.TryCreate(url, UriKind.Absolute, out var uri)
            || uri.Scheme != "https"
            || uri.UserInfo != ""
            || string.IsNullOrEmpty(uri.Host)
        )
            throw new AppFault("INVALID_ICON", "Package icons must use an HTTPS URL without credentials.");
    }

    public static void ValidateImage(string? url)
    {
        if (url is null)
            return;
        if (
            url.Length > 2048
            || url.Any(char.IsWhiteSpace)
            || url.Contains('\\')
            || Regex.IsMatch(url, @"^https://[^/?#]*@", RegexOptions.IgnoreCase)
            || !Uri.TryCreate(url, UriKind.Absolute, out var uri)
            || uri.Scheme != "https"
            || uri.UserInfo != ""
            || string.IsNullOrEmpty(uri.Host)
        )
            throw new AppFault("INVALID_IMAGE", "Package photos must use an HTTPS URL without credentials.");
    }

    void ValidateCatalogUrl(string url)
    {
        var u = new Uri(url);
        if (config.TestMode && u.Scheme == "http" && u.Host == "127.0.0.1" && u.Port == 32146)
            return;
        if (
            u.Scheme != "https"
            || u.Host != "raw.githubusercontent.com"
            || !u.AbsolutePath.StartsWith(
                "/" + config.Value.ContentRepository + "/",
                StringComparison.Ordinal
            )
            || u.UserInfo != ""
            || !u.IsDefaultPort
        )
            throw new AppFault(
                "UNTRUSTED_CATALOG",
                "Catalog must belong to the configured GitHub repository."
            );
    }

    public void ValidateDownload(string url, bool redirect = false)
    {
        var u = new Uri(url);
        if (config.TestMode && u.Scheme == "http" && u.Host == "127.0.0.1" && u.Port == 32146)
            return;
        if (u.Scheme != "https" || u.UserInfo != "" || !u.IsDefaultPort)
            throw new AppFault("UNTRUSTED_URL", "Only HTTPS GitHub release downloads are allowed.");
        if (
            redirect
            && u.Host is "release-assets.githubusercontent.com" or "objects.githubusercontent.com"
        )
            return;
        if (
            u.Host != "github.com"
            || !u.AbsolutePath.StartsWith(
                "/" + config.Value.ContentRepository + "/releases/download/",
                StringComparison.Ordinal
            )
        )
            throw new AppFault(
                "UNTRUSTED_URL",
                "Package must be a release asset of the trusted content repository."
            );
    }

    public void Validate(Manifest m, Championship c)
    {
        if (
            m.Content is null
            || c.RequiredContent is null
            || c.Events is null
            || m.Content.Length > 500
            || !Versions.Valid(m.Build)
            || !Versions.Valid(c.Build)
            || m.Build != c.Build
            || m.Season != c.Season
            || !Versions.Valid(c.MinimumHelperVersion)
        )
            throw new AppFault("INVALID_MANIFEST", "Invalid or inconsistent championship build.");
        if (c.ResultsUrl != null)
            ResultsService.ValidateSourceUrl(c.ResultsUrl);
        var ids = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var paths = new List<string>();
        foreach (var p in m.Content)
        {
            if (
                !Regex.IsMatch(p.Id ?? "", @"^[a-z0-9][a-z0-9-]{1,63}$")
                || !ids.Add(p.Id!)
                || string.IsNullOrWhiteSpace(p.Name)
                || !Versions.Valid(p.Version)
                || !new[] { "car", "track", "app", "config" }.Contains(p.Type)
                || p.Size <= 0
                || p.Size > 2L * 1024 * 1024 * 1024
                || !HashService.Valid(p.Sha256)
                || p.Files is null
                || p.Files.Length is 0 or > 100000
                || p.Dependencies is null
            )
                throw new AppFault("INVALID_MANIFEST", "Invalid package metadata.");
            Paths.Install(p.InstallPath);
            var prefix = p.Type switch
            {
                "car" => "content/cars/",
                "track" => "content/tracks/",
                "app" => "apps/python/",
                _ => "extension/config/",
            };
            if (!p.InstallPath.StartsWith(prefix, StringComparison.Ordinal))
                throw new AppFault("UNSAFE_PATH", "Package type and install folder disagree.");
            if (
                paths.Any(x =>
                    x.Equals(p.InstallPath, StringComparison.OrdinalIgnoreCase)
                    || x.StartsWith(p.InstallPath + "/", StringComparison.OrdinalIgnoreCase)
                    || p.InstallPath.StartsWith(x + "/", StringComparison.OrdinalIgnoreCase)
                )
            )
                throw new AppFault("PATH_COLLISION", "Package folders overlap.");
            paths.Add(p.InstallPath);
            ValidateDownload(p.Download);
            ValidateIcon(p.Icon);
            ValidateImage(p.Image);
            if (p.MinimumCspVersion != null && !Versions.Valid(p.MinimumCspVersion))
                throw new AppFault("INVALID_VERSION", "Invalid CSP requirement.");
            var files = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            long size = 0;
            foreach (var f in p.Files)
            {
                Paths.Relative(f.Path);
                if (f.ArchivePath != null)
                    Paths.Relative(f.ArchivePath);
                if (
                    !files.Add(f.Path)
                    || !HashService.Valid(f.Sha256)
                    || f.Size < 0
                    || f.Size > 8L * 1024 * 1024 * 1024
                )
                    throw new AppFault("INVALID_MANIFEST", "Invalid file inventory.");
                size = checked(size + f.Size);
            }
            if (size > 20L * 1024 * 1024 * 1024)
                throw new AppFault("INVALID_MANIFEST", "Expanded package exceeds 20 GB.");
            foreach (var f in files)
                if (files.Any(x => x.StartsWith(f + "/", StringComparison.OrdinalIgnoreCase)))
                    throw new AppFault("PATH_COLLISION", "A file is also used as a directory.");
            foreach (var d in p.Dependencies)
                if (!Versions.Valid(d.MinimumVersion))
                    throw new AppFault("INVALID_VERSION", "Invalid dependency version.");
        }
        Dependencies.Resolve(m, m.Content.Select(p => p.Id));
        Dependencies.Resolve(m, c.RequiredContent);
        if (c.Events.Select(e => e.Id).Distinct().Count() != c.Events.Length)
            throw new AppFault("INVALID_MANIFEST", "Duplicate event IDs.");
        foreach (var e in c.Events)
            Dependencies.Resolve(m, e.RequiredContent);
    }
}
