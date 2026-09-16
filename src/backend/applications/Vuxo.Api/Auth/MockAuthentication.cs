using Vuxo.Api.Contracts.Auth;

namespace Vuxo.Api.Auth;

public static class MockAuthentication
{
    private static readonly HashSet<string> AllowedRoles = new(StringComparer.Ordinal)
    {
        "User",
        "GameMaster",
        "Administrator"
    };

    public static bool IsEnabled(IHostEnvironment environment, IConfiguration configuration)
    {
        var allowedEnvironment = environment.IsDevelopment() || environment.IsEnvironment("Test");
        return allowedEnvironment && configuration.GetValue("Auth:EnableMockLogin", false);
    }

    public static string? Validate(MockLoginRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Subject))
        {
            return "mock_subject_required";
        }

        if (string.IsNullOrWhiteSpace(request.DisplayName))
        {
            return "mock_display_name_required";
        }

        if (!IsAllowedRole(request.Role))
        {
            return "mock_role_invalid";
        }

        return null;
    }

    public static bool IsAllowedRole(string role) => AllowedRoles.Contains(role);
}
