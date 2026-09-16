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
    }
}
