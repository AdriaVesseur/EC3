using System.Security.Cryptography;
using System.Text.RegularExpressions;

namespace Eurocup3;

public static class HashService
{
    public static bool Valid(string hash) =>
        Regex.IsMatch(hash ?? "", @"^[a-fA-F0-9]{64}$") && hash!.Any(c => c != '0');

    public static async Task<string> Sha256(string path, CancellationToken ct = default)
    {
        Paths.NoLinks(path);
        await using var f = new FileStream(
            path,
            FileMode.Open,
            FileAccess.Read,
            FileShare.Read,
            131072,
            true
        );
        return Convert.ToHexString(await SHA256.HashDataAsync(f, ct)).ToLowerInvariant();
    }

    public static async Task<bool> Matches(
        string path,
        FileSpec spec,
        CancellationToken ct = default
    ) =>
        File.Exists(path)
        && new FileInfo(path).Length == spec.Size
        && string.Equals(await Sha256(path, ct), spec.Sha256, StringComparison.OrdinalIgnoreCase);
}
