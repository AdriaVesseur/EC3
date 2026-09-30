using System.IO.Compression;

namespace Eurocup3;

public sealed class ExtractionService
{
    public async Task Extract(string archive, string stage, Package package, CancellationToken ct)
    {
        Directory.CreateDirectory(stage);
        using var zip = ZipFile.OpenRead(archive);
        if (zip.Entries.Count > 100000)
            throw new AppFault("UNSAFE_ARCHIVE", "Too many archive entries.");
        var inventory = package.Files.ToDictionary(
            f => f.ArchivePath ?? f.Path,
            StringComparer.OrdinalIgnoreCase
        );
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var e in zip.Entries)
        {
            ct.ThrowIfCancellationRequested();
            string path = e.FullName;
            var attrs = (uint)e.ExternalAttributes;
            var unix = (attrs >> 16) & 0xF000;
            if (unix is not (0 or 0x8000 or 0x4000) || (attrs & 0x400) != 0)
                throw new AppFault(
                    "UNSAFE_ARCHIVE",
                    "Archive links and special files are not allowed."
                );
            if (path.EndsWith('/'))
            {
                Paths.Relative(path.TrimEnd('/'));
                continue;
            }
            Paths.Relative(path);
            if (!seen.Add(path) || !inventory.TryGetValue(path, out var spec) || e.Length != spec.Size)
                throw new AppFault(
                    "UNSAFE_ARCHIVE",
                    "Archive contents do not match the published file inventory."
                );
            string target = Paths.Under(stage, spec.Path);
            Directory.CreateDirectory(Path.GetDirectoryName(target)!);
            await using var input = e.Open();
            await using var output = new FileStream(
                target,
                FileMode.CreateNew,
                FileAccess.Write,
                FileShare.None,
                131072,
                true
            );
            var buffer = new byte[131072];
            long written = 0;
            int n;
            while ((n = await input.ReadAsync(buffer, ct)) > 0)
            {
                written += n;
                if (written > spec.Size)
                    throw new AppFault("UNSAFE_ARCHIVE", "Expanded file exceeds declared size.");
                await output.WriteAsync(buffer.AsMemory(0, n), ct);
            }
        }
        if (seen.Count != inventory.Count)
            throw new AppFault("UNSAFE_ARCHIVE", "Archive is missing required files.");
    }
}
