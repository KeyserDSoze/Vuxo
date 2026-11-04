using Vuxo.Application.Events;
using Vuxo.Domain.Common;
using Vuxo.Domain.Events;
using Vuxo.Domain.Inventory;
using Vuxo.Domain.PersonalContent;

namespace Vuxo.Application.PersonalContent;

public sealed class ExclusiveContentService(
    IExclusiveContentGrantRepository repository,
    IGameEventStore eventStore,
    IUnitOfWork unitOfWork,
    TimeProvider timeProvider,
    IPlayerInventoryRepository inventoryRepository)
{
    public async Task<ExclusiveContentGrant> GrantAsync(
        GrantExclusiveContentCommand command,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(command);
        if (command.SourceEventId == Guid.Empty)
        {
            throw new ArgumentException("Source event id is required.", nameof(command));
        }

        var now = timeProvider.GetUtcNow();
        var grantEventId = Guid.NewGuid();
        var correlationId = command.CorrelationId ?? Guid.NewGuid();
        var causationId = command.CausationId ?? command.SourceEventId;

        var grant = ExclusiveContentGrant.Create(
            grantEventId,
            command.SourceEventId,
            command.PlayerId,
            command.ContentKey,
            command.PortalKey,
            command.DialogBranchKey,
            command.RewardKey,
            command.Seed,
            command.RuleVersion,
            correlationId,
            causationId,
            now,
            command.ExpiresAtUtc);

        await repository.AddAsync(grant, cancellationToken);
        await eventStore.AppendAsync(
            new GameEventEnvelope(
                grantEventId,
                "exclusive_content.granted",
                GameEventVisibilityScope.Player,
                grant.PlayerId,
                grant.CorrelationId,
                grant.CausationId,
                grant.RuleVersion,
                now),
            GameEventPayloadSerializer.Serialize(
                "exclusive_content.granted",
                new
                {
                    grantId = grant.Id,
                    grant.SourceEventId,
                    grant.ContentKey,
                    grant.PortalKey,
                    grant.DialogBranchKey,
                    grant.RewardKey,
                    grant.Seed,
                    grant.ExpiresAtUtc
                }),
            cancellationToken);

        await unitOfWork.SaveChangesAsync(cancellationToken);
        return grant;
    }

    public Task<IReadOnlyList<PlayerInventoryAward>> GetInventoryAsync(
        string playerId,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(playerId);
        return inventoryRepository.GetForPlayerAsync(playerId.Trim(), cancellationToken);
    }

    public Task<IReadOnlyList<ExclusiveContentGrant>> GetAvailableAsync(
        string playerId,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(playerId);
        return repository.GetAvailableForPlayerAsync(playerId.Trim(), timeProvider.GetUtcNow(), cancellationToken);
    }

    /// <summary>Reveal the rune sequence only to the owner of a live personal grant.</summary>
    public async Task<PortalSequenceChallenge> GetChallengeAsync(
        string playerId,
        Guid grantId,
        CancellationToken cancellationToken = default)
    {
        var (grant, _) = await LoadActiveGrantAsync(playerId, grantId, cancellationToken);
        RequireSequencePortal(grant);
        return PortalSequenceRules.Generate(grant.Id, grant.Seed, grant.RuleVersion);
    }

    /// <summary>Only the backend decides whether a challenge was passed.</summary>
    public async Task<ExclusiveContentGrant> SubmitChallengeAsync(
        string playerId,
        Guid grantId,
        IReadOnlyList<string>? answer,
        CancellationToken cancellationToken = default)
    {
        var (grant, now) = await LoadActiveGrantAsync(playerId, grantId, cancellationToken);
        RequireSequencePortal(grant);

        if (!PortalSequenceRules.IsWellFormed(answer))
        {
            throw new ExclusiveContentException(ExclusiveContentErrorCodes.ChallengeInvalidAnswer);
        }

        var challenge = PortalSequenceRules.Generate(grant.Id, grant.Seed, grant.RuleVersion);
        if (!PortalSequenceRules.Matches(challenge, answer))
        {
            throw new ExclusiveContentException(ExclusiveContentErrorCodes.ChallengeIncorrect);
        }

        return await ConsumeGrantAsync(grant, now, true, cancellationToken);
    }

    public async Task<ExclusiveContentGrant> ConsumeAsync(
        string playerId,
        Guid grantId,
        CancellationToken cancellationToken = default)
    {
        var (grant, now) = await LoadActiveGrantAsync(playerId, grantId, cancellationToken);
        if (grant.PortalKey == PortalSequenceRules.PortalKey)
        {
            throw new ExclusiveContentException(ExclusiveContentErrorCodes.ChallengeRequired);
        }

        return await ConsumeGrantAsync(grant, now, false, cancellationToken);
    }

    private async Task<(ExclusiveContentGrant Grant, DateTimeOffset Now)> LoadActiveGrantAsync(
        string playerId,
        Guid grantId,
        CancellationToken cancellationToken)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(playerId);
        if (grantId == Guid.Empty) throw new ArgumentException("Grant id is required.", nameof(grantId));

        var grant = await repository.GetByIdForPlayerAsync(grantId, playerId.Trim(), cancellationToken)
            ?? throw new ExclusiveContentException(ExclusiveContentErrorCodes.NotFound);
        var now = timeProvider.GetUtcNow();

        if (grant.IsConsumed) throw new ExclusiveContentException(ExclusiveContentErrorCodes.Consumed);
        if (grant.IsExpired(now)) throw new ExclusiveContentException(ExclusiveContentErrorCodes.Expired);

        return (grant, now);
    }

    private static void RequireSequencePortal(ExclusiveContentGrant grant)
    {
        if (grant.PortalKey != PortalSequenceRules.PortalKey)
        {
            throw new ExclusiveContentException(ExclusiveContentErrorCodes.ChallengeNotAvailable);
        }
    }

    private async Task<ExclusiveContentGrant> ConsumeGrantAsync(
        ExclusiveContentGrant grant,
        DateTimeOffset now,
        bool challengeCompleted,
        CancellationToken cancellationToken)
    {
        if (!grant.TryConsume(now))
        {
            throw new ExclusiveContentException(ExclusiveContentErrorCodes.Consumed);
        }

        await repository.UpdateAsync(grant, cancellationToken);
        var consumptionEventId = Guid.NewGuid();
        await eventStore.AppendAsync(
            new GameEventEnvelope(
                consumptionEventId,
                "exclusive_content.consumed",
                GameEventVisibilityScope.Player,
                grant.PlayerId,
                grant.CorrelationId,
                grant.GrantEventId,
                grant.RuleVersion,
                now),
            GameEventPayloadSerializer.Serialize(
                "exclusive_content.consumed",
                new
                {
                    grantId = grant.Id,
                    grant.ContentKey,
                    grant.RewardKey,
                    challengeType = challengeCompleted ? "sequence" : null,
                    challengeVersion = challengeCompleted ? PortalSequenceRules.Version : null,
                    consumedAtUtc = grant.ConsumedAtUtc
                }),
            cancellationToken);

        // Each canonical item award, its provenance event and the grant consumption
        // share one EF DbContext/SaveChanges transaction. GrantId is the inventory
        // primary key; parallel attempts cannot create two awards.
        if (InventoryItemCatalog.IsSupported(grant.RewardKey))
        {
            var award = PlayerInventoryAward.FromConsumedGrant(
                grant, consumptionEventId, Guid.NewGuid(), now);
            await inventoryRepository.AddAsync(award, cancellationToken);
            await eventStore.AppendAsync(
                new GameEventEnvelope(
                    award.AwardEventId,
                    "inventory.item_awarded",
                    GameEventVisibilityScope.Player,
                    award.PlayerId,
                    award.CorrelationId,
                    award.CausationId,
                    grant.RuleVersion,
                    now),
                GameEventPayloadSerializer.Serialize(
                    "inventory.item_awarded",
                    new
                    {
                        grantId = award.GrantId,
                        itemKey = award.ItemKey,
                        quantity = PlayerInventoryAward.Quantity,
                        awardedAtUtc = award.AwardedAtUtc
                    }),
                cancellationToken);
        }

        await unitOfWork.SaveChangesAsync(cancellationToken);
        return grant;
    }
}
