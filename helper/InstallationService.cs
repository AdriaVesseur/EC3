using System.Text.Json;

namespace Eurocup3;

public sealed record Transaction(
    string Target,
    string Backup,
    string Stage,
    string Receipt,
    string? PreviousReceipt,
    bool HadTarget
);

public sealed class InstallationService(
    AssettoDetectionService detection,
    DownloadService downloads,
    ExtractionService extraction,
    ILogger<InstallationService> logger
)
{
    static readonly SemaphoreSlim commitLock = new(1);

    public static string ReceiptPath(string root, string id) =>
        Paths.Under(root, ".ec3/installed/" + id + ".json");

    public static Installed? Receipt(string root, string id)
    {
        var path = ReceiptPath(root, id);
        return File.Exists(path)
            ? JsonSerializer.Deserialize<Installed>(File.ReadAllText(path), Json.Options)
            : null;
    }

    public static async Task<int> VerifyFolder(
        string folder,
        FileSpec[] files,
        Job? job,
        CancellationToken ct
    )
    {
        int invalid = 0;
        if (job != null)
        {
            job.TotalFiles = files.Length;
            job.CheckedFiles = 0;
        }
        foreach (var f in files)
        {
            ct.ThrowIfCancellationRequested();
            if (!await HashService.Matches(Paths.Under(folder, f.Path), f, ct))
                invalid++;
            if (job != null)
                job.CheckedFiles++;
        }
        if (Directory.Exists(folder))
        {
            var allowed = files.Select(f => f.Path).ToHashSet(StringComparer.OrdinalIgnoreCase);
            var dirs = new Stack<string>();
            dirs.Push(folder);
            while (dirs.Count > 0)
            {
                foreach (var path in Directory.EnumerateFileSystemEntries(dirs.Pop()))
                {
                    Paths.NoLinks(path);
                    if (Directory.Exists(path))
                        dirs.Push(path);
                    else if (
                        !allowed.Contains(Path.GetRelativePath(folder, path).Replace('\\', '/'))
                    )
                        invalid++;
                }
            }
        }
        return invalid;
    }

    public static void Recover(string root)
    {
        var dir = Paths.Under(root, ".ec3/transactions");
        if (!Directory.Exists(dir))
            return;
        foreach (var file in Directory.GetFiles(dir, "*.json"))
        {
            Paths.NoLinks(file);
            var t = JsonSerializer.Deserialize<Transaction>(File.ReadAllText(file), Json.Options)!;
            Paths.Install(t.Target);
            if (
                !t.Backup.StartsWith(".ec3/backups/", StringComparison.Ordinal)
                || !t.Stage.StartsWith(".ec3/staging/", StringComparison.Ordinal)
                || !t.Receipt.StartsWith(".ec3/installed/", StringComparison.Ordinal)
            )
                throw new AppFault("INVALID_JOURNAL", "Invalid recovery journal.");
            string target = Paths.Under(root, t.Target),
                backup = Paths.Under(root, t.Backup),
                receipt = Paths.Under(root, t.Receipt);
            if (Directory.Exists(backup))
            {
                Paths.DeleteTree(root, t.Target);
                Directory.CreateDirectory(Path.GetDirectoryName(target)!);
                Directory.Move(backup, target);
            }
            else if (!t.HadTarget)
            {
                Paths.DeleteTree(root, t.Target);
            }
            if (t.PreviousReceipt == null)
            {
                if (File.Exists(receipt))
                    File.Delete(receipt);
            }
            else
                File.WriteAllText(receipt, t.PreviousReceipt);
            Paths.DeleteTree(root, t.Stage);
            File.Delete(file);
        }
    }

    public async Task Install(Package p, Job job, CancellationToken ct)
    {
        string root = detection.Require();
        Paths.NoLinks(root);
        string transaction = Guid.NewGuid().ToString("N"),
            stageRel = ".ec3/staging/" + transaction,
            backupRel = ".ec3/backups/" + transaction;
        string stage = Paths.Under(root, stageRel),
            target = Paths.Under(root, p.InstallPath),
            backup = Paths.Under(root, backupRel);
        string archive = Paths.Under(root, ".ec3/downloads/" + transaction + ".zip");
        string journal = Paths.Under(root, ".ec3/transactions/" + transaction + ".json");
        long needed = checked(p.Size + p.Files.Sum(f => f.Size) + 64 * 1024 * 1024);
        var drive = new DriveInfo(Path.GetPathRoot(root)!);
        if (drive.AvailableFreeSpace < needed)
            throw new AppFault(
                "NOT_ENOUGH_DISK_SPACE",
                "Free disk space before retrying this package."
            );
        Directory.CreateDirectory(Path.GetDirectoryName(archive)!);
        try
        {
            await downloads.Fetch(p, archive, job, ct);
            job.State = "extracting";
            await extraction.Extract(archive, stage, p, ct);
            job.State = "verifying";
            if (await VerifyFolder(stage, p.Files, job, ct) != 0)
                throw new AppFault(
                    "CHECKSUM_MISMATCH",
                    "Extracted files failed SHA256 verification."
                );
            ct.ThrowIfCancellationRequested();
            await commitLock.WaitAsync(ct);
            try
            {
                job.State = "installing";
                Paths.NoLinks(target);
                if (Directory.Exists(target))
                { // Inspect all existing descendants before moving a directory tree.
                    var dirs = new Stack<string>();
                    dirs.Push(target);
                    while (dirs.Count > 0)
                        foreach (var entry in Directory.EnumerateFileSystemEntries(dirs.Pop()))
                        {
                            Paths.NoLinks(entry);
                            if (Directory.Exists(entry))
                                dirs.Push(entry);
                        }
                }
                Directory.CreateDirectory(Path.GetDirectoryName(target)!);
                Directory.CreateDirectory(Path.GetDirectoryName(backup)!);
                Directory.CreateDirectory(Path.GetDirectoryName(journal)!);
                var receipt = ReceiptPath(root, p.Id);
                Directory.CreateDirectory(Path.GetDirectoryName(receipt)!);
                string? previous = File.Exists(receipt) ? File.ReadAllText(receipt) : null;
                File.WriteAllText(
                    journal,
                    JsonSerializer.Serialize(
                        new Transaction(
                            p.InstallPath,
                            backupRel,
                            stageRel,
                            Path.GetRelativePath(root, receipt).Replace('\\', '/'),
                            previous,
                            Directory.Exists(target)
                        ),
                        Json.Options
                    )
                );
                try
                {
                    if (Directory.Exists(target))
                        Directory.Move(target, backup);
                    Directory.Move(stage, target);
                    job.State = "verifying";
                    if (await VerifyFolder(target, p.Files, job, CancellationToken.None) != 0)
                        throw new AppFault(
                            "INSTALLATION_INVALID",
                            "Installed files failed verification."
                        );
                    var state = new Installed(
                        p.Id,
                        p.Version,
                        p.InstallPath,
                        p.Files,
                        DateTimeOffset.UtcNow
                    );
                    var temp = receipt + ".tmp";
                    Paths.NoLinks(temp);
                    File.WriteAllText(temp, JsonSerializer.Serialize(state, Json.Options));
                    File.Move(temp, receipt, true);
                    File.Delete(journal);
                }
                catch
                {
                    Recover(root);
                    throw;
                }
                logger.LogInformation(
                    "Installed {Package} {Version}; recovery backup {Backup}",
                    p.Id,
                    p.Version,
                    backupRel
                );
            }
            finally
            {
                commitLock.Release();
            }
        }
        finally
        {
            if (File.Exists(archive))
                File.Delete(archive);
            Paths.DeleteTree(root, stageRel);
        }
    }
}
