using System.Diagnostics;
using System.Runtime.InteropServices;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace Eurocup3;

public sealed class DesktopWindowHost : IDisposable
{
    const string AppUrl = "http://127.0.0.1:32145/?desktop=1";
    readonly ManualResetEventSlim ready = new();
    readonly TaskCompletionSource closed = new(TaskCreationOptions.RunContinuationsAsynchronously);
    readonly Thread thread;
    DesktopWindow? window;

    DesktopWindowHost()
    {
        thread = new Thread(Run) { Name = "Eurocup 3 desktop window" };
        thread.SetApartmentState(ApartmentState.STA);
        thread.Start();
        ready.Wait();
    }

    public Task Closed => closed.Task;

    public static DesktopWindowHost Start() => new();

    void Run()
    {
        try
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            window = new DesktopWindow(AppUrl);
            ready.Set();
            Application.Run(window);
            closed.TrySetResult();
        }
        catch (Exception ex)
        {
            closed.TrySetException(ex);
            ready.Set();
        }
    }

    public void Show()
    {
        var current = window;
        if (current is null || current.IsDisposed || !current.IsHandleCreated)
            return;
        try
        {
            current.BeginInvoke((MethodInvoker)current.ShowFromTray);
        }
        catch (InvalidOperationException) { }
    }

    public void Close()
    {
        var current = window;
        if (current is null || current.IsDisposed || !current.IsHandleCreated)
            return;
        try
        {
            current.BeginInvoke((MethodInvoker)current.ExitApplication);
        }
        catch (InvalidOperationException) { }
    }

    public void Dispose()
    {
        ready.Dispose();
        if (thread.IsAlive)
            thread.Join(TimeSpan.FromSeconds(2));
    }
}

sealed class DesktopWindow : Form
{
    const int DwmwaUseImmersiveDarkMode = 20;
    const int DwmwaUseImmersiveDarkModeBeforeWindows11 = 19;
    const int DwmwaCaptionColor = 35;
    const int DwmwaTextColor = 36;
    readonly WebView2 browser = new() { Dock = DockStyle.Fill };
    readonly Icon applicationIcon = AppIcon.Load();
    bool exiting;

    [DllImport("dwmapi.dll", PreserveSig = true)]
    static extern int DwmSetWindowAttribute(IntPtr hwnd, int attribute, ref int value, int size);

    public DesktopWindow(string appUrl)
    {
        Text = "Eurocup 3 Content Manager";
        StartPosition = FormStartPosition.CenterScreen;
        MinimumSize = new Size(900, 620);
        Size = new Size(1480, 940);
        Icon = applicationIcon;
        Controls.Add(browser);
        Shown += (_, _) => ApplyDarkTitleBar();
        FormClosing += (_, args) =>
        {
            if (exiting)
                return;
            args.Cancel = true;
            Hide();
        };
        Shown += async (_, _) => await LoadApplication(appUrl);
    }

    void ApplyDarkTitleBar()
    {
        int dark = 1;
        if (DwmSetWindowAttribute(Handle, DwmwaUseImmersiveDarkMode, ref dark, sizeof(int)) < 0)
            DwmSetWindowAttribute(Handle, DwmwaUseImmersiveDarkModeBeforeWindows11, ref dark, sizeof(int));

        int caption = ColorTranslator.ToWin32(Color.FromArgb(17, 18, 21));
        int text = ColorTranslator.ToWin32(Color.FromArgb(242, 244, 245));
        DwmSetWindowAttribute(Handle, DwmwaCaptionColor, ref caption, sizeof(int));
        DwmSetWindowAttribute(Handle, DwmwaTextColor, ref text, sizeof(int));
    }

    async Task LoadApplication(string appUrl)
    {
        try
        {
            var userData = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "Eurocup3",
                "WebView2"
            );
            var environment = await CoreWebView2Environment.CreateAsync(
                userDataFolder: userData
            );
            await browser.EnsureCoreWebView2Async(environment);
            browser.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
            browser.CoreWebView2.Settings.AreDevToolsEnabled = false;
            browser.CoreWebView2.NavigationStarting += (_, args) =>
            {
                if (!Uri.TryCreate(args.Uri, UriKind.Absolute, out var uri))
                    return;
                if (
                    uri.Scheme == Uri.UriSchemeHttp
                    && uri.Host == "127.0.0.1"
                    && uri.Port == 32145
                )
                    return;
                args.Cancel = true;
                OpenExternal(uri);
            };
            browser.CoreWebView2.NewWindowRequested += (_, args) =>
            {
                args.Handled = true;
                if (Uri.TryCreate(args.Uri, UriKind.Absolute, out var uri))
                    OpenExternal(uri);
            };
            browser.CoreWebView2.Navigate(appUrl);
        }
        catch (Exception ex)
        {
            Controls.Remove(browser);
            var notice = new Label
            {
                Dock = DockStyle.Fill,
                TextAlign = ContentAlignment.MiddleCenter,
                Padding = new Padding(40),
                Text =
                    "No se pudo iniciar el componente de escritorio de Microsoft Edge.\n\n"
                    + "Instala Microsoft Edge WebView2 Runtime y vuelve a abrir Eurocup 3.\n\n"
                    + ex.Message,
            };
            Controls.Add(notice);
            var download = new LinkLabel
            {
                AutoSize = true,
                Text = "Descargar WebView2 Runtime",
                Anchor = AnchorStyles.None,
            };
            download.Click += (_, _) =>
                Process.Start(
                    new ProcessStartInfo("https://developer.microsoft.com/microsoft-edge/webview2/")
                    {
                        UseShellExecute = true,
                    }
                );
            notice.Controls.Add(download);
            download.Location = new Point(
                Math.Max(0, (ClientSize.Width - download.PreferredWidth) / 2),
                ClientSize.Height / 2 + 55
            );
        }
    }

    static void OpenExternal(Uri uri)
    {
        if (uri.Scheme is not ("https" or "http"))
            return;
        Process.Start(new ProcessStartInfo(uri.ToString()) { UseShellExecute = true });
    }

    public void ShowFromTray()
    {
        Show();
        if (WindowState == FormWindowState.Minimized)
            WindowState = FormWindowState.Normal;
        Activate();
    }

    public void ExitApplication()
    {
        exiting = true;
        Close();
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        if (disposing)
            applicationIcon.Dispose();
    }
}
