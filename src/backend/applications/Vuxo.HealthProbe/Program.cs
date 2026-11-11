using System.Net;

// Docker-only, unprivileged loopback readiness probe. No API services,
// credentials, migrations, external endpoint or platform-specific binaries.
using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(2) };
try
{
    using var response = await client.GetAsync(
        "http://127.0.0.1:8080/health",
        HttpCompletionOption.ResponseHeadersRead);
    return response.StatusCode == HttpStatusCode.OK ? 0 : 1;
}
catch (HttpRequestException)
{
    return 1;
}
catch (TaskCanceledException)
{
    return 1;
}
