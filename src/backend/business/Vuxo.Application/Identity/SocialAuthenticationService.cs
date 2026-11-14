using Vuxo.Application.Events;
using Vuxo.Domain.Common;
using Vuxo.Domain.Events;
using Vuxo.Domain.Identity;

namespace Vuxo.Application.Identity;

public sealed record SocialAuthenticationResult(
    VuxoUser User,
    string Provider,
    bool IsNewUser,
    string? VerifiedEmail = null);

public sealed class SocialAuthenticationService(
    ISocialIdentityVerifier verifier,
    IVuxoIdentityRepository identities,
    IGameEventStore eventStore,
    IUnitOfWork unitOfWork,
    TimeProvider timeProvider)
{
    public async Task<SocialAuthenticationResult> AuthenticateAsync(
        string? provider,
        string? credential,
        CancellationToken cancellationToken = default)
    {
        var normalizedProvider = SocialIdentityProviders.Normalize(provider);
        if (normalizedProvider is null)
        {
            await AuditFailureAsync("unknown", SocialIdentityErrorCodes.ProviderInvalid, cancellationToken);
            throw new SocialIdentityVerificationException(SocialIdentityErrorCodes.ProviderInvalid);
        }

        if (string.IsNullOrWhiteSpace(credential))
        {
            await AuditFailureAsync(normalizedProvider, SocialIdentityErrorCodes.CredentialInvalid, cancellationToken);
            throw new SocialIdentityVerificationException(SocialIdentityErrorCodes.CredentialInvalid);
        }

        VerifiedSocialIdentity verified;
        try
        {
            verified = await verifier.VerifyAsync(normalizedProvider, credential.Trim(), cancellationToken);
            ValidateVerifiedIdentity(normalizedProvider, verified);
        }
        catch (SocialIdentityVerificationException exception)
        {
            await AuditFailureAsync(normalizedProvider, exception.Code, cancellationToken);
            throw;
        }

        var now = timeProvider.GetUtcNow();
        var verifiedEmail = verified.EmailVerified && !string.IsNullOrWhiteSpace(verified.Email)
            ? verified.Email.Trim()
            : null;
        var user = await identities.GetByExternalIdentityAsync(
            normalizedProvider,
            verified.Subject,
            cancellationToken);
        var isNewUser = false;
        var linkedByEmail = false;

        if (user is not null)
        {
            user.RecordLogin(user.DisplayName, verifiedEmail ?? user.Email, now);
            await identities.UpdateLoginAsync(
                user,
                normalizedProvider,
                verified.Subject,
                now,
                cancellationToken);
        }
        else
        {
            var existing = verifiedEmail is null
                ? null
                : await identities.GetByVerifiedEmailAsync(verifiedEmail, cancellationToken);
            if (existing is not null)
            {
                user = existing;
                linkedByEmail = true;
                user.RecordLogin(user.DisplayName, verifiedEmail, now);
                await identities.LinkExternalIdentityAsync(
                    user,
                    normalizedProvider,
                    verified.Subject,
                    now,
                    cancellationToken);
            }
            else
            {
                isNewUser = true;
                user = VuxoUser.Create(verified.DisplayName, verifiedEmail, now);
                await identities.AddAsync(
                    user,
                    normalizedProvider,
                    verified.Subject,
                    now,
                    cancellationToken);
            }
        }

        await eventStore.AppendAsync(
            new GameEventEnvelope(
                Guid.NewGuid(),
                "auth.social.login_succeeded",
                GameEventVisibilityScope.Administration,
                user.Id.ToString("D"),
                Guid.NewGuid(),
                CausationId: null,
                RuleVersion: "social-auth-v2",
                OccurredAtUtc: now),
            GameEventPayloadSerializer.Serialize(
                "auth.social.login_succeeded",
                new { provider = normalizedProvider, isNewUser, linkedByEmail }),
            cancellationToken);

        await unitOfWork.SaveChangesAsync(cancellationToken);
        return new SocialAuthenticationResult(user, normalizedProvider, isNewUser, verifiedEmail);
    }

    private async Task AuditFailureAsync(
        string provider,
        string errorCode,
        CancellationToken cancellationToken)
    {
        var now = timeProvider.GetUtcNow();
        await eventStore.AppendAsync(
            new GameEventEnvelope(
                Guid.NewGuid(),
                "auth.social.login_failed",
                GameEventVisibilityScope.Administration,
                PlayerId: null,
                Guid.NewGuid(),
                CausationId: null,
                RuleVersion: "social-auth-v1",
                OccurredAtUtc: now),
            GameEventPayloadSerializer.Serialize(
                "auth.social.login_failed",
                new { provider, errorCode }),
            cancellationToken);
        await unitOfWork.SaveChangesAsync(cancellationToken);
    }

    private static void ValidateVerifiedIdentity(
        string expectedProvider,
        VerifiedSocialIdentity verified)
    {
        if (!string.Equals(expectedProvider, SocialIdentityProviders.Normalize(verified.Provider), StringComparison.Ordinal)
            || string.IsNullOrWhiteSpace(verified.Subject)
            || verified.Subject.Trim().Length > 255)
        {
            throw new SocialIdentityVerificationException(SocialIdentityErrorCodes.CredentialInvalid);
        }
    }
}
