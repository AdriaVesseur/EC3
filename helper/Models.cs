using System.Text.Json;

namespace Eurocup3;

public sealed record FileSpec(string Path, string Sha256, long Size);

public sealed record Dependency(string Id, string MinimumVersion);

public sealed record Package(
    string Id,
    string Name,
    string Type,
    string Version,
    string Download,
    long Size,
    string Sha256,
    string InstallPath,
    bool Required,
    FileSpec[] Files,
    Dependency[] Dependencies,
    string Description = "",
    string[]? Changelog = null,
    string? MinimumCspVersion = null
);

public sealed record Manifest(
    string Championship,
    string Season,
    string Build,
    Package[] Content,
    bool Demo = false
);

public sealed record EventSpec(
    string Id,
    string Name,
    string Venue,
    string Round,
    string[] RequiredContent
);

public sealed record Championship(
    string Season,
    string Build,
    string MinimumHelperVersion,
    string[] RequiredContent,
    EventSpec[] Events
);

public sealed record Catalog(
    Manifest Manifest,
    Championship Championship,
    DateTimeOffset FetchedAt
);

public sealed record Installed(
    string Id,
    string Version,
    string InstallPath,
    FileSpec[] Files,
    DateTimeOffset InstalledAt
);

public sealed record ContentStatus(
    Package Package,
    string State,
    string? InstalledVersion,
    int CheckedFiles,
    int InvalidFiles,
    DateTimeOffset? VerifiedAt
);

public sealed class Job
{
    public string Id { get; init; } = Guid.NewGuid().ToString("N");
    public string PackageId { get; init; } = "";
    public string Name { get; init; } = "";
    public string Action { get; init; } = "install";
    public string State { get; set; } = "queued";
    public long Bytes
    {
        get; set;
    }
    public long Total
    {
        get; set;
    }
    public double BytesPerSecond
    {
        get; set;
    }
    public int CheckedFiles
    {
        get; set;
    }
    public int TotalFiles
    {
        get; set;
    }
    public string? Error
    {
        get; set;
    }
    public DateTimeOffset CreatedAt { get; init; } = DateTimeOffset.UtcNow;

    [System.Text.Json.Serialization.JsonIgnore]
    public CancellationTokenSource Cancellation { get; } = new();

    [System.Text.Json.Serialization.JsonIgnore]
    public volatile bool Paused;
}

public sealed class AppFault(string code, string message) : Exception(message)
{
    public string Code { get; } = code;
}

public static class Json
{
    public static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true,
    };
}
