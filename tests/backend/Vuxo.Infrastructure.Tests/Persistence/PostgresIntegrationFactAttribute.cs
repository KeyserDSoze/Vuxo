using Microsoft.EntityFrameworkCore;
using Npgsql;
using Vuxo.Infrastructure.Persistence;
using Xunit;

namespace Vuxo.Infrastructure.Tests.Persistence;

[AttributeUsage(AttributeTargets.Method, AllowMultiple = false)]
internal sealed class PostgresIntegrationFactAttribute : FactAttribute
{
    public const string ConnectionStringEnvironmentVariable = "VUXO_TEST_POSTGRES_CONNECTION_STRING";

    public PostgresIntegrationFactAttribute()
    {
        if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable(ConnectionStringEnvironmentVariable)))
        {
            Skip = $"Set {ConnectionStringEnvironmentVariable} to run PostgreSQL integration tests.";
        }
    }
}

internal sealed class PostgresDatabaseScope : IAsyncDisposable
{
    private readonly string _adminConnectionString;

    private PostgresDatabaseScope(string adminConnectionString, string databaseName, string connectionString)
    {
        _adminConnectionString = adminConnectionString;
        DatabaseName = databaseName;
        ConnectionString = connectionString;
    }

    public string DatabaseName { get; }
    public string ConnectionString { get; }

    public static async Task<PostgresDatabaseScope> CreateAsync()
    {
        var configured = Environment.GetEnvironmentVariable(PostgresIntegrationFactAttribute.ConnectionStringEnvironmentVariable)
            ?? throw new InvalidOperationException($"{PostgresIntegrationFactAttribute.ConnectionStringEnvironmentVariable} is required.");

        var adminBuilder = new NpgsqlConnectionStringBuilder(configured)
        {
            Database = "postgres",
            Pooling = false
        };
        var databaseName = $"vuxo_it_{Guid.NewGuid():N}";

        await using (var connection = new NpgsqlConnection(adminBuilder.ConnectionString))
        {
            await connection.OpenAsync();
            await using var command = connection.CreateCommand();
            command.CommandText = $"CREATE DATABASE \"{databaseName}\"";
            await command.ExecuteNonQueryAsync();
        }

        var databaseBuilder = new NpgsqlConnectionStringBuilder(configured)
        {
            Database = databaseName,
            Pooling = false
        };

        return new PostgresDatabaseScope(adminBuilder.ConnectionString, databaseName, databaseBuilder.ConnectionString);
    }

    public VuxoDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<VuxoDbContext>()
            .UseNpgsql(ConnectionString)
            .Options;
        return new VuxoDbContext(options);
    }

    public async ValueTask DisposeAsync()
    {
        NpgsqlConnection.ClearAllPools();
        await using var connection = new NpgsqlConnection(_adminConnectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = $"DROP DATABASE IF EXISTS \"{DatabaseName}\" WITH (FORCE)";
        await command.ExecuteNonQueryAsync();
    }
}
