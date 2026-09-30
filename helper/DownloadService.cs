using System.Diagnostics;

namespace Eurocup3;

public sealed class DownloadService(ManifestService manifests)
{
    public async Task Fetch(Package p, string destination, Job job, CancellationToken ct)
    {
        manifests.ValidateDownload(p.Download);
        using var client = new HttpClient(new HttpClientHandler { AllowAutoRedirect = false })
        {
            Timeout = Timeout.InfiniteTimeSpan,
        };
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeout.CancelAfter(TimeSpan.FromHours(4));
        var token = timeout.Token;
        string url = p.Download;
        HttpResponseMessage? response = null;
        try
        {
            for (int i = 0; i < 6; i++)
            {
                response = await client.GetAsync(
                    url,
                    HttpCompletionOption.ResponseHeadersRead,
                    token
                );
                if ((int)response.StatusCode is >= 300 and < 400)
                {
                    var next =
                        response.Headers.Location
                        ?? throw new AppFault("DOWNLOAD_FAILED", "Missing redirect location.");
                    url = new Uri(new Uri(url), next).AbsoluteUri;
                    manifests.ValidateDownload(url, true);
                    response.Dispose();
                    response = null;
                    continue;
                }
                break;
            }
            if (response == null)
                throw new AppFault("DOWNLOAD_FAILED", "Too many redirects.");
            response.EnsureSuccessStatusCode();
            if (response.Content.Headers.ContentLength is long length && length != p.Size)
                throw new AppFault("SIZE_MISMATCH", "Release asset size differs from the catalog.");
            await using var source = await response.Content.ReadAsStreamAsync(token);
            await using var output = new FileStream(
                destination,
                FileMode.CreateNew,
                FileAccess.Write,
                FileShare.None,
                131072,
                true
            );
            var buffer = new byte[131072];
            var watch = Stopwatch.StartNew();
            long received = 0;
            job.Total = p.Size;
            job.State = "downloading";
            while (true)
            {
                while (job.Paused)
                {
                    job.State = "paused";
                    await Task.Delay(150, token);
                }
                job.State = "downloading";
                using var idle = CancellationTokenSource.CreateLinkedTokenSource(token);
                idle.CancelAfter(TimeSpan.FromSeconds(60));
                int n = await source.ReadAsync(buffer, idle.Token);
                if (n == 0)
                    break;
                received += n;
                if (received > p.Size)
                    throw new AppFault("SIZE_MISMATCH", "Download exceeds the declared size.");
                await output.WriteAsync(buffer.AsMemory(0, n), token);
                job.Bytes = received;
                job.BytesPerSecond = received / Math.Max(.001, watch.Elapsed.TotalSeconds);
            }
            if (received != p.Size)
                throw new AppFault(
                    "DOWNLOAD_INCOMPLETE",
                    "Download was interrupted. Retry the package."
                );
        }
        finally
        {
            response?.Dispose();
        }
        job.State = "checking";
        if (
            !string.Equals(
                await HashService.Sha256(destination, ct),
                p.Sha256,
                StringComparison.OrdinalIgnoreCase
            )
        )
            throw new AppFault(
                "CHECKSUM_MISMATCH",
                "The download failed its SHA256 check. Nothing was installed."
            );
    }
}
