using System.Text.Json;

namespace Eurocup3;

public sealed record LocalSkin(string Id, string Name, string? Number, bool HasPreview);

public sealed record LocalCar(string Id, string Name, string Version, string Folder, LocalSkin[] Skins);

/// <summary>Exposes only cars the EC3 installer can prove it installed.</summary>
public sealed class MyContentService(AssettoDetectionService detection, ManifestService manifests)
{
    sealed record LauncherCarReceipt(string Id, Installed Receipt, Package? Package, string CarDirectory);

    public LocalCar[] Cars()
    {
        var root = detection.Find();
        if (root is null)
            return [];

        var catalog = manifests.Current?.Manifest.Content.ToDictionary(p => p.Id)
            ?? new Dictionary<string, Package>(StringComparer.Ordinal);
        var receiptsDirectory = Paths.Under(root, ".ec3/installed");
        if (!Directory.Exists(receiptsDirectory))
            return [];

        return Directory.EnumerateFiles(receiptsDirectory, "*.json")
            .Select(path =>
            {
                Paths.NoLinks(path);
                var id = Path.GetFileNameWithoutExtension(path);
                try
                {
                    Paths.Relative(id);
                    if (id.Contains('/')) return null;
                    var receipt = JsonSerializer.Deserialize<Installed>(File.ReadAllText(path), Json.Options);
                    if (receipt is null || receipt.Id != id) return null;
                    Paths.Install(receipt.InstallPath);
                    var package = catalog.GetValueOrDefault(id);
                    if (package is not null && (package.Type != "car" || package.InstallPath != receipt.InstallPath))
                        return null;
                    var carDirectory = Paths.Under(root, receipt.InstallPath);
                    if (!Directory.Exists(carDirectory)) return null;
                    return new LauncherCarReceipt(id, receipt, package, carDirectory);
                }
                catch (AppFault)
                {
                    return null;
                }
                catch (JsonException)
                {
                    return null;
                }
            })
            .Where(x => x is not null)
            .Select(x => x!)
            .Where(x => x.Package is null || x.Package.Type == "car")
            .Select(x =>
            {
                var carDirectory = x.CarDirectory;
                var skinsDirectory = Paths.Under(carDirectory, "skins");
                var skins = Directory.Exists(skinsDirectory)
                    ? Directory.EnumerateDirectories(skinsDirectory)
                        .Where(path =>
                        {
                            Paths.NoLinks(path);
                            return true;
                        })
                        .Select(path => ReadSkin(path))
                        .OrderBy(skin => skin.Name, StringComparer.OrdinalIgnoreCase)
                        .ToArray()
                    : [];
                return new LocalCar(
                    x.Id,
                    x.Package?.Name ?? ReadCarName(carDirectory),
                    x.Receipt.Version,
                    Path.GetFileName(carDirectory),
                    skins
                );
            })
            .OrderBy(car => car.Name, StringComparer.OrdinalIgnoreCase)
            .ToArray();
    }

    public string PreviewPath(string carId, string skinId)
    {
        var car = RequireInstalledCar(carId);
        Paths.Relative(skinId);
        if (skinId.Contains('/'))
            throw new AppFault("SKIN_NOT_FOUND", "Skin not found.");
        var skinDirectory = Paths.Under(Paths.Under(detection.Require(), car.InstallPath), "skins/" + skinId);
        var preview = Paths.Under(skinDirectory, "preview.jpg");
        if (!Directory.Exists(skinDirectory) || !File.Exists(preview))
            throw new AppFault("SKIN_PREVIEW_NOT_FOUND", "This skin has no preview image.");
        return preview;
    }

    (string InstallPath, Installed Receipt) RequireInstalledCar(string id)
    {
        Paths.Relative(id);
        if (id.Contains('/'))
            throw new AppFault("CAR_NOT_FOUND", "Car not found.");
        var root = detection.Require();
        var receipt = InstallationService.Receipt(root, id);
        if (receipt is null || receipt.Id != id)
            throw new AppFault("CAR_NOT_LAUNCHER_INSTALLED", "This car was not installed by the EC3 launcher.");
        Paths.Install(receipt.InstallPath);
        var package = manifests.Current?.Manifest.Content.FirstOrDefault(p => p.Id == id);
        if (package is not null && (package.Type != "car" || package.InstallPath != receipt.InstallPath))
            throw new AppFault("CAR_NOT_FOUND", "Car is not an installed car in the current launcher catalog.");
        return (receipt.InstallPath, receipt);
    }

    static string DisplayName(string folder) =>
        System.Globalization.CultureInfo.InvariantCulture.TextInfo.ToTitleCase(
            folder.Replace('_', ' ').Replace('-', ' ').ToLowerInvariant()
        );

    static string ReadCarName(string carDirectory)
    {
        string ui = Path.Combine(carDirectory, "ui", "ui_car.json");
        if (File.Exists(ui))
        {
            Paths.NoLinks(ui);
            try
            {
                using var doc = JsonDocument.Parse(File.ReadAllText(ui));
                if (doc.RootElement.TryGetProperty("name", out var name)
                    && name.GetString() is { Length: > 0 } value)
                    return value.Trim();
            }
            catch (JsonException)
            {
                // Fall back to the folder name if optional car metadata is damaged.
            }
        }
        return DisplayName(Path.GetFileName(carDirectory));
    }

    static LocalSkin ReadSkin(string directory)
    {
        string id = Path.GetFileName(directory);
        string? name = null;
        string? number = null;
        string ui = Path.Combine(directory, "ui_skin.json");
        if (File.Exists(ui))
        {
            Paths.NoLinks(ui);
            try
            {
                using var doc = JsonDocument.Parse(File.ReadAllText(ui));
                if (doc.RootElement.TryGetProperty("skinname", out var skinName))
                    name = skinName.GetString();
                if (doc.RootElement.TryGetProperty("number", out var carNumber))
                    number = carNumber.ValueKind == JsonValueKind.String
                        ? carNumber.GetString()
                        : carNumber.ToString();
            }
            catch (JsonException)
            {
                // A malformed optional skin label must not hide the installed car.
            }
        }
        string preview = Path.Combine(directory, "preview.jpg");
        if (File.Exists(preview)) Paths.NoLinks(preview);
        return new LocalSkin(id, string.IsNullOrWhiteSpace(name) ? id : name.Trim(), number, File.Exists(preview));
    }
}
