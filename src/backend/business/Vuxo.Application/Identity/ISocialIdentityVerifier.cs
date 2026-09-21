namespace Vuxo.Application.Identity;

public static class SocialIdentityProviders
{
    public const string Microsoft = "microsoft";
    public const string Google = "google";

    public static string? Normalize(string? provider)
    {
        if (string.Equals(provider?.Trim(), Microsoft, StringComparison.OrdinalIgnoreCase))
        {
            return Microsoft;
        }

        if (string.Equals(provider?.Trim(), Google, StringComparison.OrdinalIgnoreCase))
        {
            return Google;
        }

        return null;
    }
}

public static class SocialIdentityErrorCodes
{
    public const string ProviderInvalid = "social_provider_invalid";
    public const string ProviderNotConfigured = "social_provider_not_configured";
    public const string CredentialInvalid = "social_credential_invalid";
    public const string CredentialExpired = "social_credential_expired";
    public const string CredentialAudienceInvalid = "social_credential_audience_invalid";
    public const string ProviderUnavailable = "social_provider_unavailable";
}

public sealed record VerifiedSocialIdentity(
    string Provider,
    string Subject,
    string DisplayName,
    string? Email);

public interface ISocialIdentityVerifier
{
    Task<VerifiedSocialIdentity> VerifyAsync(
        string provider,
        string credential,
        CancellationToken cancellationToken = default);
}

public sealed class SocialIdentityVerificationException(string code, Exception? innerException = null)
    : Exception(code, innerException)
{
    public string Code { get; } = code;
}
