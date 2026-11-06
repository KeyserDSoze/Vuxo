using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Vuxo.Application.Events;
using Vuxo.Domain.Activities;
using Vuxo.Domain.Events;
using Vuxo.Infrastructure.Persistence.Entities;

namespace Vuxo.Infrastructure.Persistence;

/// <summary>
/// All state transitions take the canonical character FOR UPDATE lock,
/// matching rest/healing/Guardian. Idempotency and audit share the transaction.
/// A correct proof is not a reward claim, and no item or XP is created here.
/// </summary>
public sealed class OffworldRunRepository(VuxoDbContext db, IGameEventStore events)
    : IOffworldRunRepository
{
    public async Task<OffworldRunResult> StartAsync(string ownerId, Guid key,
        DateTimeOffset now, CancellationToken cancellationToken = default)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        var character = await LockCharacterAsync(ownerId, cancellationToken)
            ?? throw new OffworldRunException(OffworldRunErrorCodes.CharacterNotFound);

        // An exact replay precedes active/cooldown/quota checks; it must never
        // issue another ticket or audit event, including after expiration.
        var old = await db.OffworldActivityRuns.AsNoTracking()
            .SingleOrDefaultAsync(x => x.CharacterId == character.Id && x.StartKey == key,
                cancellationToken);
        if (old is not null)
            return ToResult(old, now, replayed: true);

        var stillActive = await db.OffworldActivityRuns
            .AnyAsync(x => x.CharacterId == character.Id
                && x.State == OffworldRunRules.Active && x.ExpiresAtUtc > now,
                cancellationToken);
        if (stillActive)
            throw new OffworldRunException(OffworldRunErrorCodes.AlreadyActive);

        var starts = db.OffworldActivityRuns.AsNoTracking()
            .Where(x => x.CharacterId == character.Id
                && x.StartedAtUtc > now.Subtract(OffworldRunRules.DailyWindow));
        // Locking the character serializes these checks against every other
        // API instance; the indexes are defense-in-depth against duplicate keys.
        var recentCount = await starts.CountAsync(cancellationToken);
        var last = await starts.OrderByDescending(x => x.StartedAtUtc)
            .Select(x => (DateTimeOffset?)x.StartedAtUtc)
            .FirstOrDefaultAsync(cancellationToken);
        OffworldRunRules.ValidateStart(now, last, recentCount);

        // Older live rows are retained and explicitly marked expired once the
        // next start arrives. Read-only GET projects expiry without a write.
        var stale = await db.OffworldActivityRuns
            .Where(x => x.CharacterId == character.Id
                && x.State == OffworldRunRules.Active && x.ExpiresAtUtc <= now)
            .ToListAsync(cancellationToken);
        foreach (var expired in stale)
        {
            expired.State = OffworldRunRules.Expired;
            await events.AppendAsync(new GameEventEnvelope(
                Guid.NewGuid(), "activity.run_expired",
                GameEventVisibilityScope.Player, ownerId, expired.Id,
                expired.StartEventId, expired.RulesVersion, now),
                GameEventPayloadSerializer.Serialize("activity.run_expired", new
                {
                    runId = expired.Id,
                    expiredAtUtc = expired.ExpiresAtUtc
                }), cancellationToken);
        }

        var run = new OffworldActivityRunEntity
        {
            Id = Guid.NewGuid(),
            CharacterId = character.Id,
            PlayerId = ownerId,
            ActivityKey = OffworldRunRules.ActivityKey,
            RulesVersion = RunePathPracticeRules.Version,
            PuzzleIndex = RandomNumberGenerator.GetInt32(RunePathPracticeRules.PuzzleCount),
            StartKey = key,
            StartEventId = Guid.NewGuid(),
            StartedAtUtc = now,
            ExpiresAtUtc = now.Add(OffworldRunRules.Lifetime),
            State = OffworldRunRules.Active
        };
        await db.OffworldActivityRuns.AddAsync(run, cancellationToken);
        await events.AppendAsync(new GameEventEnvelope(
            run.StartEventId, "activity.run_started",
            GameEventVisibilityScope.Player, ownerId,
            run.Id, null, run.RulesVersion, now),
            GameEventPayloadSerializer.Serialize("activity.run_started", new
            {
                runId = run.Id,
                characterId = run.CharacterId,
                run.ActivityKey,
                run.PuzzleIndex,
                run.StartedAtUtc,
                run.ExpiresAtUtc,
                rewardsEnabled = false
            }), cancellationToken);

        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return ToResult(run, now, replayed: false);
    }

    public async Task<IReadOnlyList<OffworldRunHistoryEntry>> GetHistoryAsync(
        string ownerId, int limit, DateTimeOffset now,
        CancellationToken cancellationToken = default)
    {
        // Restricted to the caller's JWT subject and the canonical activity.
        // Bounded, stable ordering avoids scanning or exposing another account.
        // An effective expired state is projected without changing the database.
        var runs = await db.OffworldActivityRuns.AsNoTracking()
            .Where(x => x.PlayerId == ownerId
                && x.ActivityKey == OffworldRunRules.ActivityKey)
            .OrderByDescending(x => x.StartedAtUtc)
            .ThenByDescending(x => x.Id)
            .Take(limit)
            .ToListAsync(cancellationToken);
        return runs.Select(run => new OffworldRunHistoryEntry(
            run.Id, run.ActivityKey, run.RulesVersion, run.PuzzleIndex,
            run.StartedAtUtc, run.ExpiresAtUtc,
            OffworldRunRules.CurrentState(run.State, run.ExpiresAtUtc, now),
            run.CompletedAtUtc, run.StepsChecked)).ToArray();
    }

    public async Task<OffworldRunResult?> GetActiveAsync(string ownerId,
        DateTimeOffset now, CancellationToken cancellationToken = default)
    {
        // The database expiry check makes discovery valid across browser tabs,
        // API instances and devices, without exposing another player's tickets.
        // No character lock or event is needed for this strictly read-only call.
        var active = await db.OffworldActivityRuns.AsNoTracking()
            .Where(x => x.PlayerId == ownerId
                && x.ActivityKey == OffworldRunRules.ActivityKey
                && x.State == OffworldRunRules.Active
                && x.ExpiresAtUtc > now)
            .OrderByDescending(x => x.StartedAtUtc)
            .FirstOrDefaultAsync(cancellationToken);
        return active is null ? null : ToResult(active, now, replayed: false);
    }

    public async Task<OffworldRunResult?> GetAsync(string ownerId, Guid runId,
        DateTimeOffset now, CancellationToken cancellationToken = default)
    {
        var run = await db.OffworldActivityRuns.AsNoTracking()
            .SingleOrDefaultAsync(x => x.Id == runId && x.PlayerId == ownerId,
                cancellationToken);
        return run is null ? null : ToResult(run, now, replayed: false);
    }

    public async Task<OffworldRunResult> CompleteAsync(string ownerId, Guid runId,
        Guid key, string? path, DateTimeOffset now,
        CancellationToken cancellationToken = default)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        var character = await LockCharacterAsync(ownerId, cancellationToken)
            ?? throw new OffworldRunException(OffworldRunErrorCodes.NotFound);
        var run = await db.OffworldActivityRuns.SingleOrDefaultAsync(
            x => x.Id == runId && x.CharacterId == character.Id
                && x.PlayerId == ownerId, cancellationToken)
            ?? throw new OffworldRunException(OffworldRunErrorCodes.NotFound);

        // The proof is checked against the same stored version/board that the
        // server assigned at start, never against a client-chosen puzzle index.
        var hash = path is { Length: > 0 and <= RunePathPracticeRules.MaximumMoves }
            ? Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(path)))
            : null;

        if (run.State == OffworldRunRules.Completed)
        {
            if (run.FinishKey == key && hash is not null
                && string.Equals(run.ProofHash, hash, StringComparison.Ordinal))
                return ToResult(run, now, replayed: true);
            if (run.FinishKey == key)
                throw new OffworldRunException(OffworldRunErrorCodes.KeyReused);
            throw new OffworldRunException(OffworldRunErrorCodes.Completed);
        }

        if (run.State == OffworldRunRules.Expired || now >= run.ExpiresAtUtc)
        {
            if (run.State != OffworldRunRules.Expired)
            {
                run.State = OffworldRunRules.Expired;
                await events.AppendAsync(new GameEventEnvelope(
                    Guid.NewGuid(), "activity.run_expired",
                    GameEventVisibilityScope.Player, ownerId, run.Id,
                    run.StartEventId, run.RulesVersion, now),
                    GameEventPayloadSerializer.Serialize("activity.run_expired",
                        new { runId = run.Id, expiredAtUtc = run.ExpiresAtUtc }),
                    cancellationToken);
                await db.SaveChangesAsync(cancellationToken);
                await transaction.CommitAsync(cancellationToken);
            }
            throw new OffworldRunException(OffworldRunErrorCodes.Expired);
        }

        if (run.RulesVersion != RunePathPracticeRules.Version
            || run.ActivityKey != OffworldRunRules.ActivityKey)
            throw new OffworldRunException(OffworldRunErrorCodes.InvalidActivity);

        if (await db.OffworldActivityRuns.AsNoTracking().AnyAsync(
            x => x.CharacterId == character.Id && x.FinishKey == key && x.Id != run.Id,
            cancellationToken))
            throw new OffworldRunException(OffworldRunErrorCodes.KeyReused);

        var verification = RunePathPracticeRules.Verify(run.PuzzleIndex, path);
        if (!verification.Solved || hash is null)
            throw new OffworldRunException(OffworldRunErrorCodes.InvalidPath);

        run.State = OffworldRunRules.Completed;
        run.FinishKey = key;
        run.FinishEventId = Guid.NewGuid();
        run.ProofHash = hash;
        run.StepsChecked = verification.StepsChecked;
        run.CompletedAtUtc = now;
        await events.AppendAsync(new GameEventEnvelope(
            run.FinishEventId.Value, "activity.run_completed",
            GameEventVisibilityScope.Player, ownerId, run.Id,
            run.StartEventId, run.RulesVersion, now),
            GameEventPayloadSerializer.Serialize("activity.run_completed", new
            {
                runId = run.Id,
                run.ActivityKey,
                run.PuzzleIndex,
                run.StepsChecked,
                run.CompletedAtUtc,
                rewardsEnabled = false
            }), cancellationToken);

        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return ToResult(run, now, replayed: false);
    }

    private async Task<PlayerCharacterEntity?> LockCharacterAsync(
        string ownerId, CancellationToken cancellationToken)
    {
        var result = await db.PlayerCharacters.FromSqlInterpolated(
            $"SELECT * FROM player_characters WHERE \"OwnerId\" = {ownerId} FOR UPDATE")
            .ToListAsync(cancellationToken);
        return result.SingleOrDefault();
    }

    private static OffworldRunResult ToResult(OffworldActivityRunEntity run,
        DateTimeOffset now, bool replayed) =>
        new(run.Id, run.ActivityKey, run.RulesVersion, run.PuzzleIndex,
            run.StartedAtUtc, run.ExpiresAtUtc,
            OffworldRunRules.CurrentState(run.State, run.ExpiresAtUtc, now),
            run.CompletedAtUtc, run.StepsChecked, replayed);
}
