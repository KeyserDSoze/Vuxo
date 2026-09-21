using System.IdentityModel.Tokens.Jwt;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;
using Vuxo.Application.Identity;

namespace Vuxo.Api.Auth;

public sealed class OidcSocialIdentityVerifier : ISocialIdentityVerifier
{
    private const string GoogleMetadataAddress = "https://accounts.google.com/.well-known/openid-configuration";
    private readonly IConfiguration configuration;
    private readonly ConfigurationManager<OpenIdConnectConfiguration> googleConfiguration;
    private readonly Dictionary<string, ConfigurationManager<OpenIdConnectConfiguration>> microsoftConfigurations = new(StringComparer.OrdinalIgnoreCase);
    private readonly JwtSecurityTokenHandler handler = new() { MapInboundClaims = false };

    public OidcSocialIdentityVerifier(IConfiguration configuration)
    {
        this.configuration = configuration;
        googleConfiguration = CreateConfigurationManager(GoogleMetadataAddress);
    }

    public async Task<VerifiedSocialIdentity> VerifyAsync(
        string provider,
        string credential,
        CancellationToken cancellationToken = default)
    {
        return provider switch
        {
            SocialIdentityProviders.Google => await VerifyGoogleAsync(credential, cancellationToken),
            SocialIdentityProviders.Microsoft => await VerifyMicrosoftAsync(credential, cancellationToken),
            _ => throw new SocialIdentityVerificationException(SocialIdentityErrorCodes.ProviderInvalid)
        };
    }

    private async Task<VerifiedSocialIdentity> VerifyGoogleAsync(
        string credential,
        CancellationToken cancellationToken)
    {
        var clientId = configuration["Auth:Google:ClientId"];
        if (string.IsNullOrWhiteSpace(clientId))
        {
            throw new SocialIdentityVerificationException(SocialIdentityErrorCodes.ProviderNotConfigured);
        }

        var validated = await ValidateAsync(
            googleConfiguration,
            credential,
            new TokenValidationParameters
            {
                ValidateIssuer = true,
                ValidIssuers = ["https://accounts.google.com", "accounts.google.com"],
                ValidateAudience = true,
                ValidAudience = clientId,
                ValidateLifetime = true,
                RequireExpirationTime = true,
                ValidateIssuerSigningKey = true,
                RequireSignedTokens = true,
                ClockSkew = TimeSpan.FromMinutes(2)
            },
            cancellationToken);

        return ToVerifiedIdentity(SocialIdentityProviders.Google, validated.Principal);
    }

    private async Task<VerifiedSocialIdentity> VerifyMicrosoftAsync(
        string credential,
        CancellationToken cancellationToken)
    {
        var clientId = configuration["Auth:Microsoft:ClientId"];
        var tenant = configuration["Auth:Microsoft:TenantId"];
        if (string.IsNullOrWhiteSpace(clientId) || string.IsNullOrWhiteSpace(tenant))
        {
            throw new SocialIdentityVerificationException(SocialIdentityErrorCodes.ProviderNotConfigured);
        }

        tenant = tenant.Trim();
        var manager = GetMicrosoftConfiguration(tenant);
        var validated = await ValidateAsync(
            manager,
            credential,
            new TokenValidationParameters
            {
                ValidateIssuer = false,
                ValidateAudience = true,
                ValidAudience = clientId,
                ValidateLifetime = true,
                RequireExpirationTime = true,
                ValidateIssuerSigningKey = true,
                RequireSignedTokens = true,
                ClockSkew = TimeSpan.FromMinutes(2)
            },
            cancellationToken);

        ValidateMicrosoftIssuer(tenant, validated.Token, validated.Principal);
        return ToVerifiedIdentity(SocialIdentityProviders.Microsoft, validated.Principal);
    }

    private async Task<ValidatedToken> ValidateAsync(
        ConfigurationManager<OpenIdConnectConfiguration> manager,
        string credential,
        TokenValidationParameters parameters,
        CancellationToken cancellationToken)
    {
        try
        {
            var openIdConfiguration = await manager.GetConfigurationAsync(cancellationToken);
            parameters.IssuerSigningKeys = openIdConfiguration.SigningKeys;
            try
            {
                return ValidateToken(credential, parameters);
            }
            catch (SecurityTokenSignatureKeyNotFoundException)
            {
                manager.RequestRefresh();
                openIdConfiguration = await manager.GetConfigurationAsync(cancellationToken);
                parameters.IssuerSigningKeys = openIdConfiguration.SigningKeys;
                return ValidateToken(credential, parameters);
            }
        }
        catch (SecurityTokenExpiredException exception)
        {
            throw new SocialIdentityVerificationException(SocialIdentityErrorCodes.CredentialExpired, exception);
        }
        catch (SecurityTokenInvalidAudienceException exception)
        {
            throw new SocialIdentityVerificationException(SocialIdentityErrorCodes.CredentialAudienceInvalid, exception);
        }
        catch (SecurityTokenException exception)
        {
            throw new SocialIdentityVerificationException(SocialIdentityErrorCodes.CredentialInvalid, exception);
        }
        catch (SocialIdentityVerificationException)
        {
            throw;
        }
        catch (Exception exception) when (exception is HttpRequestException or IOException or InvalidOperationException)
        {
            throw new SocialIdentityVerificationException(SocialIdentityErrorCodes.ProviderUnavailable, exception);
        }
    }

    private ValidatedToken ValidateToken(string credential, TokenValidationParameters parameters)
    {
        var principal = handler.ValidateToken(credential, parameters, out var token);
        if (token is not JwtSecurityToken jwt)
        {
            throw new SocialIdentityVerificationException(SocialIdentityErrorCodes.CredentialInvalid);
        }

        return new ValidatedToken(principal, jwt);
    }

    private static VerifiedSocialIdentity ToVerifiedIdentity(string provider, System.Security.Claims.ClaimsPrincipal principal)
    {
        var subject = principal.FindFirst(JwtRegisteredClaimNames.Sub)?.Value;
        if (string.IsNullOrWhiteSpace(subject))
        {
            throw new SocialIdentityVerificationException(SocialIdentityErrorCodes.CredentialInvalid);
        }

        var name = principal.FindFirst("name")?.Value
            ?? principal.FindFirst("preferred_username")?.Value
            ?? principal.FindFirst("email")?.Value
            ?? "Vuxo Player";
        var email = principal.FindFirst("email")?.Value
            ?? principal.FindFirst("preferred_username")?.Value;

        return new VerifiedSocialIdentity(provider, subject.Trim(), name, email);
    }

    private static void ValidateMicrosoftIssuer(
        string configuredTenant,
        JwtSecurityToken token,
        System.Security.Claims.ClaimsPrincipal principal)
    {
        var tenantId = principal.FindFirst("tid")?.Value;
        if (string.IsNullOrWhiteSpace(tenantId))
        {
            throw new SocialIdentityVerificationException(SocialIdentityErrorCodes.CredentialInvalid);
        }

        if (!MicrosoftTenantPolicy.IsAllowed(configuredTenant, tenantId))
        {
            throw new SocialIdentityVerificationException(SocialIdentityErrorCodes.CredentialInvalid);
        }

        var expectedIssuer = $"https://login.microsoftonline.com/{tenantId}/v2.0";
        if (!string.Equals(token.Issuer, expectedIssuer, StringComparison.OrdinalIgnoreCase))
        {
            throw new SocialIdentityVerificationException(SocialIdentityErrorCodes.CredentialInvalid);
        }
    }

    private ConfigurationManager<OpenIdConnectConfiguration> GetMicrosoftConfiguration(string tenant)
    {
        lock (microsoftConfigurations)
        {
            if (microsoftConfigurations.TryGetValue(tenant, out var existing))
            {
                return existing;
            }

            var escapedTenant = Uri.EscapeDataString(tenant);
            var created = CreateConfigurationManager(
                $"https://login.microsoftonline.com/{escapedTenant}/v2.0/.well-known/openid-configuration");
            microsoftConfigurations[tenant] = created;
            return created;
        }
    }

    private static ConfigurationManager<OpenIdConnectConfiguration> CreateConfigurationManager(string metadataAddress) =>
        new(
            metadataAddress,
            new OpenIdConnectConfigurationRetriever(),
            new HttpDocumentRetriever { RequireHttps = true });

    private sealed record ValidatedToken(
        System.Security.Claims.ClaimsPrincipal Principal,
        JwtSecurityToken Token);
}

public static class MicrosoftTenantPolicy
{
    public const string ConsumerTenantId = "9188040d-6c67-4c5b-b112-36a304b66dad";

    public static bool IsAllowed(string configuredTenant, string tokenTenantId)
    {
        if (string.IsNullOrWhiteSpace(configuredTenant) || string.IsNullOrWhiteSpace(tokenTenantId))
        {
            return false;
        }

        if (configuredTenant.Equals("common", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        if (configuredTenant.Equals("organizations", StringComparison.OrdinalIgnoreCase))
        {
            return !tokenTenantId.Equals(ConsumerTenantId, StringComparison.OrdinalIgnoreCase);
        }

        if (configuredTenant.Equals("consumers", StringComparison.OrdinalIgnoreCase))
        {
            return tokenTenantId.Equals(ConsumerTenantId, StringComparison.OrdinalIgnoreCase);
        }

        return configuredTenant.Equals(tokenTenantId, StringComparison.OrdinalIgnoreCase);
    }
}
