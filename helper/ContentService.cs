using System.Collections.Concurrent;

namespace Eurocup3;

public sealed class ContentService(
    ManifestService manifests,
    AssettoDetectionService detection,
    InstallationService installer,
    ConfigService config,
    ILogger<ContentService> logger
)
{
    readonly ConcurrentDictionary<string, Job> jobs = new();
    readonly ConcurrentDictionary<string, ContentStatus> status = new();
    readonly Dictionary<string, Task> running = new();
    readonly object sync = new();
    readonly SemaphoreSlim slots = new(Math.Clamp(config.Value.ParallelDownloads, 1, 3));
    public bool Busy =>
        jobs.Values.Any(j =>
            j.State
                is "queued"
                    or "downloading"
                    or "paused"
                    or "checking"
                    or "extracting"
                    or "installing"
                    or "verifying"
        );

    public Job[] Jobs() =>
        jobs
            .Values.OrderBy(j => j.CreatedAt)
            .Select(j => new Job
            {
                Id = j.Id,
                PackageId = j.PackageId,
                Name = j.Name,
                Action = j.Action,
                State = j.State,
                Bytes = j.Bytes,
                Total = j.Total,
                BytesPerSecond = j.BytesPerSecond,
                CheckedFiles = j.CheckedFiles,
                TotalFiles = j.TotalFiles,
                Error = j.Error,
                CreatedAt = j.CreatedAt,
            })
            .ToArray();

    public ContentStatus[] Status()
    {
        var root = detection.Find();
        return manifests
                .Current?.Manifest.Content.Select(p =>
                {
                    if (root == null)
                        return new ContentStatus(p, "missing", null, 0, 0, null);
                    if (status.TryGetValue(p.Id, out var s) && s.Package == p)
                        return s;
                    if (!Directory.Exists(Paths.Under(root, p.InstallPath)))
                        return new ContentStatus(p, "missing", null, 0, 0, null);
                    var receipt = InstallationService.Receipt(root, p.Id);
                    return new ContentStatus(
                        p,
                        receipt?.Version is string version && version != p.Version
                            ? "outdated"
                            : "unverified",
                        receipt?.Version,
                        0,
                        0,
                        null
                    );
                })
                .ToArray()
            ?? [];
    }

    public void Reset()
    {
        if (Busy)
            throw new AppFault("BUSY", "Wait for current operations to finish.");
        status.Clear();
    }

    public Job[] Enqueue(string[] ids, string action)
    {
        var catalog = manifests.Require();
        var packages = Dependencies.Resolve(catalog.Manifest, ids);
        detection.Require();
        if (
            action != "verify"
            && Versions.Compare(Program.Version, catalog.Championship.MinimumHelperVersion) < 0
        )
            throw new AppFault(
                "HELPER_UPDATE_REQUIRED",
                "Update the helper before installing this build."
            );
        lock (sync)
        {
            var result = new List<Job>();
            foreach (var p in packages)
            {
                var existing = jobs.Values.FirstOrDefault(j =>
                    j.PackageId == p.Id
                    && j.State
                        is (
                            "queued"
                            or "downloading"
                            or "paused"
                            or "checking"
                            or "extracting"
                            or "installing"
                            or "verifying"
                        )
                );
                if (existing != null)
                {
                    result.Add(existing);
                    continue;
                }
                var job = new Job
                {
                    PackageId = p.Id,
                    Name = p.Name,
                    Action = action,
                    Total = p.Size,
                    TotalFiles = p.Files.Length,
                };
                jobs[job.Id] = job;
                var waits = p
                    .Dependencies.Where(d => running.ContainsKey(d.Id))
                    .Select(d => running[d.Id])
                    .ToArray();
                running[p.Id] = Task.Run(async () =>
                {
                    try
                    {
                        await Task.WhenAll(waits);
                        job.Cancellation.Token.ThrowIfCancellationRequested();
                        if (
                            action != "verify"
                            && p.Dependencies.Any(d =>
                                !status.TryGetValue(d.Id, out var s) || s.State != "ready"
                            )
                        )
                            throw new AppFault(
                                "DEPENDENCY_FAILED",
                                "A required package could not be installed. Retry its dependency first."
                            );
                        await slots.WaitAsync(job.Cancellation.Token);
                        try
                        {
                            await Execute(p, job);
                        }
                        finally
                        {
                            slots.Release();
                        }
                    }
                    catch (OperationCanceledException)
                        when (job.Cancellation.IsCancellationRequested)
                    {
                        job.State = "cancelled";
                        job.Error = "Operation cancelled. Retry starts a new download.";
                    }
                    catch (Exception ex)
                    {
                        status.TryRemove(p.Id, out _);
                        job.State = "failed";
                        job.Error = Friendly(ex);
                        logger.LogError(ex, "Package operation failed: {Package}", p.Id);
                    }
                });
                result.Add(job);
            }
            foreach (
                var old in jobs
                    .Values.Where(j => j.State is "complete" or "cancelled" or "failed")
                    .OrderByDescending(j => j.CreatedAt)
                    .Skip(100)
            )
                jobs.TryRemove(old.Id, out _);
            return result.ToArray();
        }
    }

    async Task Execute(Package p, Job job)
    {
        var ct = job.Cancellation.Token;
        var root = detection.Require();
        var receipt = InstallationService.Receipt(root, p.Id);
        job.State = "verifying";
        int invalid = await InstallationService.VerifyFolder(
            Paths.Under(root, p.InstallPath),
            p.Files,
            job,
            ct
        );
        bool folderExists = Directory.Exists(Paths.Under(root, p.InstallPath));
        var observed = Classify(p, receipt, folderExists, invalid);
        bool valid = observed.State == "ready";
        status[p.Id] = new(
            p,
            observed.State,
            observed.InstalledVersion,
            job.CheckedFiles,
            invalid,
            DateTimeOffset.UtcNow
        );
        if (job.Action != "verify" && !valid)
        {
            if (
                p.MinimumCspVersion != null
                && (
                    detection.CspVersion() is not string csp
                    || Versions.Compare(csp, p.MinimumCspVersion) < 0
                )
            )
                throw new AppFault(
                    "CSP_UPDATE_REQUIRED",
                    "Install a compatible Custom Shaders Patch, then retry. CSP is never installed automatically."
                );
            await installer.Install(p, job, ct);
            invalid = 0;
            receipt = InstallationService.Receipt(root, p.Id);
            valid = true;
        }
        var state =
            Classify(p, receipt, Directory.Exists(Paths.Under(root, p.InstallPath)), invalid);
        status[p.Id] = new(
            p,
            state.State,
            state.InstalledVersion,
            job.CheckedFiles,
            invalid,
            DateTimeOffset.UtcNow
        );
        job.State = "complete";
        if (job.Action == "verify" && invalid > 0)
            job.Error = $"{invalid} missing, changed or unexpected files. Use Update or Repair to install the catalog version.";
        logger.LogInformation(
            "{Action} {Package}: {State}, {Invalid} invalid files",
            job.Action,
            p.Id,
            state.State,
            invalid
        );
    }

    public static (string State, string? InstalledVersion) Classify(
        Package package,
        Installed? receipt,
        bool folderExists,
        int invalidFiles
    )
    {
        if (!folderExists)
            return ("missing", null);
        if (invalidFiles == 0)
            return ("ready", package.Version);
        if (receipt?.Version == package.Version)
            return ("corrupted", receipt.Version);
        return ("outdated", receipt?.Version);
    }

    public Job Control(string id, string action)
    {
        if (!jobs.TryGetValue(id, out var j))
            throw new AppFault("JOB_NOT_FOUND", "This operation is no longer in the queue.");
        switch (action)
        {
            case "cancel":
                if (j.State is "installing" or "verifying")
                    throw new AppFault(
                        "ATOMIC_INSTALL",
                        "File verification or replacement is in progress; wait for it to finish."
                    );
                j.Cancellation.Cancel();
                break;
            case "pause":
                if (j.State != "downloading")
                    throw new AppFault("NOT_DOWNLOADING", "Only an active download can be paused.");
                j.Paused = true;
                break;
            case "resume":
                j.Paused = false;
                break;
            case "retry":
                if (j.State is not ("failed" or "cancelled"))
                    throw new AppFault("BUSY", "Only failed or cancelled jobs can be retried.");
                return Enqueue([j.PackageId], j.Action)[0];
            default:
                throw new AppFault("INVALID_ACTION", "Unknown queue action.");
        }
        return j;
    }

    public object RaceReady()
    {
        var cat = manifests.Current;
        if (cat == null)
            return new
            {
                ready = false,
                readyCount = 0,
                total = 0,
                reason = "Catalog unavailable",
            };
        var ids = Dependencies
            .Resolve(
                cat.Manifest,
                cat.Championship.RequiredContent.Concat(
                    cat.Manifest.Content.Where(p => p.Required).Select(p => p.Id)
                )
            )
            .Select(p => p.Id)
            .ToHashSet();
        var items = Status().Where(s => ids.Contains(s.Package.Id)).ToArray();
        var csp = detection.CspVersion();
        bool compatible = items.All(s =>
            s.Package.MinimumCspVersion == null
            || (csp != null && Versions.Compare(csp, s.Package.MinimumCspVersion) >= 0)
        );
        bool helper = Versions.Compare(Program.Version, cat.Championship.MinimumHelperVersion) >= 0;
        return new
        {
            ready = items.Length > 0
                && items.All(s => s.State == "ready")
                && compatible
                && helper
                && !Busy
                && manifests.LastError == null,
            readyCount = items.Count(s => s.State == "ready"),
            total = items.Length,
            cspCompatible = compatible,
            helperCompatible = helper,
            reason = !compatible ? "CSP update required"
            : !helper ? "Helper update required"
            : manifests.LastError != null ? "Catalog refresh failed"
            : "",
        };
    }

    public static string Friendly(Exception ex) =>
        ex switch
        {
            AppFault f => $"{f.Code}: {f.Message}",
            UnauthorizedAccessException =>
                "ACCESS_DENIED: Allow your Windows account to write to the game folder.",
            IOException =>
                "FILE_LOCKED_OR_DISK_ERROR: Close Assetto Corsa and check free disk space, then retry.",
            OperationCanceledException =>
                "DOWNLOAD_TIMEOUT: The download timed out. Retry when your connection is stable.",
            HttpRequestException =>
                "DOWNLOAD_FAILED: Check your connection and retry. The release asset may be unavailable.",
            _ => "OPERATION_FAILED: " + ex.Message,
        };
}
