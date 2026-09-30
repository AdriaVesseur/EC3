using System.Drawing;

namespace Eurocup3;

public static class AppIcon
{
    public static Icon Load(int size = 32)
    {
        using var stream = typeof(AppIcon).Assembly.GetManifestResourceStream("Eurocup3.Assets.ec3.ico")
            ?? throw new InvalidOperationException("The embedded EC3 application icon is missing.");
        using var icon = new Icon(stream, new Size(size, size));
        return (Icon)icon.Clone();
    }
}
