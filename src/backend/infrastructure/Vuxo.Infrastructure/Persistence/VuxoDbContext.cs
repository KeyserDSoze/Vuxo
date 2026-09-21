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
    public DbSet<VuxoUserEntity> VuxoUsers => Set<VuxoUserEntity>();
    public DbSet<ExternalIdentityEntity> ExternalIdentities => Set<ExternalIdentityEntity>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<PlayerCharacterEntity>(entity =>
        {
            entity.ToTable("player_characters");
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
        });
    }
}
