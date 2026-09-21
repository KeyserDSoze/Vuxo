namespace Vuxo.Domain.Identity;

public sealed class VuxoUser
{
    private VuxoUser(
        Guid id,
        string displayName,
        string? email,
        DateTimeOffset createdAtUtc,
        DateTimeOffset lastLoginAtUtc)
    {
        Id = id;
        DisplayName = NormalizeDisplayName(displayName);
        Email = NormalizeEmail(email);
        CreatedAtUtc = createdAtUtc;
        LastLoginAtUtc = lastLoginAtUtc;
    }

    public Guid Id { get; }
    public string DisplayName { get; private set; }
    public string? Email { get; private set; }
    public DateTimeOffset CreatedAtUtc { get; }
    public DateTimeOffset LastLoginAtUtc { get; private set; }

    public static VuxoUser Create(string displayName, string? email, DateTimeOffset now) =>
        new(Guid.NewGuid(), displayName, email, now, now);

    public static VuxoUser Rehydrate(
        Guid id,
        string displayName,
        string? email,
        DateTimeOffset createdAtUtc,
        DateTimeOffset lastLoginAtUtc) =>
        new(id, displayName, email, createdAtUtc, lastLoginAtUtc);

    public void RecordLogin(string displayName, string? email, DateTimeOffset now)
    {
        DisplayName = NormalizeDisplayName(displayName);
        Email = NormalizeEmail(email);
        LastLoginAtUtc = now;
    }

    private static string NormalizeDisplayName(string value)
    {
        var normalized = string.IsNullOrWhiteSpace(value) ? "Vuxo Player" : value.Trim();
        return normalized.Length <= 200 ? normalized : normalized[..200];
    }

    private static string? NormalizeEmail(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var normalized = value.Trim();
        return normalized.Length <= 320 ? normalized : null;
    }
}
