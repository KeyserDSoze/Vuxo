namespace Vuxo.Api.Auth;

public static class SignalRAccessTokenResolver
{
    public static string? Resolve(HttpRequest request)
    {
        if (!request.Path.StartsWithSegments("/hubs/world"))
        {
            return null;
        }

        var accessToken = request.Query["access_token"].ToString();
        return string.IsNullOrWhiteSpace(accessToken) ? null : accessToken;
    }
}
