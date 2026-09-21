using Vuxo.Api.Contracts.Auth;
using Vuxo.Application.Identity;

namespace Vuxo.Api.Auth;

public static class SocialAuthEndpoints
{
    public static IEndpointRouteBuilder MapSocialAuthEndpoints(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/api/auth/providers", (IConfiguration configuration) =>
        {
            var microsoftClientId = configuration["Auth:Microsoft:ClientId"];
            var microsoftTenantId = configuration["Auth:Microsoft:TenantId"];
            var googleClientId = configuration["Auth:Google:ClientId"];

            return Results.Ok(new
            {
                microsoft = new
                {
                    enabled = !string.IsNullOrWhiteSpace(microsoftClientId)
                        && !string.IsNullOrWhiteSpace(microsoftTenantId),
                    clientId = NullIfBlank(microsoftClientId),
                    tenantId = NullIfBlank(microsoftTenantId)
                },
                google = new
                {
                    enabled = !string.IsNullOrWhiteSpace(googleClientId),
                    clientId = NullIfBlank(googleClientId)
                }
            });
        });

        endpoints.MapPost(
                "/api/auth/social",
                async (
                    SocialLoginRequest request,
                    SocialAuthenticationService authentication,
                    VuxoTokenService tokens,
                    CancellationToken cancellationToken) =>
                {
                    try
                    {
                        var result = await authentication.AuthenticateAsync(
                            request.Provider,
                            request.Credential,
                            cancellationToken);
                        var token = tokens.CreateUserToken(result.User.Id, result.User.DisplayName);

                        return Results.Ok(new
                        {
                            accessToken = token.AccessToken,
                            tokenType = "Bearer",
                            expiresAtUtc = token.ExpiresAtUtc,
                            user = new
                            {
                                id = result.User.Id,
                                displayName = result.User.DisplayName,
                                email = result.User.Email
                            }
                        });
                    }
                    catch (SocialIdentityVerificationException exception)
                    {
                        return exception.Code switch
                        {
                            SocialIdentityErrorCodes.ProviderInvalid =>
                                Results.BadRequest(new { code = exception.Code }),
                            SocialIdentityErrorCodes.ProviderNotConfigured or SocialIdentityErrorCodes.ProviderUnavailable =>
                                Results.Json(new { code = exception.Code }, statusCode: StatusCodes.Status503ServiceUnavailable),
                            _ => Results.Json(new { code = exception.Code }, statusCode: StatusCodes.Status401Unauthorized)
                        };
                    }
                })
            .RequireRateLimiting("auth-social");

        endpoints.MapPost("/api/auth/logout", () => Results.NoContent())
            .RequireAuthorization();

        return endpoints;
    }

    private static string? NullIfBlank(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
