using Vuxo.Application.PersonalContent;
using Vuxo.Domain.Common;
using Vuxo.Domain.Events;
using Vuxo.Domain.PersonalContent;
using Xunit;

namespace Vuxo.Application.Tests.PersonalContent;

public sealed class ExclusiveContentServiceTests
{
    private static readonly DateTimeOffset Now = new(2026, 9, 16, 13, 30, 0, TimeSpan.Zero);

    [Fact]
    public async Task GrantAsync_PersistsTraceablePlayerScopedDecision()
    {
        var repository = new FakeRepository();
        var events = new FakeEventStore();
        var unitOfWork = new FakeUnitOfWork();
        var service = CreateService(repository, events, unitOfWork);
        var sourceEventId = Guid.NewGuid();
        var correlationId = Guid.NewGuid();

        var grant = await service.GrantAsync(new GrantExclusiveContentCommand(
            sourceEventId,
            "player-a",
            "portal.grove.001",
            "portal-grove",
            "npc-keeper-secret",
            "reward-grove-token",
            424242,
            "personal-content-v1",
            correlationId));

        Assert.Same(grant, Assert.Single(repository.Grants));
        Assert.Equal(424242, grant.Seed);
        Assert.Equal("personal-content-v1", grant.RuleVersion);
        Assert.Equal(sourceEventId, grant.SourceEventId);
        Assert.Equal(sourceEventId, grant.CausationId);
        Assert.Equal(correlationId, grant.CorrelationId);
        Assert.Equal(1, unitOfWork.SaveCalls);

        var appended = Assert.Single(events.Appended);
        Assert.Equal(grant.GrantEventId, appended.Envelope.EventId);
        Assert.Equal("exclusive_content.granted", appended.Envelope.EventType);
        Assert.Equal(GameEventVisibilityScope.Player, appended.Envelope.VisibilityScope);
        Assert.Equal("player-a", appended.Envelope.PlayerId);
        Assert.Equal(correlationId, appended.Envelope.CorrelationId);
        Assert.Equal(sourceEventId, appended.Envelope.CausationId);
        Assert.Equal("personal-content-v1", appended.Envelope.RuleVersion);
        Assert.Contains("424242", appended.PayloadJson, StringComparison.Ordinal);
    }

    [Fact]
    public async Task GetAvailableAsync_ReturnsOnlyTargetPlayersActiveGrants()
    {
        var repository = new FakeRepository();
        var service = CreateService(repository);
        var activeA = CreateGrant("player-a", expiresAtUtc: Now.AddHours(1));
        var activeB = CreateGrant("player-b", expiresAtUtc: Now.AddHours(1));
        var expiredA = CreateGrant("player-a", expiresAtUtc: Now.AddMinutes(-1));
        var consumedA = CreateGrant("player-a", expiresAtUtc: Now.AddHours(1));
        Assert.True(consumedA.TryConsume(Now.AddMinutes(-5)));
        repository.Grants.AddRange([activeA, activeB, expiredA, consumedA]);

        var grants = await service.GetAvailableAsync("player-a");

        var only = Assert.Single(grants);
        Assert.Equal(activeA.Id, only.Id);
    }

    [Fact]
    public async Task ConsumeAsync_ForDifferentPlayer_DoesNotRevealOrConsumeGrant()
    {
        var repository = new FakeRepository();
        var events = new FakeEventStore();
        var unitOfWork = new FakeUnitOfWork();
        var service = CreateService(repository, events, unitOfWork);
        var grant = CreateGrant("player-a", expiresAtUtc: Now.AddHours(1));
        repository.Grants.Add(grant);

        var exception = await Assert.ThrowsAsync<ExclusiveContentException>(
            () => service.ConsumeAsync("player-b", grant.Id));

        Assert.Equal(ExclusiveContentErrorCodes.NotFound, exception.Code);
        Assert.False(grant.IsConsumed);
        Assert.Equal(0, repository.UpdateCalls);
        Assert.Empty(events.Appended);
        Assert.Equal(0, unitOfWork.SaveCalls);
    }

    [Fact]
    public async Task ConsumeAsync_ExpiredGrant_IsRejectedWithoutMutation()
    {
        var repository = new FakeRepository();
        var events = new FakeEventStore();
        var unitOfWork = new FakeUnitOfWork();
        var service = CreateService(repository, events, unitOfWork);
        var grant = CreateGrant("player-a", expiresAtUtc: Now.AddSeconds(-1));
        repository.Grants.Add(grant);

        var exception = await Assert.ThrowsAsync<ExclusiveContentException>(
            () => service.ConsumeAsync("player-a", grant.Id));

        Assert.Equal(ExclusiveContentErrorCodes.Expired, exception.Code);
        Assert.False(grant.IsConsumed);
        Assert.Equal(0, repository.UpdateCalls);
        Assert.Empty(events.Appended);
        Assert.Equal(0, unitOfWork.SaveCalls);
    }

    [Fact]
    public async Task ConsumeAsync_CanOnlyHappenOnce_AndAuditsFromGrantEvent()
    {
        var repository = new FakeRepository();
        var events = new FakeEventStore();
        var unitOfWork = new FakeUnitOfWork();
        var service = CreateService(repository, events, unitOfWork);
        var grant = CreateGrant("player-a", expiresAtUtc: Now.AddHours(1));
        repository.Grants.Add(grant);

        var consumed = await service.ConsumeAsync("player-a", grant.Id);

        Assert.Equal(Now, consumed.ConsumedAtUtc);
        Assert.Equal(1, repository.UpdateCalls);
        Assert.Equal(1, unitOfWork.SaveCalls);
        var eventRecord = Assert.Single(events.Appended);
        Assert.Equal("exclusive_content.consumed", eventRecord.Envelope.EventType);
        Assert.Equal(GameEventVisibilityScope.Player, eventRecord.Envelope.VisibilityScope);
        Assert.Equal(grant.GrantEventId, eventRecord.Envelope.CausationId);
        Assert.Equal(grant.CorrelationId, eventRecord.Envelope.CorrelationId);

        var exception = await Assert.ThrowsAsync<ExclusiveContentException>(
            () => service.ConsumeAsync("player-a", grant.Id));
        Assert.Equal(ExclusiveContentErrorCodes.Consumed, exception.Code);
        Assert.Equal(1, repository.UpdateCalls);
        Assert.Equal(1, unitOfWork.SaveCalls);
    }

    [Fact]
    public void Rehydrate_PreservesHistoricalSeedAndRuleVersion()
    {
        var original = CreateGrant("player-a", expiresAtUtc: null, seed: 77, ruleVersion: "rules-v1");

        var restored = ExclusiveContentGrant.Rehydrate(
            original.Id,
            original.GrantEventId,
            original.SourceEventId,
            original.PlayerId,
            original.ContentKey,
            original.PortalKey,
            original.DialogBranchKey,
            original.RewardKey,
            original.Seed,
            original.RuleVersion,
            original.CorrelationId,
            original.CausationId,
            original.CreatedAtUtc,
            original.ExpiresAtUtc,
            original.ConsumedAtUtc);

        Assert.Equal(77, restored.Seed);
        Assert.Equal("rules-v1", restored.RuleVersion);
    }

    [Fact]
    public async Task Challenge_WrongAnswerDoesNotConsume_ButCorrectAnswerAuditsOnce()
    {
        var repository = new FakeRepository();
        var events = new FakeEventStore();
        var unitOfWork = new FakeUnitOfWork();
        var service = CreateService(repository, events, unitOfWork);
        var grant = CreateGrant("player-a", Now.AddHours(1), portalKey: PortalSequenceRules.PortalKey);
        repository.Grants.Add(grant);

        var challenge = await service.GetChallengeAsync("player-a", grant.Id);
        var wrong = challenge.Sequence.ToArray();
        wrong[0] = wrong[0] == "sun" ? "moon" : "sun";
        var incorrect = await Assert.ThrowsAsync<ExclusiveContentException>(
            () => service.SubmitChallengeAsync("player-a", grant.Id, wrong));
        Assert.Equal(ExclusiveContentErrorCodes.ChallengeIncorrect, incorrect.Code);
        Assert.False(grant.IsConsumed);
        Assert.Empty(events.Appended);

        var consumed = await service.SubmitChallengeAsync("player-a", grant.Id, challenge.Sequence);
        Assert.Equal(Now, consumed.ConsumedAtUtc);
        Assert.Equal(1, repository.UpdateCalls);
        Assert.Equal(1, unitOfWork.SaveCalls);
        var audit = Assert.Single(events.Appended);
        Assert.Equal(GameEventVisibilityScope.Player, audit.Envelope.VisibilityScope);
        Assert.Equal(grant.GrantEventId, audit.Envelope.CausationId);
        Assert.Contains("portal-sequence-v1", audit.PayloadJson, StringComparison.Ordinal);
        var replay = await Assert.ThrowsAsync<ExclusiveContentException>(
            () => service.SubmitChallengeAsync("player-a", grant.Id, challenge.Sequence));
        Assert.Equal(ExclusiveContentErrorCodes.Consumed, replay.Code);
    }

    [Fact]
    public async Task Challenge_LegacyConsumeCannotBypass_AndOtherPlayerGetsNotFound()
    {
        var repository = new FakeRepository();
        var service = CreateService(repository);
        var grant = CreateGrant("player-a", Now.AddHours(1), portalKey: PortalSequenceRules.PortalKey);
        repository.Grants.Add(grant);

        var bypass = await Assert.ThrowsAsync<ExclusiveContentException>(
            () => service.ConsumeAsync("player-a", grant.Id));
        Assert.Equal(ExclusiveContentErrorCodes.ChallengeRequired, bypass.Code);
        var other = await Assert.ThrowsAsync<ExclusiveContentException>(
            () => service.GetChallengeAsync("player-b", grant.Id));
        Assert.Equal(ExclusiveContentErrorCodes.NotFound, other.Code);
        var malformed = await Assert.ThrowsAsync<ExclusiveContentException>(
            () => service.SubmitChallengeAsync("player-a", grant.Id, ["sun"]));
        Assert.Equal(ExclusiveContentErrorCodes.ChallengeInvalidAnswer, malformed.Code);
        Assert.False(grant.IsConsumed);
    }

    private static ExclusiveContentService CreateService(
        FakeRepository repository,
        FakeEventStore? events = null,
        FakeUnitOfWork? unitOfWork = null) =>
        new(
            repository,
            events ?? new FakeEventStore(),
            unitOfWork ?? new FakeUnitOfWork(),
            new FixedTimeProvider(Now));

    private static ExclusiveContentGrant CreateGrant(
        string playerId,
        DateTimeOffset? expiresAtUtc,
        long seed = 42,
        string ruleVersion = "rules-v1",
        string portalKey = "portal-key") =>
        ExclusiveContentGrant.Create(
            Guid.NewGuid(),
            Guid.NewGuid(),
            playerId,
            "content-key",
            portalKey,
            "dialog-key",
            "reward-key",
            seed,
            ruleVersion,
            Guid.NewGuid(),
            Guid.NewGuid(),
            Now.AddHours(-1),
            expiresAtUtc);

    private sealed class FakeRepository : IExclusiveContentGrantRepository
    {
        public List<ExclusiveContentGrant> Grants { get; } = [];
        public int UpdateCalls { get; private set; }

        public Task AddAsync(ExclusiveContentGrant grant, CancellationToken cancellationToken = default)
        {
            Grants.Add(grant);
            return Task.CompletedTask;
        }

        public Task UpdateAsync(ExclusiveContentGrant grant, CancellationToken cancellationToken = default)
        {
            UpdateCalls++;
            return Task.CompletedTask;
        }

        public Task<IReadOnlyList<ExclusiveContentGrant>> GetAvailableForPlayerAsync(
            string playerId,
            DateTimeOffset now,
            CancellationToken cancellationToken = default)
        {
            IReadOnlyList<ExclusiveContentGrant> result = Grants
                .Where(x => x.PlayerId == playerId && x.IsAvailable(now))
                .ToArray();
            return Task.FromResult(result);
        }

        public Task<ExclusiveContentGrant?> GetByIdForPlayerAsync(
            Guid grantId,
            string playerId,
            CancellationToken cancellationToken = default) =>
            Task.FromResult(Grants.SingleOrDefault(x => x.Id == grantId && x.PlayerId == playerId));
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
        public int SaveCalls { get; private set; }

        public Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
        {
            SaveCalls++;
            return Task.FromResult(1);
        }
    }

    private sealed class FixedTimeProvider(DateTimeOffset utcNow) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => utcNow;
    }
}
