using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using Eurocup3;

public static class AppUpdateTests
{
    const string Repository = "Eurocup3/test";
    static readonly DateTimeOffset Published = DateTimeOffset.Parse("2026-09-01T12:00:00Z");

    public static async Task Run(
        Action<bool, string> assert,
        Func<Func<Task>, string, Task> rejectAsync
    )
    {
        AppRelease Release(string tag, bool app = true, bool draft = false, bool prerelease = false) => new()
        {
            TagName = tag,
            Draft = draft,
            Prerelease = prerelease,
            PublishedAt = Published,
            Url = $"https://github.com/{Repository}/releases/tag/{tag}",
            Notes = "New version notes",
            Assets = [new()
            {
                Name = app ? AppUpdateService.InstallerName : "track.zip",
                State = "uploaded",
                DownloadUrl = $"https://github.com/{Repository}/releases/download/{tag}/{AppUpdateService.InstallerName}",
            }],
        };
        var candidates = new[]
        {
            Release("v99.0.0", app: false),
            Release("app-v5.0.0", draft: true),
            Release("app-v4.0.0", prerelease: true),
            Release("content-v3.0.0"),
            Release("app-v3.0.0-beta.1"),
            Release("app-v1.9.0"),
            Release("app-v1.10.0"),
            Release("v1.11.0"),
        };
        var selected = AppUpdateService.SelectRelease(candidates, Repository, "1.3.0", Published);
        assert(selected.Available && selected.Version == "1.11.0", "App update uses semantic ordering and accepts legacy installer releases");
        assert(selected.Published && !selected.AutomaticInstall && selected.DownloadUrl!.EndsWith(AppUpdateService.InstallerName), "App update exposes manual installer and published metadata");
        var newerInstalled = AppUpdateService.SelectRelease(candidates, Repository, "2.0.0", Published);
        assert(!newerInstalled.Available && newerInstalled.CurrentVersion == "2.0.0", "App update never suggests an app downgrade");
        var noApp = AppUpdateService.SelectRelease([Release("v99.0.0", app: false)], Repository, "1.3.0", Published);
        assert(!noApp.Published && !noApp.Available && noApp.Version == "1.3.0" && noApp.Url is null && noApp.DownloadUrl is null, "No published app release is distinct from latest/current status");
        var incomplete = Release("app-v2.0.0");
        incomplete.Assets[0].State = "new";
        assert(!AppUpdateService.SelectRelease([incomplete], Repository, "1.3.0", Published).Published, "An unfinished installer upload is not an app release");
        var invalid = Release("app-v2.0.0");
        invalid.Assets[0].DownloadUrl = "https://example.com/Eurocup3-Helper-Setup.exe";
        await rejectAsync(() =>
        {
            AppUpdateService.SelectRelease([invalid], Repository, "1.3.0", Published);
            return Task.CompletedTask;
        }, "App update rejects download links outside its GitHub repository");

        HttpResponseMessage Success(AppRelease[] entries, string? etag = null)
        {
            var response = new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(JsonSerializer.Serialize(entries, Json.Options)),
            };
            if (etag is not null)
                response.Headers.ETag = new EntityTagHeaderValue(etag);
            return response;
        }
        var clock = new TestClock(Published);
        int calls = 0;
        using (var http = new HttpClient(new Handler(request =>
        {
            calls++;
            assert(request.RequestUri!.AbsolutePath == $"/repos/{Repository}/releases", "App update queries releases rather than releases/latest");
            if (calls == 1)
                return Success([Release("app-v1.4.0")], "\"app-releases\"");
            assert(request.Headers.IfNoneMatch.Any(x => x.Tag == "\"app-releases\""), "App update sends conditional ETag requests");
            return new HttpResponseMessage(HttpStatusCode.NotModified);
        })))
        {
            var service = new AppUpdateService(Repository, "1.3.0", http, clock);
            await service.Check();
            await service.Check();
            assert(calls == 1, "App update caches successful checks for ten minutes");
            clock.Advance(TimeSpan.FromMinutes(11));
            var refreshed = await service.Check();
            assert(calls == 2 && refreshed.Available && refreshed.CheckedAt == clock.GetUtcNow(), "App update revalidates cached releases on HTTP 304");
        }

        int pageCalls = 0;
        using (var http = new HttpClient(new Handler(request =>
        {
            pageCalls++;
            if (pageCalls == 1)
                return Success(Enumerable.Range(0, 100).Select(i => Release($"v9.0.{i}", app: false)).ToArray());
            assert(request.RequestUri!.Query.Contains("page=2"), "App update pages past content releases");
            return Success([Release("app-v1.4.0")]);
        })))
        {
            var service = new AppUpdateService(Repository, "1.3.0", http);
            assert((await service.Check()).Version == "1.4.0" && pageCalls == 2, "App update finds installers beyond the first release page");
        }

        clock = new TestClock(Published);
        int failureCalls = 0;
        using (var http = new HttpClient(new Handler(_ =>
        {
            failureCalls++;
            return failureCalls == 1
                ? Success([Release("app-v1.4.0")])
                : new HttpResponseMessage(HttpStatusCode.ServiceUnavailable);
        })))
        {
            var service = new AppUpdateService(Repository, "1.3.0", http, clock);
            await service.Check();
            clock.Advance(TimeSpan.FromMinutes(11));
            await rejectAsync(async () => { await service.Check(); }, "App update reports HTTP errors instead of returning stale latest metadata");
            await rejectAsync(async () => { await service.Check(); }, "App update keeps a failure explicit during its retry backoff");
            assert(failureCalls == 2, "App update backs off repeated failed checks");
        }

        clock = new TestClock(Published);
        int rateCalls = 0;
        using (var http = new HttpClient(new Handler(_ =>
        {
            rateCalls++;
            if (rateCalls > 1)
                return Success([]);
            var response = new HttpResponseMessage(HttpStatusCode.TooManyRequests);
            response.Headers.RetryAfter = new RetryConditionHeaderValue(TimeSpan.FromMinutes(5));
            return response;
        })))
        {
            var service = new AppUpdateService(Repository, "1.3.0", http, clock);
            await rejectAsync(async () => { await service.Check(); }, "App update reports rate limiting explicitly");
            clock.Advance(TimeSpan.FromMinutes(4));
            await rejectAsync(async () => { await service.Check(); }, "App update respects GitHub Retry-After");
            assert(rateCalls == 1, "App update does not call GitHub during its rate-limit wait");
            clock.Advance(TimeSpan.FromMinutes(2));
            assert(!(await service.Check()).Published && rateCalls == 2, "App update can recover after its rate-limit wait");
        }

        using (var http = new HttpClient(new Handler(_ => new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent("not release JSON"),
        })))
        {
            var service = new AppUpdateService(Repository, "1.3.0", http);
            await rejectAsync(async () => { await service.Check(); }, "App update rejects invalid release metadata without claiming current status");
        }
    }

    sealed class TestClock(DateTimeOffset now) : TimeProvider
    {
        DateTimeOffset current = now;
        public override DateTimeOffset GetUtcNow() => current;
        public void Advance(TimeSpan delay) => current = current.Add(delay);
    }

    sealed class Handler(Func<HttpRequestMessage, HttpResponseMessage> respond) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
            => Task.FromResult(respond(request));
    }
}
