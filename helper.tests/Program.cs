using System.IO.Compression;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Eurocup3;

var work = Path.Combine(Path.GetTempPath(), "ec3-tests-" + Guid.NewGuid().ToString("N"));
Directory.CreateDirectory(work);
int passed = 0;
void Assert(bool condition, string name)
{
    if (!condition)
        throw new Exception("FAIL: " + name);
    Console.WriteLine("PASS: " + name);
    passed++;
}
void Reject(Action a, string name)
{
    try
    {
        a();
    }
    catch (AppFault)
    {
        Assert(true, name);
        return;
    }
    throw new Exception("FAIL: accepted " + name);
}
async Task RejectAsync(Func<Task> a, string name)
{
    try
    {
        await a();
    }
    catch (AppFault)
    {
        Assert(true, name);
        return;
    }
    throw new Exception("FAIL: accepted " + name);
}
Package P(string id, Dependency[]? deps = null) =>
    new(
        id,
        id,
        "car",
        "1.0.0",
        "https://github.com/Eurocup3/content/releases/download/v1/asset.zip",
        1,
        new string('a', 64),
        "content/cars/" + id,
        true,
        [new("test.txt", new string('a', 64), 3)],
        deps ?? []
    );
try
{
    Assert(Versions.Valid("1.0.0+build-test"), "hyphens in build metadata");
    Assert(Versions.Compare("2.10.0", "2.9.0") > 0, "numeric version comparison");
    Assert(Versions.Compare("1.0.0-rc.2", "1.0.0-rc.10") < 0, "numeric prerelease ordering");
    Assert(Versions.Compare("1.0.0+build1", "1.0.0+build2") == 0, "build metadata ignored");
    Assert(Versions.Compare("1.0.0-rc.1", "1.0.0") < 0, "release after prerelease");
    Assert(!Versions.Valid("1.0.0-01"), "reject leading-zero prerelease");
    ResultsService.ValidateSourceUrl("https://www.makrobeasts.com/championships/porsche-sprint-cup");
    Assert(true, "accept MakroBeasts championship results source");
    Reject(
        () => ResultsService.ValidateSourceUrl("https://example.com/championships/test"),
        "reject untrusted results source"
    );
    var standingsHtml = """
        <div id="standings-pane-pilots"><table><tbody>
        <tr><td>1</td><td>#16</td><td><a>Samuel Fernández</a></td><td>Class</td><td>Car</td><td>64</td></tr>
        </tbody></table></div>
        """;
    var standing = ResultsService.ParseStandings(standingsHtml).Single();
    Assert(standing.Position == 1 && standing.Number == "#16" && standing.Driver == "Samuel Fernández" && standing.Points == "64", "parse championship standings");
    var meta = ResultsService.ParseEventMeta(
        "<span>R1</span><h3>Ronda 1 | Hockenheim GP</h3><span><i class=\"location-dot\"></i>Hockenheimring GP</span><a href=\"/events/e0cd5f39-2ced-42fe-9a8e-961c06b36e2d/results\">Results</a>",
        "e0cd5f39-2ced-42fe-9a8e-961c06b36e2d",
        1
    );
    Assert(meta.Round == "R1" && meta.Name.Contains("Hockenheim") && meta.Venue == "Hockenheimring GP", "parse event round and venue");
    using (var podium = JsonDocument.Parse("""
        {"sessions":[{"name":"Carrera","classes":{"all":[{"name":"Sergi Morera","car":"Porsche Cup","time":"26:12.232","raceNumber":8}]}}]}
        """))
    {
        var entry = ResultsService.ParseSessions(podium.RootElement).Single().Results.Single();
        Assert(entry.Position == 1 && entry.Driver == "Sergi Morera" && entry.Number == "8" && entry.Time == "26:12.232", "parse official race podium");
    }
    if (Environment.GetEnvironmentVariable("EC3_LIVE_RESULTS_TEST") == "1")
    {
        var live = await new ResultsService().Get(
            new Championship(
                "2026", "1.0.0", "1.0.0", [], [],
                "https://www.makrobeasts.com/championships/porsche-sprint-cup"
            ),
            force: true
        );
        Assert(live.Standings.Length > 0, "load live MakroBeasts driver standings");
        Assert(live.Races.Length > 0 && live.Races.All(r => r.Sessions.Length > 0), "load live MakroBeasts race podiums");
    }
    foreach (
        var p in new[]
        {
            "../evil",
            "/absolute",
            "C:/escape",
            "a\\b",
            "a/../b",
            "a/file:stream",
            "a/NUL.txt",
            "a/COM1",
            "a/ends.",
            "a/ends ",
            "a//b",
        }
    )
        Reject(() => Paths.Relative(p), "reject path " + p);
    Reject(() => Paths.Install("content/cars"), "reject broad install folder");
    Reject(() => Paths.Install("system32/test"), "reject unsupported install root");
    string game = Path.Combine(work, "game");
    Directory.CreateDirectory(game);
    Assert(!AssettoDetectionService.IsAssetto(game), "reject non-game folder");
    File.WriteAllText(Path.Combine(game, "acs.exe"), "test");
    Assert(AssettoDetectionService.IsAssetto(game), "detect game marker");
    Assert(
        AssettoDetectionService.Libraries("\"path\" \"D:\\\\SteamLibrary\"").Single()
            == @"D:\SteamLibrary",
        "parse Steam VDF escaped path"
    );
    var manifest = new Manifest(
        "EC3",
        "2026",
        "1.0.0",
        [P("base"), P("config", [new("base", "1.0.0")])]
    );
    Assert(
        Dependencies
            .Resolve(manifest, ["config"])
            .Select(p => p.Id)
            .SequenceEqual(new[] { "base", "config" }),
        "topological dependencies"
    );
    Reject(() => Dependencies.Resolve(manifest, ["missing"]), "unknown dependency");
    var cycle = manifest with
    {
        Content = [P("base", [new("config", "1.0.0")]), P("config", [new("base", "1.0.0")])],
    };
    Reject(() => Dependencies.Resolve(cycle, ["base"]), "dependency cycle");
    var text = Path.Combine(work, "test.txt");
    await File.WriteAllTextAsync(text, "abc");
    var digest = await HashService.Sha256(text);
    Assert(
        digest == "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
        "SHA256 known vector"
    );
    Assert(
        !await HashService.Matches(text, new("test.txt", new string('b', 64), 3)),
        "checksum mismatch"
    );
    var zip = Path.Combine(work, "safe.zip");
    using (var z = ZipFile.Open(zip, ZipArchiveMode.Create))
    {
        var e = z.CreateEntry("test.txt");
        using var w = new StreamWriter(e.Open());
        w.Write("abc");
    }
    var package = P("safe") with { Files = [new("test.txt", digest, 3)] };
    Assert(
        ContentService.Classify(package, null, true, 0) == ("ready", package.Version),
        "recognize a manually installed current package by its file inventory"
    );
    Assert(
        ContentService.Classify(package, null, true, 1) == ("outdated", null),
        "flag a manually installed package that differs from the current inventory"
    );
    var oldReceipt = new Installed(
        package.Id,
        "0.9.0",
        package.InstallPath,
        package.Files,
        DateTimeOffset.UtcNow
    );
    Assert(
        ContentService.Classify(package, oldReceipt, true, 1) == ("outdated", "0.9.0"),
        "show the known installed version when an update is available"
    );
    var currentReceipt = oldReceipt with { Version = package.Version };
    Assert(
        ContentService.Classify(package, currentReceipt, true, 1) == ("corrupted", package.Version),
        "keep same-version file damage in repair state"
    );
    Assert(
        ContentService.Classify(package, oldReceipt, false, package.Files.Length)
            == ("missing", null),
        "show a missing target as not installed even when an old receipt remains"
    );
    await new ExtractionService().Extract(
        zip,
        Path.Combine(work, "extracted"),
        package,
        CancellationToken.None
    );
    Assert(
        await InstallationService.VerifyFolder(
            Path.Combine(work, "extracted"),
            package.Files,
            null,
            CancellationToken.None
        ) == 0,
        "safe archive extraction and verification"
    );
    var fullPathZip = Path.Combine(work, "full-path.zip");
    using (var z = ZipFile.Open(fullPathZip, ZipArchiveMode.Create))
    {
        var e = z.CreateEntry("content/cars/example_car/ui/test.txt");
        using var w = new StreamWriter(e.Open());
        w.Write("abc");
    }
    var fullPathPackage = package with
    {
        InstallPath = "content/cars/example_car",
        Files =
        [
            new(
                "ui/test.txt",
                digest,
                3,
                "content/cars/example_car/ui/test.txt"
            ),
        ],
    };
    var fullPathStage = Path.Combine(work, "full-path-extracted");
    await new ExtractionService().Extract(
        fullPathZip,
        fullPathStage,
        fullPathPackage,
        CancellationToken.None
    );
    Assert(
        await File.ReadAllTextAsync(Path.Combine(fullPathStage, "ui", "test.txt")) == "abc",
        "full Assetto Corsa ZIP paths install into the detected package folder"
    );
    File.WriteAllText(Path.Combine(work, "extracted", "unexpected.txt"), "bad");
    Assert(
        await InstallationService.VerifyFolder(
            Path.Combine(work, "extracted"),
            package.Files,
            null,
            CancellationToken.None
        ) == 1,
        "unexpected file invalidates installation"
    );
    foreach (var attack in new[] { "../escape.txt", "C:/escape.txt", "test.txt:stream", "sub/NUL" })
    {
        var file = Path.Combine(work, Guid.NewGuid() + ".zip");
        using (var z = ZipFile.Open(file, ZipArchiveMode.Create))
        {
            z.CreateEntry(attack);
        }
        await RejectAsync(
            () =>
                new ExtractionService().Extract(
                    file,
                    Path.Combine(work, Guid.NewGuid().ToString()),
                    package,
                    CancellationToken.None
                ),
            "malicious ZIP " + attack
        );
    }
    var linkZip = Path.Combine(work, "link.zip");
    using (var z = ZipFile.Open(linkZip, ZipArchiveMode.Create))
    {
        var e = z.CreateEntry("test.txt");
        e.ExternalAttributes = unchecked((int)0xA1FF0000);
        using var w = new StreamWriter(e.Open());
        w.Write("abc");
    }
    await RejectAsync(
        () =>
            new ExtractionService().Extract(
                linkZip,
                Path.Combine(work, "links"),
                package,
                CancellationToken.None
            ),
        "ZIP symlink rejected"
    );
    var caseZip = Path.Combine(work, "case.zip");
    using (var z = ZipFile.Open(caseZip, ZipArchiveMode.Create))
    {
        foreach (var name in new[] { "test.txt", "TEST.TXT" })
        {
            var e = z.CreateEntry(name);
            using var w = new StreamWriter(e.Open());
            w.Write("abc");
        }
    }
    await RejectAsync(
        () =>
            new ExtractionService().Extract(
                caseZip,
                Path.Combine(work, "duplicates"),
                package,
                CancellationToken.None
            ),
        "case insensitive ZIP duplicates"
    );
    // Crash before the original folder was moved: an unmanaged existing folder must survive.
    var target = Paths.Under(game, "content/cars/test");
    Directory.CreateDirectory(target);
    File.WriteAllText(Path.Combine(target, "old.txt"), "keep");
    var journal = Paths.Under(game, ".ec3/transactions/t.json");
    Directory.CreateDirectory(Path.GetDirectoryName(journal)!);
    var t = new Transaction(
        "content/cars/test",
        ".ec3/backups/test",
        ".ec3/staging/test",
        ".ec3/installed/test.json",
        null,
        true
    );
    File.WriteAllText(journal, JsonSerializer.Serialize(t, Json.Options));
    InstallationService.Recover(game);
    Assert(
        File.Exists(Path.Combine(target, "old.txt")),
        "crash before rename preserves unmanaged original"
    );
    var backup = Paths.Under(game, t.Backup);
    Directory.CreateDirectory(Path.GetDirectoryName(backup)!);
    Directory.Move(target, backup);
    Directory.CreateDirectory(target);
    File.WriteAllText(Path.Combine(target, "new.txt"), "incomplete");
    File.WriteAllText(journal, JsonSerializer.Serialize(t, Json.Options));
    InstallationService.Recover(game);
    Assert(
        File.Exists(Path.Combine(target, "old.txt"))
            && !File.Exists(Path.Combine(target, "new.txt")),
        "crash rollback restores original folder"
    );
    Environment.SetEnvironmentVariable("EC3_DATA", Path.Combine(work, "config"));
    var config = new ConfigService();
    var service = new ManifestService(config);
    Reject(
        () => service.ValidateDownload("https://evil.example/mod.zip"),
        "untrusted download origin"
    );
    Reject(
        () =>
            service.ValidateDownload(
                "https://github.com/attacker/repo/releases/download/v1/mod.zip"
            ),
        "untrusted release repository"
    );
    Reject(
        () =>
            service.ValidateDownload(
                "http://github.com/Eurocup3/content/releases/download/v1/mod.zip"
            ),
        "plaintext download rejected"
    );
    Console.WriteLine($"All {passed} helper checks passed.");
}
finally
{
    var parent = Path.GetDirectoryName(work)!;
    Paths.DeleteTree(parent, Path.GetFileName(work));
}
