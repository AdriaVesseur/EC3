using System.Text.Json;
using Eurocup3;

public static class BrandTests
{
    public static void Run(Action<bool, string> assert, string work)
    {
        var epic = BrandIdentity.Id == "epic";
        assert(string.Equals(BrandIdentity.Id, "mkbt") || string.Equals(BrandIdentity.Id, "epic"), "publication selects a supported brand");
        assert(BrandIdentity.ApiPort == (epic ? 32148 : 32145), "brand uses its own local API port");
        assert(BrandIdentity.AppUserModelId == (epic ? "EpicSimracing.ContentManager" : "MKBT.ContentManager"),
            "taskbar identity belongs to the published brand");
        assert(BrandIdentity.MutexName.Contains(BrandIdentity.AppUserModelId)
            && BrandIdentity.ShowWindowEvent.StartsWith(BrandIdentity.MutexName), "single-instance handles are separate for each brand");
        assert(BrandIdentity.DataRoot != BrandIdentity.LegacyDataRoot
            && BrandIdentity.WebViewDataRoot.StartsWith(BrandIdentity.DataRoot + Path.DirectorySeparatorChar),
            "each brand keeps a separate profile and WebView data directory");
        using (var icon = AppIcon.Load())
            assert(icon.Width > 0 && icon.Height > 0, "native brand icon is embedded and readable");

        var legacy = Path.Combine(work, "legacy-profile");
        var profile = Path.Combine(work, "branded-profile");
        Directory.CreateDirectory(Path.Combine(legacy, "WebView2"));
        File.WriteAllText(Path.Combine(legacy, "WebView2", "do-not-copy.txt"), "old browser data");
        var legacySettings = new Settings
        {
            AssettoPath = Path.Combine(work, "selected-assetto"),
            ParallelDownloads = 3,
            AllowedOrigins = ["http://127.0.0.1:32145", "http://127.0.0.1:32148", "https://adriavesseur.github.io"]
        };
        var legacyJson = JsonSerializer.Serialize(legacySettings, Json.Options);
        File.WriteAllText(Path.Combine(legacy, "settings.json"), legacyJson);
        var imported = new ConfigService(profile, legacy);
        assert(imported.Value.AssettoPath == legacySettings.AssettoPath && imported.Value.ParallelDownloads == 3,
            "first brand launch imports the existing game path and download settings");
        assert(imported.Value.AllowedOrigins.Contains(BrandIdentity.ApiOrigin)
            && !imported.Value.AllowedOrigins.Contains(epic ? "http://127.0.0.1:32145" : "http://127.0.0.1:32148"),
            "imported API origins cannot point at the other brand");
        assert(File.ReadAllText(Path.Combine(legacy, "settings.json")) == legacyJson
            && !Directory.Exists(Path.Combine(profile, "WebView2")), "profile import preserves the legacy profile and starts a fresh browser profile");
        var brandPath = Path.Combine(work, "new-brand-game-path");
        imported.SavePath(brandPath);
        var reopened = new ConfigService(profile, legacy);
        assert(reopened.Value.AssettoPath == brandPath, "later launches never overwrite the brand profile from legacy settings");

        var releases = new[]
        {
            new AppRelease
            {
                TagName = "app-v99.0.0",
                PublishedAt = DateTimeOffset.UtcNow,
                Url = "https://github.com/example/content/releases/tag/app-v99.0.0",
                Assets = [new AppReleaseAsset
                {
                    Name = epic ? "MKBT-Content-Manager-Setup.exe" : "EpicSimracing-Content-Manager-Setup.exe",
                    State = "uploaded"
                }]
            }
        };
        assert(!AppUpdateService.SelectRelease(releases, "example/content", "1.0.0", DateTimeOffset.UtcNow).Published,
            "app updates never offer the other brand's installer");

        VerifySharedContentLease(assert, work);
    }

    static void VerifySharedContentLease(Action<bool, string> assert, string work)
    {
        var game = Path.Combine(work, "parallel-game");
        var transactionDirectory = Path.Combine(game, ".ec3", "transactions");
        var backup = Path.Combine(game, ".ec3", "backups", "parallel");
        var target = Path.Combine(game, "content", "cars", "parallel-car");
        Directory.CreateDirectory(transactionDirectory);
        Directory.CreateDirectory(backup);
        Directory.CreateDirectory(target);
        File.WriteAllText(Path.Combine(backup, "original.txt"), "original");
        File.WriteAllText(Path.Combine(target, "unfinished.txt"), "unfinished");
        var journal = Path.Combine(transactionDirectory, "parallel.json");
        File.WriteAllText(journal, JsonSerializer.Serialize(new Transaction(
            "content/cars/parallel-car", ".ec3/backups/parallel", ".ec3/staging/parallel", ".ec3/installed/parallel-car.json", null, true
        ), Json.Options));
        using (var otherLauncher = new FileStream(Path.Combine(game, ".ec3", "content-operation.lock"),
            FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None))
        {
            var rejected = false;
            try { InstallationService.Recover(game); }
            catch (AppFault ex) when (ex.Code == "OTHER_LAUNCHER_BUSY") { rejected = true; }
            assert(rejected && File.Exists(journal) && File.Exists(Path.Combine(target, "unfinished.txt"))
                && File.Exists(Path.Combine(backup, "original.txt")), "another launcher cannot recover an active content transaction");
        }
        InstallationService.Recover(game);
        assert(!File.Exists(journal) && File.Exists(Path.Combine(target, "original.txt"))
            && !File.Exists(Path.Combine(target, "unfinished.txt")), "content recovery resumes safely after the other launcher releases its lease");
    }
}
