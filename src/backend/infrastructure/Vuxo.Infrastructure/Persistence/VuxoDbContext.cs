using Microsoft.EntityFrameworkCore;
using Vuxo.Domain.Common;
using Vuxo.Infrastructure.Persistence.Entities;

namespace Vuxo.Infrastructure.Persistence;

public sealed class VuxoDbContext(DbContextOptions<VuxoDbContext> options) : DbContext(options), IUnitOfWork
{
    public DbSet<PlayerCharacterEntity> PlayerCharacters => Set<PlayerCharacterEntity>();
    public DbSet<GameEventEntity> GameEvents => Set<GameEventEntity>();
    public DbSet<WorldDefinitionEntity> WorldDefinitions => Set<WorldDefinitionEntity>();
    public DbSet<WorldChunkEntity> WorldChunks => Set<WorldChunkEntity>();
    public DbSet<ExclusiveContentGrantEntity> ExclusiveContentGrants => Set<ExclusiveContentGrantEntity>();
    public DbSet<PlayerInventoryAwardEntity> PlayerInventoryAwards => Set<PlayerInventoryAwardEntity>();
    public DbSet<PlayerEquippedItemEntity> PlayerEquippedItems => Set<PlayerEquippedItemEntity>();
    public DbSet<VuxoUserEntity> VuxoUsers => Set<VuxoUserEntity>();
    public DbSet<ExternalIdentityEntity> ExternalIdentities => Set<ExternalIdentityEntity>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<PlayerCharacterEntity>(entity =>
        {
            entity.ToTable("player_characters", table => table.HasCheckConstraint(
                "CK_player_characters_CurrentHealth_Range",
                "\"CurrentHealth\" >= 0 AND \"CurrentHealth\" <= \"Constitution\" * 10"));
            entity.HasKey(x => x.Id);
            entity.HasIndex(x => x.OwnerId).IsUnique();
            entity.Property(x => x.OwnerId).HasMaxLength(200);
            entity.Property(x => x.Name).HasMaxLength(24);
        });

        modelBuilder.Entity<GameEventEntity>(entity =>
        {
            entity.ToTable("game_events");
            entity.HasKey(x => x.EventId);
            entity.HasIndex(x => new { x.PlayerId, x.OccurredAtUtc });
            entity.HasIndex(x => x.OccurredAtUtc);
            entity.HasIndex(x => new { x.EventType, x.OccurredAtUtc });
            entity.HasIndex(x => x.CorrelationId);
            entity.Property(x => x.EventType).HasMaxLength(200);
            entity.Property(x => x.RuleVersion).HasMaxLength(100);
            entity.Property(x => x.PayloadJson).HasColumnType("jsonb");
        });

        modelBuilder.Entity<WorldDefinitionEntity>(entity =>
        {
            entity.ToTable("world_definitions");
            entity.HasKey(x => x.WorldId);
            entity.Property(x => x.WorldId).HasMaxLength(100);
        });

        modelBuilder.Entity<WorldChunkEntity>(entity =>
        {
            entity.ToTable("world_chunks");
            entity.HasKey(x => new { x.WorldId, x.ChunkX, x.ChunkY });
            entity.Property(x => x.WorldId).HasMaxLength(100);
            entity.Property(x => x.Fingerprint).HasMaxLength(64);
            entity
                .HasOne<WorldDefinitionEntity>()
                .WithMany()
                .HasForeignKey(x => x.WorldId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<VuxoUserEntity>(entity =>
        {
            entity.ToTable("vuxo_users");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.DisplayName).HasMaxLength(200);
            entity.Property(x => x.Email).HasMaxLength(320);
        });

        modelBuilder.Entity<ExternalIdentityEntity>(entity =>
        {
            entity.ToTable("external_identities");
            entity.HasKey(x => new { x.Provider, x.Subject });
            entity.HasIndex(x => x.VuxoUserId);
            entity.Property(x => x.Provider).HasMaxLength(32);
            entity.Property(x => x.Subject).HasMaxLength(255);
            entity
                .HasOne<VuxoUserEntity>()
                .WithMany()
                .HasForeignKey(x => x.VuxoUserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<PlayerInventoryAwardEntity>(entity =>
        {
            entity.ToTable("player_inventory_awards");
            entity.HasKey(x => x.GrantId);
            entity.HasAlternateKey(x => new { x.GrantId, x.PlayerId });
            entity.HasIndex(x => x.AwardEventId).IsUnique();
            entity.HasIndex(x => new { x.PlayerId, x.AwardedAtUtc });
            entity.Property(x => x.PlayerId).HasMaxLength(200);
            entity.Property(x => x.ItemKey).HasMaxLength(200);
            entity.HasOne<ExclusiveContentGrantEntity>()
                .WithMany()
                .HasForeignKey(x => x.GrantId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<PlayerEquippedItemEntity>(entity =>
        {
            entity.ToTable("player_equipped_items");
            entity.HasKey(x => new { x.PlayerId, x.Slot });
            entity.Property(x => x.PlayerId).HasMaxLength(200);
            entity.Property(x => x.Slot).HasMaxLength(32);
            entity.HasIndex(x => x.GrantId).IsUnique();
            entity.HasOne<PlayerInventoryAwardEntity>()
                .WithMany()
                .HasForeignKey(x => new { x.GrantId, x.PlayerId })
                .HasPrincipalKey(x => new { x.GrantId, x.PlayerId })
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<ExclusiveContentGrantEntity>(entity =>
        {
            entity.ToTable("exclusive_content_grants");
            entity.HasKey(x => x.Id);
            entity.HasIndex(x => new { x.PlayerId, x.ConsumedAtUtc, x.ExpiresAtUtc });
            entity.HasIndex(x => x.GrantEventId).IsUnique();
            entity.Property(x => x.PlayerId).HasMaxLength(200);
            entity.Property(x => x.ContentKey).HasMaxLength(200);
            entity.Property(x => x.PortalKey).HasMaxLength(200);
            entity.Property(x => x.DialogBranchKey).HasMaxLength(200);
            entity.Property(x => x.RewardKey).HasMaxLength(200);
            entity.Property(x => x.RuleVersion).HasMaxLength(100);
            // Optimistic concurrency prevents two simultaneous attempts consuming one grant twice.
            entity.Property(x => x.ConsumedAtUtc).IsConcurrencyToken();
        });
    }
}
