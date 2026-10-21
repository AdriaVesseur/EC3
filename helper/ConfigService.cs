using System.Text.Json;

namespace Eurocup3;

public sealed class ConfigService
{
    public string DataRoot
    {
        get;
    }
    public string ConfigPath => Path.Combine(DataRoot, "settings.json");
    public Settings Value
    {
        get; private set;
    }

    public ConfigService()
        : this(
            Environment.GetEnvironmentVariable("EC3_DATA") ?? BrandIdentity.DataRoot,
            Environment.GetEnvironmentVariable("EC3_DATA") is null ? BrandIdentity.LegacyDataRoot : null
        ) { }

    public ConfigService(string dataRoot, string? legacyDataRoot = null)
    {
        DataRoot = dataRoot;
        Directory.CreateDirectory(DataRoot);
        if (!File.Exists(ConfigPath) && legacyDataRoot is not null)
            ImportLegacySettings(legacyDataRoot);
        Value = File.Exists(ConfigPath)
            ? JsonSerializer.Deserialize<Settings>(File.ReadAllText(ConfigPath), Json.Options)!
            : new();
        if (
            Value.AllowedOrigins.Any(x =>
                !Uri.TryCreate(x, UriKind.Absolute, out var u)
                || u.GetLeftPart(UriPartial.Authority) != x
                || (u.Scheme != "https" && !(u.Scheme == "http" && u.IsLoopback))
            )
        )
            throw new AppFault(
                "INVALID_CONFIG",
                "Allowed origins must be exact HTTPS origins (HTTP only on loopback)."
            );
    }

    void ImportLegacySettings(string legacyDataRoot)
    {
        var legacyPath = Path.Combine(legacyDataRoot, "settings.json");
        if (!File.Exists(legacyPath))
            return;
        var imported = JsonSerializer.Deserialize<Settings>(File.ReadAllText(legacyPath), Json.Options)
            ?? throw new AppFault("INVALID_CONFIG", "The previous app settings could not be read.");
        imported.AllowedOrigins = imported.AllowedOrigins
            .Where(x => x is not ("http://127.0.0.1:32145" or "http://127.0.0.1:32148"))
            .Append(BrandIdentity.ApiOrigin)
            .Distinct(StringComparer.Ordinal)
            .ToArray();
        // Import settings only. Each brand starts its own WebView, logs and API session.
        // Move without overwrite prevents replacing a profile if two launches overlap.
        var temporaryPath = Path.Combine(DataRoot, $"settings-import-{Guid.NewGuid():N}.tmp");
        try
        {
            File.WriteAllText(temporaryPath, JsonSerializer.Serialize(imported, Json.Options));
            File.Move(temporaryPath, ConfigPath, overwrite: false);
        }
        catch (IOException) when (File.Exists(ConfigPath)) { }
        finally
        {
            if (File.Exists(temporaryPath))
                File.Delete(temporaryPath);
        }
    }

    public void SavePath(string path)
    {
        Value.AssettoPath = path;
        File.WriteAllText(ConfigPath, JsonSerializer.Serialize(Value, Json.Options));
    }

    public bool TestMode =>
        Environment.GetEnvironmentVariable("EC3_TEST_MODE") == "1"
        && Environment.GetEnvironmentVariable("EC3_DATA") != null;
}

public sealed class Settings
{
    public string ContentRepository { get; set; } = "AdriaVesseur/EC3";
    public string ManifestUrl
    {
        get; set;
    } =
        "https://raw.githubusercontent.com/AdriaVesseur/EC3/main/content-repository/manifest.json";
    public string ChampionshipUrl
    {
        get; set;
    } =
        "https://raw.githubusercontent.com/AdriaVesseur/EC3/main/content-repository/championship.json";
    public string HelperRepository { get; set; } = "AdriaVesseur/EC3";
    public string[] AllowedOrigins
    {
        get; set;
    } = [BrandIdentity.ApiOrigin, "https://adriavesseur.github.io"];
    public string? AssettoPath
    {
        get; set;
    }
    public int ParallelDownloads { get; set; } = 2;
}
