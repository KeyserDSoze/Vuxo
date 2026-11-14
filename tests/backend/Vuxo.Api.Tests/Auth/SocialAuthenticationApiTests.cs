using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Vuxo.Api.Auth;
using Vuxo.Application.Identity;
using Vuxo.Domain.Common;
using Vuxo.Domain.Events;
using Vuxo.Domain.Identity;
using Vuxo.Api.Tests.Infrastructure;

namespace Vuxo.Api.Tests.Auth;

public sealed class SocialAuthenticationApiTests
{
    [Fact]
    public async Task Providers_ExposeOnlyPublicConfiguration()
    {
        await using var factory = CreateFactory(
            new FakeVerifier(),
            new FakeIdentityRepository(),
            new FakeEventStore(),
            new Dictionary<string, string?>
            {
                ["Auth:Microsoft:ClientId"] = "microsoft-client-id",
                ["Auth:Microsoft:TenantId"] = "common",
                ["Auth:Google:ClientId"] = "google-client-id",
                ["Auth:Microsoft:ClientSecret"] = "must-not-leak"
            });
        using var client = factory.CreateClient();

        var response = await client.GetAsync("/api/auth/providers");

        response.EnsureSuccessStatusCode();
        var json = await response.Content.ReadAsStringAsync();
        Assert.Contains("microsoft-client-id", json, StringComparison.Ordinal);
        Assert.Contains("google-client-id", json, StringComparison.Ordinal);
        Assert.Contains("tenantId", json, StringComparison.Ordinal);
        Assert.Contains("common", json, StringComparison.Ordinal);
        Assert.DoesNotContain("must-not-leak", json, StringComparison.Ordinal);
        Assert.DoesNotContain("clientSecret", json, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task SocialLogin_SameVerifiedEmailOnAnotherProvider_ReusesTheSameAccount()
    {
        var repository = new FakeIdentityRepository();
        await using var factory = CreateFactory(new FakeVerifier(), repository, new FakeEventStore());
        using var client = factory.CreateClient();

        var google = await LoginAsync(client, "google", "token-g");
        var microsoft = await LoginAsync(client, "microsoft", "token-m");
        var googleAgain = await LoginAsync(client, "google", "token-g2");

        Assert.Equal(google.User.Id, microsoft.User.Id);
        Assert.Equal(google.User.Id, googleAgain.User.Id);
        Assert.Equal("google Player", microsoft.User.DisplayName);
        Assert.Equal(2, repository.Users.Count);
    }

    [Fact]
    public async Task SocialLogin_UnverifiedEmail_DoesNotLinkAccounts()
    {
        var repository = new FakeIdentityRepository();
        var verifiedFactory = CreateFactory(new FakeVerifier(), repository, new FakeEventStore());
        using var first = verifiedFactory.CreateClient();
        var owner = await LoginAsync(first, "google", "token-g");

        await using var unverifiedFactory = CreateFactory(
            new FakeVerifier(emailVerified: false),
            repository,
            new FakeEventStore());
        using var second = unverifiedFactory.CreateClient();
        var other = await LoginAsync(second, "microsoft", "token-m");

        Assert.NotEqual(owner.User.Id, other.User.Id);
        await verifiedFactory.DisposeAsync();
    }

    [Theory]
    [InlineData("google", "Alessandro.Rapiti44@gmail.com", true, true)]
    [InlineData("microsoft", "alessandro.rapiti44@gmail.com", true, true)]
    [InlineData("google", "alessandro.rapiti44@gmail.com", false, false)]
    [InlineData("google", "someone.else@example.test", true, false)]
    public async Task SocialLogin_SuperAdmin_RequiresVerifiedConfiguredEmail(
        string provider,
        string email,
        bool emailVerified,
        bool expectedAdministrator)
    {
        await using var factory = CreateFactory(
            new FakeVerifier(email: email, emailVerified: emailVerified),
            new FakeIdentityRepository(),
            new FakeEventStore(),
            new Dictionary<string, string?> { ["Auth:SuperAdminEmails"] = "alessandro.rapiti44@gmail.com" });
        using var client = factory.CreateClient();

        var login = await LoginAsync(client, provider, "token");

        var jwt = new JwtSecurityTokenHandler().ReadJwtToken(login.AccessToken);
        Assert.Equal(
            expectedAdministrator,
            jwt.Claims.Any(claim => claim.Value == "Administrator"));
    }

    [Theory]
    [InlineData("microsoft")]
    [InlineData("google")]
    public async Task SocialLogin_IssuesVuxoJwt_AndReusesInternalIdentity(string provider)
    {
        var verifier = new FakeVerifier();
        var repository = new FakeIdentityRepository();
        await using var factory = CreateFactory(verifier, repository, new FakeEventStore());
        using var client = factory.CreateClient();

        var first = await LoginAsync(client, provider, "provider-token-a");
        var second = await LoginAsync(client, provider, "provider-token-b");

        Assert.Equal(first.User.Id, second.User.Id);
        Assert.Equal($"{provider} Player", first.User.DisplayName);
        Assert.Equal("social@example.test", first.User.Email);
        Assert.Equal("Bearer", first.TokenType);
        Assert.True(first.ExpiresAtUtc > DateTimeOffset.UtcNow);

        var jwt = new JwtSecurityTokenHandler().ReadJwtToken(first.AccessToken);
        Assert.Equal(first.User.Id.ToString("D"), jwt.Subject);
        Assert.Contains(
            jwt.Claims,
            claim => (claim.Type == "role"
                || claim.Type == "http://schemas.microsoft.com/ws/2008/06/identity/claims/role")
                && claim.Value == "User");
        Assert.Equal(2, verifier.CallCount);
        Assert.Single(repository.Users);
    }

    [Theory]
    [InlineData(SocialIdentityErrorCodes.CredentialInvalid)]
    [InlineData(SocialIdentityErrorCodes.CredentialExpired)]
    [InlineData(SocialIdentityErrorCodes.CredentialAudienceInvalid)]
    public async Task SocialLogin_InvalidCredential_ReturnsUnauthorized(string errorCode)
    {
        await using var factory = CreateFactory(
            new FakeVerifier(errorCode),
            new FakeIdentityRepository(),
            new FakeEventStore());
        using var client = factory.CreateClient();

        var response = await client.PostAsJsonAsync("/api/auth/social", new
        {
            provider = "google",
            credential = "invalid-provider-token"
        });

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        var error = await response.Content.ReadFromJsonAsync<ErrorResponse>();
        Assert.Equal(errorCode, error?.Code);
    }

    [Fact]
    public async Task SocialLogin_InvalidProvider_ReturnsBadRequest()
    {
        await using var factory = CreateFactory(
            new FakeVerifier(),
            new FakeIdentityRepository(),
            new FakeEventStore());
        using var client = factory.CreateClient();

        var response = await client.PostAsJsonAsync("/api/auth/social", new
        {
            provider = "github",
            credential = "credential"
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var error = await response.Content.ReadFromJsonAsync<ErrorResponse>();
        Assert.Equal(SocialIdentityErrorCodes.ProviderInvalid, error?.Code);
    }

    [Fact]
    public async Task SocialLogin_RateLimitRejectsEleventhRequest()
    {
        await using var factory = CreateFactory(
            new FakeVerifier(),
            new FakeIdentityRepository(),
            new FakeEventStore());
        using var client = factory.CreateClient();

        for (var index = 0; index < 10; index++)
        {
            var response = await client.PostAsJsonAsync("/api/auth/social", new
            {
                provider = "google",
                credential = $"credential-{index}"
            });
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        }

        var limited = await client.PostAsJsonAsync("/api/auth/social", new
        {
            provider = "google",
            credential = "credential-limited"
        });

        Assert.Equal(HttpStatusCode.TooManyRequests, limited.StatusCode);
    }

    [Fact]
    public async Task Logout_RequiresVuxoJwt_AndSucceedsForAuthenticatedUser()
    {
        await using var factory = CreateFactory(
            new FakeVerifier(),
            new FakeIdentityRepository(),
            new FakeEventStore());
        using var client = factory.CreateClient();

        var anonymous = await client.PostAsync("/api/auth/logout", content: null);
        Assert.Equal(HttpStatusCode.Unauthorized, anonymous.StatusCode);

        var login = await LoginAsync(client, "google", "credential");
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", login.AccessToken);

        var logout = await client.PostAsync("/api/auth/logout", content: null);
        Assert.Equal(HttpStatusCode.NoContent, logout.StatusCode);
    }

    [Theory]
    [InlineData("common", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", true)]
    [InlineData("organizations", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", true)]
    [InlineData("organizations", MicrosoftTenantPolicy.ConsumerTenantId, false)]
    [InlineData("consumers", MicrosoftTenantPolicy.ConsumerTenantId, true)]
    [InlineData("consumers", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", false)]
    [InlineData("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", true)]
    [InlineData("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", false)]
    [InlineData("common", "not-a-guid", false)]
    public void MicrosoftTenantPolicy_RestrictsConfiguredAudience(
        string configuredTenant,
        string tokenTenant,
        bool expected)
    {
        Assert.Equal(expected, MicrosoftTenantPolicy.IsAllowed(configuredTenant, tokenTenant));
    }

    private static async Task<LoginResponse> LoginAsync(
        HttpClient client,
        string provider,
        string credential)
    {
        var response = await client.PostAsJsonAsync("/api/auth/social", new { provider, credential });
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<LoginResponse>())!;
    }

    private static VuxoApiFactory CreateFactory(
        FakeVerifier verifier,
        FakeIdentityRepository repository,
        FakeEventStore events,
        IReadOnlyDictionary<string, string?>? configuration = null) =>
        new(
            configureServices: services =>
            {
                services.RemoveAll<ISocialIdentityVerifier>();
                services.RemoveAll<IVuxoIdentityRepository>();
                services.RemoveAll<IGameEventStore>();
                services.RemoveAll<IUnitOfWork>();

                services.AddSingleton<ISocialIdentityVerifier>(verifier);
                services.AddSingleton<IVuxoIdentityRepository>(repository);
                services.AddSingleton<IGameEventStore>(events);
                services.AddSingleton<IUnitOfWork, FakeUnitOfWork>();
            },
            configurationOverrides: configuration);

    private sealed class FakeVerifier(
        string? errorCode = null,
        string? email = "social@example.test",
        bool emailVerified = true) : ISocialIdentityVerifier
    {
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

            return Task.FromResult(new VerifiedSocialIdentity(
                provider,
                $"{provider}-subject",
                $"{provider} Player",
                email,
                emailVerified));
        }
    }

    private sealed class FakeIdentityRepository : IVuxoIdentityRepository
    {
        public Dictionary<(string Provider, string Subject), VuxoUser> Users { get; } = [];

        public Task<VuxoUser?> GetByExternalIdentityAsync(
            string provider,
            string subject,
            CancellationToken cancellationToken = default) =>
            Task.FromResult(Users.GetValueOrDefault((provider, subject)));

        public Task<VuxoUser?> GetByVerifiedEmailAsync(
            string email,
            CancellationToken cancellationToken = default) =>
            Task.FromResult(Users.Values
                .Where(x => string.Equals(x.Email, email, StringComparison.OrdinalIgnoreCase))
                .OrderBy(x => x.CreatedAtUtc)
                .FirstOrDefault());

        public Task LinkExternalIdentityAsync(
            VuxoUser user,
            string provider,
            string subject,
            DateTimeOffset linkedAtUtc,
            CancellationToken cancellationToken = default)
        {
            Users[(provider, subject)] = user;
            return Task.CompletedTask;
        }

        public Task AddAsync(
            VuxoUser user,
            string provider,
            string subject,
            DateTimeOffset linkedAtUtc,
            CancellationToken cancellationToken = default)
        {
            Users[(provider, subject)] = user;
            return Task.CompletedTask;
        }

        public Task UpdateLoginAsync(
            VuxoUser user,
            string provider,
            string subject,
            DateTimeOffset loginAtUtc,
            CancellationToken cancellationToken = default)
        {
            Users[(provider, subject)] = user;
            return Task.CompletedTask;
        }
    }

    private sealed class FakeEventStore : IGameEventStore
    {
        public Task AppendAsync(
            GameEventEnvelope envelope,
            string payloadJson,
            CancellationToken cancellationToken = default) =>
            Task.CompletedTask;
    }

    private sealed class FakeUnitOfWork : IUnitOfWork
    {
        public Task<int> SaveChangesAsync(CancellationToken cancellationToken = default) =>
            Task.FromResult(1);
    }

    private sealed record ErrorResponse(string Code);

    private sealed record LoginResponse(
        string AccessToken,
        string TokenType,
        DateTimeOffset ExpiresAtUtc,
        LoginUser User);

    private sealed record LoginUser(Guid Id, string DisplayName, string? Email);
}
