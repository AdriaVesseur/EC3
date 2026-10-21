namespace Eurocup3;

/// <summary>Each publication has its own desktop identity and local profile.</summary>
public static class BrandIdentity
{
#if APP_BRAND_EPIC
    public const string Id = "epic";
    public const string Name = "Epic Simracing Content Manager";
    public const string AppUserModelId = "EpicSimracing.ContentManager";
    public const int ApiPort = 32148;
    public const string InstallerName = "EpicSimracing-Content-Manager-Setup.exe";
    const string ProfileFolder = "EpicSimracing";
#else
    public const string Id = "mkbt";
    public const string Name = "MKBT Content Manager";
    public const string AppUserModelId = "MKBT.ContentManager";
    public const int ApiPort = 32145;
    public const string InstallerName = "MKBT-Content-Manager-Setup.exe";
    const string ProfileFolder = "MKBT";
#endif

    public static string ApiOrigin => $"http://127.0.0.1:{ApiPort}";
    public static string MutexName => $"Local\\{AppUserModelId}";
    public static string ShowWindowEvent => $"{MutexName}.ShowWindow";
    public static string DataRoot => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        ProfileFolder,
        "ContentManager"
    );
    public static string LegacyDataRoot => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "Eurocup3"
    );
    public static string WebViewDataRoot => Path.Combine(DataRoot, "WebView2");
}
