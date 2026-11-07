using System.Collections.Concurrent;
using System.Data.Common;
using Microsoft.EntityFrameworkCore.Diagnostics;

namespace Vuxo.Infrastructure.Tests.Persistence;

/// <summary>
/// Test-only command interceptor. Records executed SQL before the database
/// handles it, never private values or production query parameters.
/// </summary>
internal sealed class PortalHistorySqlCapture : DbCommandInterceptor
{
    private readonly ConcurrentQueue<string> _commands = new();

    public override ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(
        DbCommand command, CommandEventData eventData,
        InterceptionResult<DbDataReader> result,
        CancellationToken cancellationToken = default)
    {
        _commands.Enqueue(command.CommandText);
        return base.ReaderExecutingAsync(command, eventData, result, cancellationToken);
    }

    public string LatestPagedQuery() =>
        _commands.Last(sql =>
            sql.Contains("ORDER BY", StringComparison.OrdinalIgnoreCase) &&
            sql.Contains("LIMIT", StringComparison.OrdinalIgnoreCase));

    public void Clear()
    {
        while (_commands.TryDequeue(out _)) { }
    }
}
