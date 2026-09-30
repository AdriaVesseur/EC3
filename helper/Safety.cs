using System.Numerics;
using System.Text.RegularExpressions;

namespace Eurocup3;

public static class Versions
{
    static readonly Regex Pattern = new(
        @"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$",
        RegexOptions.CultureInvariant
    );

    public static bool Valid(string s) =>
        s is not null
        && Pattern.IsMatch(s)
        && (
            Pattern.Match(s).Groups[4].Value == ""
            || Pattern
                .Match(s)
                .Groups[4]
                .Value.Split('.')
                .All(x => !x.All(char.IsDigit) || x.Length == 1 || x[0] != '0')
        );

    public static int Compare(string a, string b)
    {
        if (!Valid(a) || !Valid(b))
            throw new AppFault("INVALID_VERSION", "Invalid semantic version.");
        var x = Pattern.Match(a);
        var y = Pattern.Match(b);
        for (int i = 1; i <= 3; i++)
        {
            int c = BigInteger
                .Parse(x.Groups[i].Value)
                .CompareTo(BigInteger.Parse(y.Groups[i].Value));
            if (c != 0)
                return c;
        }
        string p = x.Groups[4].Value,
            q = y.Groups[4].Value;
        if (p == q)
            return 0;
        if (p == "")
            return 1;
        if (q == "")
            return -1;
        var ps = p.Split('.');
        var qs = q.Split('.');
        for (int i = 0; i < Math.Min(ps.Length, qs.Length); i++)
        {
            bool pn = BigInteger.TryParse(ps[i], out var pi),
                qn = BigInteger.TryParse(qs[i], out var qi);
            int c =
                pn && qn ? pi.CompareTo(qi)
                : pn ? -1
                : qn ? 1
                : string.CompareOrdinal(ps[i], qs[i]);
            if (c != 0)
                return c;
        }
        return ps.Length.CompareTo(qs.Length);
    }
}

public static class Paths
{
    static readonly Regex Reserved = new(
        @"^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant
    );

    public static void Relative(string path)
    {
        if (
            string.IsNullOrWhiteSpace(path)
            || path.Length > 220
            || path.Contains('\\')
            || path.StartsWith('/')
            || path.Split('/')
                .Any(s =>
                    s.Length == 0
                    || s is "." or ".."
                    || s.EndsWith('.')
                    || s.EndsWith(' ')
                    || Reserved.IsMatch(s)
                    || s.Any(c => c < 32 || "<>:\"|?*".Contains(c))
                )
        )
            throw new AppFault("UNSAFE_PATH", $"Unsafe relative path: {path}");
    }

    public static void Install(string path)
    {
        Relative(path);
        if (
            !new[] { "content/cars/", "content/tracks/", "apps/python/", "extension/config/" }.Any(
                p => path.StartsWith(p, StringComparison.Ordinal)
            )
            || path.Split('/').Length < 3
        )
            throw new AppFault(
                "UNSAFE_PATH",
                "Only dedicated car, track, app and extension config folders are permitted."
            );
    }

    public static string Under(string root, string relative)
    {
        Relative(relative);
        var full = Path.GetFullPath(Path.Combine(root, relative));
        if (
            !full.StartsWith(
                Path.GetFullPath(root).TrimEnd(Path.DirectorySeparatorChar)
                    + Path.DirectorySeparatorChar,
                StringComparison.OrdinalIgnoreCase
            )
        )
            throw new AppFault("UNSAFE_PATH", "Path escapes its root.");
        NoLinks(full);
        return full;
    }

    public static void NoLinks(string path)
    {
        for (var p = Path.GetFullPath(path); !string.IsNullOrEmpty(p); p = Path.GetDirectoryName(p))
            if (
                (File.Exists(p) || Directory.Exists(p))
                && (File.GetAttributes(p) & FileAttributes.ReparsePoint) != 0
            )
                throw new AppFault(
                    "UNSAFE_LINK",
                    "Linked folders or files cannot be used for installation."
                );
    }

    public static void DeleteTree(string root, string relative)
    {
        var path = Under(root, relative);
        if (!Directory.Exists(path))
            return;
        foreach (
            var p in Directory.EnumerateFileSystemEntries(path, "*", SearchOption.TopDirectoryOnly)
        )
        {
            NoLinks(p);
            if (Directory.Exists(p))
                DeleteTree(root, Path.GetRelativePath(root, p).Replace('\\', '/'));
            else
                File.Delete(p);
        }
        Directory.Delete(path);
    }
}

public static class Dependencies
{
    public static Package[] Resolve(Manifest manifest, IEnumerable<string> requested)
    {
        var all = manifest.Content.ToDictionary(x => x.Id);
        var done = new HashSet<string>();
        var visiting = new HashSet<string>();
        var result = new List<Package>();
        void Visit(string id)
        {
            if (done.Contains(id))
                return;
            if (!all.TryGetValue(id, out var p))
                throw new AppFault("DEPENDENCY_MISSING", $"Unknown package: {id}");
            if (!visiting.Add(id))
                throw new AppFault("DEPENDENCY_CYCLE", "Circular package dependency.");
            foreach (var d in p.Dependencies)
            {
                if (
                    !all.TryGetValue(d.Id, out var target)
                    || Versions.Compare(target.Version, d.MinimumVersion) < 0
                )
                    throw new AppFault("DEPENDENCY_VERSION", $"Unsatisfied dependency: {d.Id}");
                Visit(d.Id);
            }
            visiting.Remove(id);
            done.Add(id);
            result.Add(p);
        }
        foreach (var id in requested)
            Visit(id);
        return result.ToArray();
    }
}
