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
    {
        DataRoot =
            Environment.GetEnvironmentVariable("EC3_DATA")
            ?? Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "Eurocup3"
            );
        Directory.CreateDirectory(DataRoot);
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
    } = ["http://127.0.0.1:32145", "https://adriavesseur.github.io"];
    public string? AssettoPath
    {
        get; set;
    }
    public int ParallelDownloads { get; set; } = 2;
}
