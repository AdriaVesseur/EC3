using System.Text.RegularExpressions;
using Microsoft.Win32;

namespace Eurocup3;

public sealed class AssettoDetectionService(ConfigService config)
{
    public static bool IsAssetto(string path) =>
        Directory.Exists(path)
        && (
            File.Exists(Path.Combine(path, "acs.exe"))
            || File.Exists(Path.Combine(path, "AssettoCorsa.exe"))
        );

    public static IEnumerable<string> Libraries(string text) =>
        Regex
            .Matches(text, "\"path\"\\s*\"([^\"]+)\"", RegexOptions.IgnoreCase)
            .Select(m => m.Groups[1].Value.Replace("\\\\", "\\"));

    public string? Find()
    {
        if (config.Value.AssettoPath is { } saved && IsAssetto(saved))
        {
            Paths.NoLinks(saved);
            return saved;
        }
        if (config.TestMode)
            return null;
        var roots = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),
                "Steam"
            ),
            Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
                "Steam"
            ),
        };
        foreach (
            var key in new[]
            {
                @"HKEY_CURRENT_USER\Software\Valve\Steam",
                @"HKEY_LOCAL_MACHINE\SOFTWARE\WOW6432Node\Valve\Steam",
            }
        )
            foreach (var name in new[] { "SteamPath", "InstallPath" })
                if (Registry.GetValue(key, name, null) is string s)
                    roots.Add(s);
        foreach (var root in roots.ToArray())
        {
            var vdf = Path.Combine(root, "steamapps", "libraryfolders.vdf");
            if (File.Exists(vdf))
                foreach (var lib in Libraries(File.ReadAllText(vdf)))
                    roots.Add(lib);
        }
        foreach (
            var drive in DriveInfo
                .GetDrives()
                .Where(d => d.IsReady && d.DriveType == DriveType.Fixed)
        )
            roots.Add(Path.Combine(drive.RootDirectory.FullName, "SteamLibrary"));
        foreach (var root in roots)
        {
            string path = Path.Combine(root, "steamapps", "common", "assettocorsa");
            if (IsAssetto(path))
            {
                Paths.NoLinks(path);
                config.SavePath(path);
                return path;
            }
        }
        return null;
    }

    public string Require() =>
        Find()
        ?? throw new AppFault(
            "ASSETTO_NOT_FOUND",
            "Select your Assetto Corsa folder in Installation."
        );

    public void Select(string path)
    {
        if (!IsAssetto(path))
            throw new AppFault(
                "ASSETTO_NOT_FOUND",
                "The selected folder must contain acs.exe or AssettoCorsa.exe."
            );
        Paths.NoLinks(path);
        config.SavePath(Path.GetFullPath(path));
    }

    public string? CspVersion()
    {
        var root = Find();
        if (root == null)
            return null;
        var file = Path.Combine(root, "extension", "config", "version.ini");
        if (!File.Exists(file))
            return null;
        Paths.NoLinks(file);
        var m = Regex.Match(
            File.ReadAllText(file),
            @"(?im)^\s*VERSION\s*=\s*(\d+\.\d+\.\d+(?:-[\w.]+)?)\s*$"
        );
        return m.Success ? m.Groups[1].Value : null;
    }
}
