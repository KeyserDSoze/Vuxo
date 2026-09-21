using Vuxo.Application.Identity;
using Vuxo.Domain.Common;
using Vuxo.Domain.Events;
using Vuxo.Domain.Identity;

namespace Vuxo.Application.Tests.Identity;

public sealed class SocialAuthenticationServiceTests
{
    private static readonly DateTimeOffset Now = new(2026, 9, 21, 7, 0, 0, TimeSpan.Zero);

    [Theory]
    [InlineData("microsoft")]
    [InlineData("google")]
    public async Task AuthenticateAsync_CreatesStableInternalUser_AndReusesExistingLink(string provider)
    {
        var verifier = new FakeVerifier(new VerifiedSocialIdentity(provider, "provider-subject", "Social Player", "social@example.test"));
        var repository = new FakeIdentityRepository();
        var events = new FakeEventStore();
        var unitOfWork = new FakeUnitOfWork();
        var service = CreateService(verifier, repository, events, unitOfWork);

        var first = await service.AuthenticateAsync(provider, "provider-credential");
        var second = await service.AuthenticateAsync(provider, "provider-credential");

        Assert.True(first.IsNewUser);
        Assert.False(second.IsNewUser);
        Assert.Equal(first.User.Id, second.User.Id);
        Assert.Equal("Social Player", second.User.DisplayName);
        Assert.Equal(2, unitOfWork.SaveCount);
        Assert.Equal(2, events.Appended.Count);
        Assert.All(events.Appended, item =>
        {
            Assert.Equal("auth.social.login_succeeded", item.Envelope.EventType);
            Assert.Equal(GameEventVisibilityScope.Administration, item.Envelope.VisibilityScope);
            Assert.DoesNotContain("provider-credential", item.PayloadJson, StringComparison.Ordinal);
            Assert.DoesNotContain("provider-subject", item.PayloadJson, StringComparison.Ordinal);
        });
    }

    [Theory]
    [InlineData(SocialIdentityErrorCodes.CredentialInvalid)]
    [InlineData(SocialIdentityErrorCodes.CredentialExpired)]
    [InlineData(SocialIdentityErrorCodes.CredentialAudienceInvalid)]
    public async Task AuthenticateAsync_VerificationFailure_IsAuditedWithoutCredential(string errorCode)
    {
        var verifier = new FakeVerifier(errorCode);
        var repository = new FakeIdentityRepository();
        var events = new FakeEventStore();
        var unitOfWork = new FakeUnitOfWork();
        var service = CreateService(verifier, repository, events, unitOfWork);

        var exception = await Assert.ThrowsAsync<SocialIdentityVerificationException>(
            () => service.AuthenticateAsync("google", "do-not-log-this-token"));

        Assert.Equal(errorCode, exception.Code);
        var audit = Assert.Single(events.Appended);
        Assert.Equal("auth.social.login_failed", audit.Envelope.EventType);
        Assert.Null(audit.Envelope.PlayerId);
        Assert.Contains(errorCode, audit.PayloadJson, StringComparison.Ordinal);
        Assert.DoesNotContain("do-not-log-this-token", audit.PayloadJson, StringComparison.Ordinal);
        Assert.Equal(1, unitOfWork.SaveCount);
    }

    [Fact]
    public async Task AuthenticateAsync_InvalidProvider_IsRejectedAndAudited()
    {
        var verifier = new FakeVerifier(new VerifiedSocialIdentity("google", "unused", "Unused", null));
        var events = new FakeEventStore();
        var service = CreateService(verifier, new FakeIdentityRepository(), events, new FakeUnitOfWork());

        var exception = await Assert.ThrowsAsync<SocialIdentityVerificationException>(
            () => service.AuthenticateAsync("github", "credential"));

        Assert.Equal(SocialIdentityErrorCodes.ProviderInvalid, exception.Code);
        Assert.Equal("auth.social.login_failed", Assert.Single(events.Appended).Envelope.EventType);
        Assert.Equal(0, verifier.CallCount);
    }

    private static SocialAuthenticationService CreateService(
        ISocialIdentityVerifier verifier,
        IVuxoIdentityRepository repository,
        IGameEventStore events,
        IUnitOfWork unitOfWork) =>
        new(
            verifier,
            repository,
            events,
            unitOfWork,
            new FixedTimeProvider(Now));

    private sealed class FakeVerifier : ISocialIdentityVerifier
    {
        private readonly VerifiedSocialIdentity? identity;
        private readonly string? errorCode;

        public FakeVerifier(VerifiedSocialIdentity identity) => this.identity = identity;
        public FakeVerifier(string errorCode) => this.errorCode = errorCode;

        public int CallCount { get; private set; }

        public Task<VerifiedSocialIdentity> VerifyAsync(
            string provider,
            string credential,
            CancellationToken cancellationToken = default)
        {
            CallCount++;
            if (errorCode is not null)
            {
                throw new SocialIdentityVerificationException(errorCode);
            }

            return Task.FromResult(identity!);
        }
    }

    private sealed class FakeIdentityRepository : IVuxoIdentityRepository
    {
        private readonly Dictionary<(string Provider, string Subject), VuxoUser> users = [];

        public Task<VuxoUser?> GetByExternalIdentityAsync(
            string provider,
            string subject,
            CancellationToken cancellationToken = default) =>
            Task.FromResult(users.GetValueOrDefault((provider, subject)));

        public Task AddAsync(
            VuxoUser user,
            string provider,
            string subject,
            DateTimeOffset linkedAtUtc,
            CancellationToken cancellationToken = default)
        {
            users[(provider, subject)] = user;
            return Task.CompletedTask;
        }

        public Task UpdateLoginAsync(
            VuxoUser user,
            string provider,
            string subject,
            DateTimeOffset loginAtUtc,
            CancellationToken cancellationToken = default)
        {
            users[(provider, subject)] = user;
            return Task.CompletedTask;
        }
    }

    private sealed class FakeEventStore : IGameEventStore
    {
        public List<(GameEventEnvelope Envelope, string PayloadJson)> Appended { get; } = [];

        public Task AppendAsync(
            GameEventEnvelope envelope,
            string payloadJson,
            CancellationToken cancellationToken = default)
        {
            Appended.Add((envelope, payloadJson));
            return Task.CompletedTask;
        }
    }

    private sealed class FakeUnitOfWork : IUnitOfWork
    {
        public int SaveCount { get; private set; }

        public Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
        {
            SaveCount++;
            return Task.FromResult(1);
        }
    }

    private sealed class FixedTimeProvider(DateTimeOffset now) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => now;
    }
}
