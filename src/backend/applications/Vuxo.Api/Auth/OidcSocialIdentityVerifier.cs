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
        var configuredTenant = configuration["Auth:Microsoft:TenantId"];
        if (string.IsNullOrWhiteSpace(clientId) || string.IsNullOrWhiteSpace(configuredTenant))
        {
            throw new SocialIdentityVerificationException(SocialIdentityErrorCodes.ProviderNotConfigured);
        }

        JwtSecurityToken unvalidatedToken;
        try
        {
            unvalidatedToken = handler.ReadJwtToken(credential);
        }
        catch (Exception exception) when (exception is ArgumentException or SecurityTokenException)
        {
            throw new SocialIdentityVerificationException(SocialIdentityErrorCodes.CredentialInvalid, exception);
        }

        var tenantId = unvalidatedToken.Claims.FirstOrDefault(claim => claim.Type == "tid")?.Value;
        if (string.IsNullOrWhiteSpace(tenantId)
            || !MicrosoftTenantPolicy.IsAllowed(configuredTenant.Trim(), tenantId))
        {
            throw new SocialIdentityVerificationException(SocialIdentityErrorCodes.CredentialInvalid);
        }

        var expectedIssuer = $"https://login.microsoftonline.com/{tenantId}/v2.0";
        var manager = GetMicrosoftConfiguration(tenantId);
        var validated = await ValidateAsync(
            manager,
            credential,
            new TokenValidationParameters
            {
                ValidateIssuer = true,
                ValidIssuer = expectedIssuer,
                ValidateAudience = true,
                ValidAudience = clientId,
                ValidateLifetime = true,
                RequireExpirationTime = true,
                ValidateIssuerSigningKey = true,
                RequireSignedTokens = true,
                ClockSkew = TimeSpan.FromMinutes(2)
            },
            cancellationToken);

        var validatedTenant = validated.Principal.FindFirst("tid")?.Value;
        if (!string.Equals(validatedTenant, tenantId, StringComparison.OrdinalIgnoreCase))
        {
            throw new SocialIdentityVerificationException(SocialIdentityErrorCodes.CredentialInvalid);
        }

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

    private ConfigurationManager<OpenIdConnectConfiguration> GetMicrosoftConfiguration(string tenantId)
    {
        lock (microsoftConfigurations)
        {
            if (microsoftConfigurations.TryGetValue(tenantId, out var existing))
            {
                return existing;
            }

            var escapedTenant = Uri.EscapeDataString(tenantId);
            var created = CreateConfigurationManager(
                $"https://login.microsoftonline.com/{escapedTenant}/v2.0/.well-known/openid-configuration");
            microsoftConfigurations[tenantId] = created;
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
        if (string.IsNullOrWhiteSpace(configuredTenant)
            || string.IsNullOrWhiteSpace(tokenTenantId)
            || !Guid.TryParse(tokenTenantId, out _))
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
