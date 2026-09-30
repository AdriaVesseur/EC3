using System.Diagnostics;

namespace Eurocup3;

public static class Tray
{
    public static void Start(
        IHostApplicationLifetime lifetime,
        ConfigService config,
        Action showWindow
    )
    {
        var thread = new Thread(() =>
        {
            System.Windows.Forms.Application.EnableVisualStyles();
            using var menu = new System.Windows.Forms.ContextMenuStrip();
            menu.Items.Add(
                "Open Eurocup 3 Content Manager",
                null,
                (_, _) => showWindow()
            );
            menu.Items.Add(
                "Open logs",
                null,
                (_, _) =>
                {
                    var path = Path.Combine(config.DataRoot, "logs");
                    Directory.CreateDirectory(path);
                    Process.Start(new ProcessStartInfo(path) { UseShellExecute = true });
                }
            );
            menu.Items.Add("Exit helper", null, (_, _) => lifetime.StopApplication());
            using var icon = new System.Windows.Forms.NotifyIcon
            {
                Icon = System.Drawing.SystemIcons.Application,
                Text = "Eurocup 3 Content Manager",
                ContextMenuStrip = menu,
                Visible = true,
            };
            icon.DoubleClick += (_, _) => showWindow();
            using var context = new System.Windows.Forms.ApplicationContext();
            using var timer = new System.Windows.Forms.Timer { Interval = 500 };
            timer.Tick += (_, _) =>
            {
                if (lifetime.ApplicationStopping.IsCancellationRequested)
                    context.ExitThread();
            };
            timer.Start();
            System.Windows.Forms.Application.Run(context);
            icon.Visible = false;
        });
        thread.SetApartmentState(ApartmentState.STA);
        thread.IsBackground = true;
        thread.Start();
    }
}
