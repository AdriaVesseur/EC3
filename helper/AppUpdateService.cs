using System.Net;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;

namespace Eurocup3;

public sealed record AppUpdateInfo(
    string CurrentVersion,
    string Version,
    bool Available,
    string? Url,
    string? DownloadUrl,
    string? Notes,
    DateTimeOffset? PublishedAt,
    bool Published,
    DateTimeOffset CheckedAt
)
{
    public bool AutomaticInstall => false;
}

public sealed class AppRelease
{
    [JsonPropertyName("tag_name")]
    public string TagName { get; set; } = "";
    public bool Draft { get; set; }
    public bool Prerelease { get; set; }
    [JsonPropertyName("html_url")]
    public string? Url { get; set; }
    [JsonPropertyName("body")]
    public string? Notes { get; set; }
    [JsonPropertyName("published_at")]
    public DateTimeOffset? PublishedAt { get; set; }
    public AppReleaseAsset[] Assets { get; set; } = [];
}

public sealed class AppReleaseAsset
{
    public string Name { get; set; } = "";
    public string State { get; set; } = "";
    [JsonPropertyName("browser_download_url")]
    public string? DownloadUrl { get; set; }
}

public sealed class AppUpdateService
{
    public const string InstallerName = "Eurocup3-Helper-Setup.exe";
    const int PageSize = 100;
    const int MaximumPages = 20;
    const int MaximumPageBytes = 8 * 1024 * 1024;
    static readonly TimeSpan CacheDuration = TimeSpan.FromMinutes(10);
    static readonly Regex RepositoryPattern = new(
        @"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$",
        RegexOptions.CultureInvariant
    );
    static readonly Regex AppTagPattern = new(
        @"^(?:app-v|v)((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))$",
        RegexOptions.CultureInvariant
    );
    static readonly HttpClient SharedHttp = new(
        new HttpClientHandler { AllowAutoRedirect = false }
    ) { Timeout = TimeSpan.FromSeconds(15) };

    readonly string repository;
    readonly string currentVersion;
    readonly HttpClient http;
    readonly TimeProvider clock;
    readonly SemaphoreSlim gate = new(1);
    Dictionary<int, ReleasePage> pages = [];
    AppUpdateInfo? cached;
    DateTimeOffset retryAt;
    AppFault? lastFailure;

    public AppUpdateService(ConfigService config)
        : this(config.Value.HelperRepository, Program.Version) { }

    public AppUpdateService(
        string repository,
        string currentVersion,
        HttpClient? http = null,
        TimeProvider? clock = null
    )
    {
        if (!RepositoryPattern.IsMatch(repository) || repository.Split('/').Any(x => x is "." or ".."))
            throw new AppFault("INVALID_CONFIG", "Invalid app release repository.");
        if (!Versions.Valid(currentVersion))
            throw new AppFault("INVALID_VERSION", "Invalid current app version.");
        this.repository = repository;
        this.currentVersion = currentVersion;
        this.http = http ?? SharedHttp;
        this.clock = clock ?? TimeProvider.System;
    }

    public async Task<AppUpdateInfo> Check(CancellationToken ct = default)
    {
        await gate.WaitAsync(ct);
        try
        {
            var now = clock.GetUtcNow();
            if (cached is not null && now - cached.CheckedAt < CacheDuration)
                return cached;
            if (lastFailure is not null && now < retryAt)
                throw new AppFault(lastFailure.Code, lastFailure.Message);

            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
            timeout.CancelAfter(TimeSpan.FromSeconds(30));
            var releases = new List<AppRelease>();
            var checkedPages = new Dictionary<int, ReleasePage>();
            for (int page = 1; page <= MaximumPages; page++)
            {
                using var request = new HttpRequestMessage(
                    HttpMethod.Get,
                    $"https://api.github.com/repos/{repository}/releases?per_page={PageSize}&page={page}"
                );
                request.Headers.UserAgent.ParseAdd("Eurocup3-Helper/" + currentVersion);
                request.Headers.Accept.ParseAdd("application/vnd.github+json");
                request.Headers.Add("X-GitHub-Api-Version", "2026-03-10");
                pages.TryGetValue(page, out var previous);
                if (previous?.ETag is not null)
                    request.Headers.TryAddWithoutValidation("If-None-Match", previous.ETag);

                using var response = await http.SendAsync(
                    request,
                    HttpCompletionOption.ResponseHeadersRead,
                    timeout.Token
                );
                ReleasePage result;
                if (response.StatusCode == HttpStatusCode.NotModified && previous is not null)
                {
                    result = previous;
                }
                else
                {
                    if (!response.IsSuccessStatusCode)
                        throw ResponseFailure(response, now);
                    var payload = await ReadBounded(response, timeout.Token);
                    var entries = JsonSerializer.Deserialize<AppRelease[]>(payload, Json.Options)
                        ?? throw new AppFault("APP_UPDATE_INVALID_RESPONSE", "GitHub returned an empty app release response.");
                    result = new(entries, response.Headers.ETag?.ToString());
                }
                checkedPages.Add(page, result);
                releases.AddRange(result.Releases);
                if (result.Releases.Length < PageSize)
                {
                    cached = SelectRelease(releases, repository, currentVersion, clock.GetUtcNow());
                    pages = checkedPages;
                    lastFailure = null;
                    return cached;
                }
            }
            throw new AppFault(
                "APP_UPDATE_INCOMPLETE",
                "The repository has too many releases to complete the app update check. No latest version was inferred."
            );
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex) when (ex is AppFault or HttpRequestException or OperationCanceledException or JsonException or IOException)
        {
            var failure = ex as AppFault ?? new AppFault(
                "APP_UPDATE_UNAVAILABLE",
                ex is OperationCanceledException
                    ? "The app update check timed out. Retry when GitHub is reachable."
                    : "Could not verify app updates with GitHub. " + ex.Message
            );
            lastFailure = failure;
            if (retryAt <= clock.GetUtcNow())
                retryAt = clock.GetUtcNow().AddMinutes(1);
            throw failure;
        }
        finally
        {
            gate.Release();
        }
    }

    public static AppUpdateInfo SelectRelease(
        IEnumerable<AppRelease> releases,
        string repository,
        string currentVersion,
        DateTimeOffset checkedAt
    )
    {
        AppRelease? selected = null;
        AppReleaseAsset? installer = null;
        string? selectedVersion = null;
        foreach (var release in releases)
        {
            if (release.Draft || release.Prerelease || release.PublishedAt is null)
                continue;
            var tag = AppTagPattern.Match(release.TagName ?? "");
            if (!tag.Success)
                continue;
            var asset = (release.Assets ?? []).FirstOrDefault(x =>
                x.Name == InstallerName && x.State == "uploaded"
            );
            if (asset is null)
                continue;
            var version = tag.Groups[1].Value;
            if (selectedVersion is not null)
            {
                int order = Versions.Compare(version, selectedVersion);
                if (order < 0 || (order == 0 && release.PublishedAt <= selected!.PublishedAt))
                    continue;
            }
            selected = release;
            installer = asset;
            selectedVersion = version;
        }
        if (selected is null)
            return new(currentVersion, currentVersion, false, null, null, null, null, false, checkedAt);

        var releasePath = $"/{repository}/releases/tag/{selected.TagName}";
        var downloadPath = $"/{repository}/releases/download/{selected.TagName}/{InstallerName}";
        ValidateGitHubUrl(selected.Url, releasePath);
        ValidateGitHubUrl(installer!.DownloadUrl, downloadPath);
        var notes = selected.Notes;
        if (notes?.Length > 32768)
            notes = notes[..32768] + "\n\nRead the full release notes on GitHub.";
        return new(
            currentVersion,
            selectedVersion!,
            Versions.Compare(selectedVersion!, currentVersion) > 0,
            selected.Url,
            installer.DownloadUrl,
            notes,
            selected.PublishedAt,
            true,
            checkedAt
        );
    }

    static void ValidateGitHubUrl(string? value, string expectedPath)
    {
        if (!Uri.TryCreate(value, UriKind.Absolute, out var url)
            || url.Scheme != "https"
            || url.Host != "github.com"
            || !url.IsDefaultPort
            || url.UserInfo.Length != 0
            || url.Query.Length != 0
            || url.Fragment.Length != 0
            || !url.AbsolutePath.Equals(expectedPath, StringComparison.OrdinalIgnoreCase))
            throw new AppFault("APP_UPDATE_INVALID_RESPONSE", "The app release has an invalid GitHub download or release link.");
    }

    AppFault ResponseFailure(HttpResponseMessage response, DateTimeOffset now)
    {
        if (response.StatusCode is HttpStatusCode.Forbidden or HttpStatusCode.TooManyRequests)
        {
            var retry = response.Headers.RetryAfter;
            if (retry?.Delta is TimeSpan delay)
                retryAt = now.Add(delay);
            else if (retry?.Date is DateTimeOffset date)
                retryAt = date;
            else if (response.Headers.TryGetValues("X-RateLimit-Remaining", out var remaining)
                && remaining.FirstOrDefault() == "0"
                && response.Headers.TryGetValues("X-RateLimit-Reset", out var resets)
                && long.TryParse(resets.FirstOrDefault(), out var timestamp)
                && timestamp >= 0 && timestamp <= 253402300799)
                retryAt = DateTimeOffset.FromUnixTimeSeconds(timestamp);
            else
                retryAt = now.AddMinutes(1);
            if (retryAt < now.AddMinutes(1))
                retryAt = now.AddMinutes(1);
            return new AppFault(
                "APP_UPDATE_RATE_LIMITED",
                $"GitHub refused the app update check (HTTP {(int)response.StatusCode}). Retry after {retryAt:yyyy-MM-dd HH:mm:ss} UTC."
            );
        }
        return new AppFault(
            "APP_UPDATE_UNAVAILABLE",
            $"Could not verify app releases: GitHub returned HTTP {(int)response.StatusCode}."
        );
    }

    static async Task<byte[]> ReadBounded(HttpResponseMessage response, CancellationToken ct)
    {
        if (response.Content.Headers.ContentLength > MaximumPageBytes)
            throw new AppFault("APP_UPDATE_INVALID_RESPONSE", "GitHub release metadata exceeds the size limit.");
        await using var stream = await response.Content.ReadAsStreamAsync(ct);
        using var output = new MemoryStream();
        var buffer = new byte[8192];
        int count;
        while ((count = await stream.ReadAsync(buffer, ct)) > 0)
        {
            if (output.Length + count > MaximumPageBytes)
                throw new AppFault("APP_UPDATE_INVALID_RESPONSE", "GitHub release metadata exceeds the size limit.");
            output.Write(buffer, 0, count);
        }
        return output.ToArray();
    }

    sealed record ReleasePage(AppRelease[] Releases, string? ETag);
}
