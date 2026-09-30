using System.Diagnostics;
using System.Net;
using System.Security.Cryptography;
using System.Text.Json;

namespace Eurocup3;

public static class Program
{
    public const string Version = "1.2.0";

    public static async Task Main(string[] args)
    {
        using var showWindow = new EventWaitHandle(
            false,
            EventResetMode.AutoReset,
            "Local\\Eurocup3.ContentManager.ShowWindow"
        );
        using var singleton = new Mutex(true, "Local\\Eurocup3.ContentManager", out bool first);
        if (!first && Environment.GetEnvironmentVariable("EC3_TEST_MODE") != "1")
        {
            showWindow.Set();
            return;
        }
        bool desktopMode =
            Environment.GetEnvironmentVariable("EC3_TEST_MODE") != "1"
            && Environment.GetEnvironmentVariable("EC3_NO_BROWSER") != "1";
        var webRoot = Path.Combine(AppContext.BaseDirectory, "wwwroot");
        if (!Directory.Exists(webRoot))
            webRoot = Path.Combine(Directory.GetCurrentDirectory(), "dist");
        var builder = WebApplication.CreateBuilder(
            new WebApplicationOptions { Args = args, WebRootPath = webRoot }
        );
        int apiPort =
            Environment.GetEnvironmentVariable("EC3_TEST_MODE") == "1"
            && int.TryParse(Environment.GetEnvironmentVariable("EC3_TEST_API_PORT"), out var testPort)
                ? testPort
                : 32145;
        string apiOrigin = $"http://127.0.0.1:{apiPort}";
        builder.WebHost.UseUrls(apiOrigin);
        builder.WebHost.ConfigureKestrel(o => o.Limits.MaxRequestBodySize = 16384);
        var config = new ConfigService();
        builder.Services.AddSingleton(config);
        builder.Services.AddSingleton<AssettoDetectionService>();
        builder.Services.AddSingleton<ManifestService>();
        builder.Services.AddSingleton<ResultsService>();
        builder.Services.AddSingleton<DownloadService>();
        builder.Services.AddSingleton<ExtractionService>();
        builder.Services.AddSingleton<InstallationService>();
        builder.Services.AddSingleton<ContentService>();
        builder.Logging.AddFilter("Microsoft.AspNetCore", LogLevel.Warning);
        builder.Logging.AddProvider(new FileLoggerProvider(Path.Combine(config.DataRoot, "logs")));
        var app = builder.Build();
        string token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
        app.Use(
            async (ctx, next) =>
            {
                ctx.Response.Headers["X-Content-Type-Options"] = "nosniff";
                ctx.Response.Headers["Referrer-Policy"] = "same-origin";
                ctx.Response.Headers["Content-Security-Policy"] =
                    $"default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' {apiOrigin}; frame-ancestors 'none'; base-uri 'self'; object-src 'none'";
                if (
                    ctx.Connection.RemoteIpAddress is not { } ip
                    || !IPAddress.IsLoopback(ip)
                    || ctx.Request.Host.Value != $"127.0.0.1:{apiPort}"
                )
                {
                    ctx.Response.StatusCode = 403;
                    return;
                }
                if (ctx.Request.Path.StartsWithSegments("/api"))
                {
                    string origin = ctx.Request.Headers.Origin.ToString();
                    if (
                        origin == ""
                        && Uri.TryCreate(
                            ctx.Request.Headers.Referer.ToString(),
                            UriKind.Absolute,
                            out var referer
                        )
                    )
                        origin = referer.GetLeftPart(UriPartial.Authority);
                    if (!config.Value.AllowedOrigins.Contains(origin, StringComparer.Ordinal))
                    {
                        ctx.Response.StatusCode = 403;
                        return;
                    }
                    ctx.Response.Headers.AccessControlAllowOrigin = origin;
                    ctx.Response.Headers.Vary = "Origin";
                    ctx.Response.Headers.AccessControlAllowHeaders =
                        "Content-Type, X-EC3-Client, X-EC3-Token";
                    ctx.Response.Headers.AccessControlAllowMethods = "GET, POST, OPTIONS";
                    ctx.Response.Headers["Access-Control-Allow-Private-Network"] = "true";
                    ctx.Response.Headers.CacheControl = "no-store";
                    if (ctx.Request.Method == "OPTIONS")
                    {
                        ctx.Response.StatusCode = 204;
                        return;
                    }
                    if (ctx.Request.Headers["X-EC3-Client"] != "1")
                    {
                        ctx.Response.StatusCode = 403;
                        return;
                    }
                    if (
                        ctx.Request.Path != "/api/session"
                        && !CryptographicOperations.FixedTimeEquals(
                            System.Text.Encoding.UTF8.GetBytes(
                                ctx.Request.Headers["X-EC3-Token"].ToString()
                            ),
                            System.Text.Encoding.UTF8.GetBytes(token)
                        )
                    )
                    {
                        ctx.Response.StatusCode = 401;
                        return;
                    }
                }
                try
                {
                    await next();
                }
                catch (Exception ex)
                {
                    app.Logger.LogError(ex, "Local API operation failed");
                    if (!ctx.Response.HasStarted)
                    {
                        ctx.Response.StatusCode = ex is AppFault ? 400 : 500;
                        await ctx.Response.WriteAsJsonAsync(
                            new
                            {
                                code = (ex as AppFault)?.Code ?? "OPERATION_FAILED",
                                message = ContentService.Friendly(ex),
                            }
                        );
                    }
                }
            }
        );
        app.UseDefaultFiles();
        app.UseStaticFiles();
        app.MapPost("/api/session", () => new { token, version = Version });
        app.MapGet(
            "/api/status",
            (AssettoDetectionService d, ContentService c, ManifestService m) =>
            {
                var jobs = c.Jobs();
                var content = c.Status()
                    .Select(x => x with { Package = x.Package with { Files = [] } })
                    .ToArray();
                var catalog = m.Current is { } current
                    ? current with
                    {
                        Manifest = current.Manifest with
                        {
                            Content = current
                                .Manifest.Content.Select(p => p with { Files = [] })
                                .ToArray(),
                        },
                    }
                    : null;
                return new
                {
                    version = Version,
                    assettoPath = d.Find(),
                    cspVersion = d.CspVersion(),
                    testMode = config.TestMode,
                    catalog,
                    catalogError = m.LastError,
                    content,
                    jobs,
                    raceReady = c.RaceReady(),
                };
            }
        );
        app.MapGet(
            "/api/results",
            async (bool? refresh, ManifestService m, ResultsService r, CancellationToken ct) =>
                await r.Get(m.Require().Championship, refresh == true, ct)
        );
        app.MapGet(
            "/api/packages/{id}",
            (string id, ManifestService m) =>
                m.Require().Manifest.Content.FirstOrDefault(p => p.Id == id)
                ?? throw new AppFault(
                    "PACKAGE_NOT_FOUND",
                    "Package no longer exists in the catalog."
                )
        );
        var operations = new SemaphoreSlim(1);
        app.MapPost(
            "/api/refresh",
            async (ManifestService m, ContentService c, AssettoDetectionService d) =>
            {
                await operations.WaitAsync();
                try
                {
                    if (c.Busy)
                        throw new AppFault("BUSY", "Wait for the current queue before refreshing.");
                    var catalog = await m.Refresh();
                    c.Reset();
                    if (d.Find() != null)
                    {
                        InstallationService.Recover(d.Require());
                        c.Enqueue(catalog.Manifest.Content.Select(p => p.Id).ToArray(), "verify");
                    }
                    return catalog;
                }
                finally
                {
                    operations.Release();
                }
            }
        );
        foreach (var action in new[] { "install", "update", "repair", "verify" })
        {
            var selected = action;
            app.MapPost(
                "/api/" + action,
                async (Request request, ManifestService m, ContentService c) =>
                {
                    await operations.WaitAsync();
                    try
                    {
                        var catalog =
                            selected == "update" && !c.Busy ? await m.Refresh() : m.Require();
                        string[] ids =
                            request.Ids is null || request.Ids.Length == 0
                                ? catalog.Manifest.Content.Select(p => p.Id).ToArray()
                                : request.Ids;
                        return c.Enqueue(ids, selected);
                    }
                    finally
                    {
                        operations.Release();
                    }
                }
            );
        }
        app.MapPost(
            "/api/jobs/{id}/{action}",
            (string id, string action, ContentService c) => c.Control(id, action)
        );
        app.MapPost(
            "/api/select-folder",
            async (AssettoDetectionService d, ContentService c) =>
            {
                await operations.WaitAsync();
                try
                {
                    c.Reset();
                    var tcs = new TaskCompletionSource<string?>();
                    var thread = new Thread(() =>
                    {
                        try
                        {
                            using var dialog = new System.Windows.Forms.FolderBrowserDialog
                            {
                                Description = "Select Assetto Corsa (folder containing acs.exe)",
                                UseDescriptionForTitle = true,
                            };
                            tcs.SetResult(
                                dialog.ShowDialog() == System.Windows.Forms.DialogResult.OK
                                    ? dialog.SelectedPath
                                    : null
                            );
                        }
                        catch (Exception ex)
                        {
                            tcs.SetException(ex);
                        }
                    });
                    thread.SetApartmentState(ApartmentState.STA);
                    thread.Start();
                    var path = await tcs.Task;
                    if (path != null)
                    {
                        d.Select(path);
                        InstallationService.Recover(path);
                    }
                    return new
                    {
                        path
                    };
                }
                finally
                {
                    operations.Release();
                }
            }
        );
        app.MapPost(
            "/api/open-assetto-folder",
            (AssettoDetectionService d) =>
            {
                Process.Start(new ProcessStartInfo(d.Require()) { UseShellExecute = true });
                return Results.Ok();
            }
        );
        app.MapPost(
            "/api/open-logs",
            () =>
            {
                var path = Path.Combine(config.DataRoot, "logs");
                Directory.CreateDirectory(path);
                Process.Start(new ProcessStartInfo(path) { UseShellExecute = true });
                return Results.Ok();
            }
        );
        app.MapGet(
            "/api/helper-update",
            async () =>
            {
                if (
                    !System.Text.RegularExpressions.Regex.IsMatch(
                        config.Value.HelperRepository,
                        @"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$"
                    )
                )
                    throw new AppFault("INVALID_CONFIG", "Invalid helper repository.");
                using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(15) };
                http.DefaultRequestHeaders.UserAgent.ParseAdd("Eurocup3-Helper/" + Version);
                using var doc = JsonDocument.Parse(
                    await http.GetStringAsync(
                        "https://api.github.com/repos/"
                            + config.Value.HelperRepository
                            + "/releases/latest"
                    )
                );
                var tag = doc.RootElement.GetProperty("tag_name").GetString()!.TrimStart('v');
                return new
                {
                    version = tag,
                    available = Versions.Valid(tag) && Versions.Compare(tag, Version) > 0,
                    url = "https://github.com/"
                        + config.Value.HelperRepository
                        + "/releases/latest",
                    automaticInstall = false,
                };
            }
        );
        app.MapFallbackToFile("index.html");
        var detector = app.Services.GetRequiredService<AssettoDetectionService>();
        if (detector.Find() is string root)
            InstallationService.Recover(root);
        var periodic = Task.Run(async () =>
        {
            using var timer = new PeriodicTimer(TimeSpan.FromMinutes(5));
            try
            {
                while (await timer.WaitForNextTickAsync(app.Lifetime.ApplicationStopping))
                {
                    await operations.WaitAsync(app.Lifetime.ApplicationStopping);
                    try
                    {
                        var content = app.Services.GetRequiredService<ContentService>();
                        if (content.Busy)
                            continue;
                        var manifest = app.Services.GetRequiredService<ManifestService>();
                        var current = await manifest.Refresh(app.Lifetime.ApplicationStopping);
                        content.Reset();
                        if (detector.Find() != null)
                            content.Enqueue(
                                current.Manifest.Content.Select(p => p.Id).ToArray(),
                                "verify"
                            );
                    }
                    catch (Exception ex)
                    {
                        app.Logger.LogWarning(ex, "Automatic catalog refresh failed");
                    }
                    finally
                    {
                        operations.Release();
                    }
                }
            }
            catch (OperationCanceledException) { }
        });
        if (!desktopMode)
        {
            await app.RunAsync();
        }
        else
        {
            await app.StartAsync();
            using var window = DesktopWindowHost.Start();
            Tray.Start(app.Lifetime, config, window.Show);
            using var stopWindow = app.Lifetime.ApplicationStopping.Register(window.Close);
            var showWindowWatcher = Task.Run(() =>
            {
                while (!app.Lifetime.ApplicationStopping.IsCancellationRequested)
                {
                    if (showWindow.WaitOne(400))
                        window.Show();
                }
            });
            await window.Closed;
            await app.StopAsync();
            await showWindowWatcher;
        }
        await periodic;
    }

    public sealed record Request(string[] Ids);
}
