using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Vuxo.Api.Tests.Infrastructure;
using Vuxo.Domain.Activities;

namespace Vuxo.Api.Tests.Activities;

public sealed class OffworldRunApiTests
{
    [Fact]
    public async Task AllRunEndpoints_RequireAuthentication()
    {
        using var factory = Factory(new FakeRuns());
        using var client = factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await client.PostAsync("/api/activities/runs/rune-path", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await client.GetAsync($"/api/activities/runs/{Guid.NewGuid()}")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await client.PostAsJsonAsync($"/api/activities/runs/{Guid.NewGuid()}/complete",
                new { moves = "DDDRRR" })).StatusCode);
    }

    [Fact]
    public async Task StartGetComplete_UseJwtOwnerAndPersistedRunId_NotClientClaimedReward()
    {
        var fake = new FakeRuns();
        using var factory = Factory(fake);
        using var client = factory.CreateClient();
        await LoginAsync(client, "player-a");
        var startKey = Guid.NewGuid();
        using var start = NewPost("/api/activities/runs/rune-path", startKey);
        using var started = await client.SendAsync(start);
        Assert.Equal(HttpStatusCode.Created, started.StatusCode);
        var run = await started.Content.ReadFromJsonAsync<OffworldRunResult>();
        Assert.NotNull(run);
        Assert.Equal("player-a", fake.LastOwner);
        Assert.Equal(startKey, fake.StartKey);
        Assert.Equal(OffworldRunRules.Active, run.State);

        using var status = await client.GetAsync($"/api/activities/runs/{run.RunId}");
        Assert.Equal(HttpStatusCode.OK, status.StatusCode);

        var key = Guid.NewGuid();
        using var completed = NewPost($"/api/activities/runs/{run.RunId}/complete", key,
            new { moves = "DDDRRR" });
        using var response = await client.SendAsync(completed);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("DDDRRR", fake.LastPath);
        Assert.Equal(key, fake.FinishKey);
        Assert.Equal("player-a", fake.LastOwner);
        var final = await response.Content.ReadFromJsonAsync<OffworldRunResult>();
        Assert.NotNull(final);
        Assert.Equal(OffworldRunRules.Completed, final.State);
        Assert.False(final.Replayed);
    }

    [Theory]
    [InlineData("")]
    [InlineData("not-a-guid")]
    [InlineData("00000000-0000-0000-0000-000000000000")]
    public async Task BothWrites_RequireUuidIdempotency(string key)
    {
        using var factory = Factory(new FakeRuns());
        using var client = factory.CreateClient();
        await LoginAsync(client, "player-a");
        foreach (var url in new[] {
            "/api/activities/runs/rune-path",
            $"/api/activities/runs/{Guid.NewGuid()}/complete"
        })
        {
            using var request = new HttpRequestMessage(HttpMethod.Post, url);
            if (key.Length > 0) request.Headers.Add("Idempotency-Key", key);
            if (url.EndsWith("/complete"))
                request.Content = JsonContent.Create(new { moves = "DDDRRR" });
            using var response = await client.SendAsync(request);
            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        }
    }

    [Theory]
    [InlineData(OffworldRunErrorCodes.InvalidPath, HttpStatusCode.UnprocessableEntity)]
    [InlineData(OffworldRunErrorCodes.Expired, HttpStatusCode.Gone)]
    [InlineData(OffworldRunErrorCodes.NotFound, HttpStatusCode.NotFound)]
    [InlineData(OffworldRunErrorCodes.KeyReused, HttpStatusCode.Conflict)]
    public async Task Complete_MapsDomainErrorsWithoutLeakingOtherOwners(
        string code, HttpStatusCode expected)
    {
        using var factory = Factory(new FakeRuns { ErrorCode = code });
        using var client = factory.CreateClient();
        await LoginAsync(client, "player-b");
        using var request = NewPost($"/api/activities/runs/{Guid.NewGuid()}/complete",
            Guid.NewGuid(), new { moves = "DDDRRR" });
        using var response = await client.SendAsync(request);
        Assert.Equal(expected, response.StatusCode);
        var error = await response.Content.ReadFromJsonAsync<Error>();
        Assert.Equal(code, error?.Code);
    }

    [Fact]
    public async Task UnsupportedActivity_IsRejectedBeforeRepositoryIsCalled()
    {
        var fake = new FakeRuns();
        using var factory = Factory(fake);
        using var client = factory.CreateClient();
        await LoginAsync(client, "player-a");
        using var request = NewPost("/api/activities/runs/rune-reflex", Guid.NewGuid());
        using var response = await client.SendAsync(request);
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Null(fake.LastOwner);
    }

    private static HttpRequestMessage NewPost(string path, Guid key, object? body = null)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, path);
        request.Headers.Add("Idempotency-Key", key.ToString());
        if (body is not null) request.Content = JsonContent.Create(body);
        return request;
    }

    private static VuxoApiFactory Factory(FakeRuns runs) => new(
        configureServices: services =>
        {
            services.RemoveAll<IOffworldRunRepository>();
            services.AddSingleton<IOffworldRunRepository>(runs);
        });

    private static async Task LoginAsync(HttpClient client, string player)
    {
        using var login = await client.PostAsJsonAsync("/api/auth/mock",
            new { subject = player, displayName = "Activity Tester", role = "User" });
        login.EnsureSuccessStatusCode();
        var token = await login.Content.ReadFromJsonAsync<Login>();
        Assert.NotNull(token);
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", token.AccessToken);
    }

    private sealed record Login(string AccessToken, string TokenType);
    private sealed record Error(string Code);
    private sealed class FakeRuns : IOffworldRunRepository
    {
        public string? LastOwner { get; private set; }
        public Guid? StartKey { get; private set; }
        public Guid? FinishKey { get; private set; }
        public string? LastPath { get; private set; }
        public string? ErrorCode { get; init; }
        private readonly Guid _runId = Guid.NewGuid();
        private readonly DateTimeOffset _start = DateTimeOffset.UtcNow;
        public Task<OffworldRunResult> StartAsync(string ownerId, Guid key,
            DateTimeOffset now, CancellationToken cancellationToken = default)
        {
            LastOwner = ownerId;
            StartKey = key;
            return Task.FromResult(Build(false));
        }
        public Task<OffworldRunResult?> GetAsync(string ownerId, Guid runId,
            DateTimeOffset now, CancellationToken cancellationToken = default)
        {
            LastOwner = ownerId;
            return Task.FromResult<OffworldRunResult?>(runId == _runId ? Build(false) : null);
        }
        public Task<OffworldRunResult> CompleteAsync(string ownerId, Guid runId,
            Guid key, string? path, DateTimeOffset now,
            CancellationToken cancellationToken = default)
        {
            LastOwner = ownerId;
            FinishKey = key;
            LastPath = path;
            if (ErrorCode is not null) throw new OffworldRunException(ErrorCode);
            return Task.FromResult(Build(true));
        }
        private OffworldRunResult Build(bool complete) =>
            new(_runId, "rune-path", RunePathPracticeRules.Version, 0, _start,
                _start.AddMinutes(5), complete ? "completed" : "active",
                complete ? _start.AddSeconds(20) : null,
                complete ? 6 : null, Replayed: false);
    }
}
