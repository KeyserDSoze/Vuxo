using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.IdentityModel.Tokens;

namespace Vuxo.Api.Auth;

public sealed class MockTokenService(IConfiguration configuration)
{
    public string CreateToken(string subject, string displayName, string role)
    {
        var signingKey = configuration["Auth:Jwt:SigningKey"];
        if (string.IsNullOrWhiteSpace(signingKey) || signingKey.Length < 32)
        {
            throw new InvalidOperationException("Auth:Jwt:SigningKey must contain at least 32 characters.");
        }

        var allowedRoles = new[] { "User", "GameMaster", "Administrator" };
        if (!allowedRoles.Contains(role, StringComparer.Ordinal))
        {
            throw new ArgumentOutOfRangeException(nameof(role), "Unsupported mock role.");
        }

        var claims = new[]
        {
            new Claim(JwtRegisteredClaimNames.Sub, subject),
            new Claim(ClaimTypes.NameIdentifier, subject),
            new Claim(ClaimTypes.Name, displayName),
            new Claim(ClaimTypes.Role, role)
        };

        var credentials = new SigningCredentials(
            new SymmetricSecurityKey(Encoding.UTF8.GetBytes(signingKey)),
            SecurityAlgorithms.HmacSha256);

        var token = new JwtSecurityToken(
            issuer: configuration["Auth:Jwt:Issuer"],
            audience: configuration["Auth:Jwt:Audience"],
            claims: claims,
            expires: DateTime.UtcNow.AddHours(8),
            signingCredentials: credentials);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}
