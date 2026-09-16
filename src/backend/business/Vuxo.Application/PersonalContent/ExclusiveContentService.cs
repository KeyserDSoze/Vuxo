using System.Text.Json;
using Vuxo.Domain.Common;
using Vuxo.Domain.Events;
using Vuxo.Domain.PersonalContent;

namespace Vuxo.Application.PersonalContent;

public sealed class ExclusiveContentService(
    IExclusiveContentGrantRepository repository,
    IGameEventStore eventStore,
    IUnitOfWork unitOfWork,
    TimeProvider timeProvider)
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
            JsonSerializer.Serialize(new
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

    public Task<IReadOnlyList<ExclusiveContentGrant>> GetAvailableAsync(
        string playerId,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(playerId);
        return repository.GetAvailableForPlayerAsync(playerId.Trim(), timeProvider.GetUtcNow(), cancellationToken);
    }

    public async Task<ExclusiveContentGrant> ConsumeAsync(
        string playerId,
        Guid grantId,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(playerId);
        if (grantId == Guid.Empty) throw new ArgumentException("Grant id is required.", nameof(grantId));

        var grant = await repository.GetByIdForPlayerAsync(grantId, playerId.Trim(), cancellationToken)
            ?? throw new ExclusiveContentException(ExclusiveContentErrorCodes.NotFound);
        var now = timeProvider.GetUtcNow();

        if (grant.IsConsumed)
        {
            throw new ExclusiveContentException(ExclusiveContentErrorCodes.Consumed);
        }

        if (grant.IsExpired(now))
        {
            throw new ExclusiveContentException(ExclusiveContentErrorCodes.Expired);
        }

        if (!grant.TryConsume(now))
        {
            throw new InvalidOperationException("Available grant could not be consumed.");
        }

        await repository.UpdateAsync(grant, cancellationToken);
        await eventStore.AppendAsync(
            new GameEventEnvelope(
                Guid.NewGuid(),
                "exclusive_content.consumed",
                GameEventVisibilityScope.Player,
                grant.PlayerId,
                grant.CorrelationId,
                grant.GrantEventId,
                grant.RuleVersion,
                now),
            JsonSerializer.Serialize(new
            {
                grantId = grant.Id,
                grant.ContentKey,
                grant.RewardKey,
                consumedAtUtc = grant.ConsumedAtUtc
            }),
            cancellationToken);

        await unitOfWork.SaveChangesAsync(cancellationToken);
        return grant;
    }
}
