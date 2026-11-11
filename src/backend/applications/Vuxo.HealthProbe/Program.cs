using System.Globalization;
using System.Net;
using System.Net.Http;
using System.Text.RegularExpressions;

// No args: unchanged Docker HEALTHCHECK (loopback HTTP 200, 2s, no output).
// Diagnostic args: ONLY two fixed origin/edge health URLs. Never follow
// redirects, print bodies, secrets, raw headers or full CF-Ray request IDs.
const string loopback = "http://127.0.0.1:8080/health";
const string origin = "http://api:8080/health";
const string publicEdge = "https://api.vuxoapi.xyz/health";

var diagnostic = args.Length == 1;
if (args.Length > 1 || (diagnostic && args[0] != origin && args[0] != publicEdge))
{
    return 19;
}
var url = diagnostic ? args[0] : loopback;
var edge = url == publicEdge;
using var handler = new HttpClientHandler { AllowAutoRedirect = false, UseCookies = false };
using var client = new HttpClient(handler)
{
    Timeout = TimeSpan.FromSeconds(diagnostic ? (edge ? 8 : 6) : 2)
};
try
{
    using var response = await client.GetAsync(url, HttpCompletionOption.ResponseHeadersRead);
    if (!diagnostic)
    {
        return response.StatusCode == HttpStatusCode.OK ? 0 : 1;
    }
    Console.WriteLine(((int)response.StatusCode).ToString(CultureInfo.InvariantCulture));
    if (edge && response.Headers.TryGetValues("CF-Ray", out var rayValues))
    {
        foreach (var ray in rayValues)
        {
            var match = Regex.Match(ray, @"^[a-fA-F0-9]{8,32}-([A-Z]{3})$", RegexOptions.CultureInvariant);
            if (!match.Success) continue;
            Console.WriteLine(match.Groups[1].Value);
            break;
        }
    }
    return 0;
}
catch (HttpRequestException error)
{
    if (!diagnostic) return 1;
    return error.HttpRequestError switch
    {
        HttpRequestError.NameResolutionError => 6,
        HttpRequestError.ConnectionError => 7,
        HttpRequestError.SecureConnectionError => 35,
        HttpRequestError.HttpProtocolError => 56,
        _ => 19
    };
}
catch (TaskCanceledException)
{
    return diagnostic ? 28 : 1;
}
