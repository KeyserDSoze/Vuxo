namespace Vuxo.Api.Auth;

public sealed class SuperAdminPolicy
{
    private readonly HashSet<string> emails;

    public SuperAdminPolicy(IConfiguration configuration)
    {
        emails = (configuration["Auth:SuperAdminEmails"] ?? string.Empty)
            .Split([',', ';', ' '], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(x => x.ToLowerInvariant())
            .ToHashSet(StringComparer.Ordinal);
    }

    public bool IsSuperAdmin(string? verifiedEmail) =>
        !string.IsNullOrWhiteSpace(verifiedEmail)
        && emails.Contains(verifiedEmail.Trim().ToLowerInvariant());
}
