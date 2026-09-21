using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.IdentityModel.Tokens;

namespace Vuxo.Api.Auth;

public sealed record VuxoAccessToken(string AccessToken, DateTimeOffset ExpiresAtUtc);

public sealed class VuxoTokenService(IConfiguration configuration, TimeProvider timeProvider)
{
    public VuxoAccessToken CreateUserToken(Guid userId, string displayName)
    {
        if (userId == Guid.Empty)
        {
            throw new ArgumentException("User ID is required.", nameof(userId));
        }

        var signingKey = configuration["Auth:Jwt:SigningKey"];
        if (string.IsNullOrWhiteSpace(signingKey) || signingKey.Length < 32)
        {
            throw new InvalidOperationException("Auth:Jwt:SigningKey must contain at least 32 characters.");
        }

        var lifetimeMinutes = Math.Clamp(
            configuration.GetValue<int?>("Auth:Jwt:LifetimeMinutes") ?? 480,
            5,
            1440);
        var now = timeProvider.GetUtcNow();
        var expiresAtUtc = now.AddMinutes(lifetimeMinutes);

        var claims = new[]
        {
            new Claim(JwtRegisteredClaimNames.Sub, userId.ToString("D")),
            new Claim(ClaimTypes.NameIdentifier, userId.ToString("D")),
            new Claim(ClaimTypes.Name, displayName),
            new Claim(ClaimTypes.Role, "User")
        };

        var credentials = new SigningCredentials(
            new SymmetricSecurityKey(Encoding.UTF8.GetBytes(signingKey)),
            SecurityAlgorithms.HmacSha256);

        var token = new JwtSecurityToken(
            issuer: configuration["Auth:Jwt:Issuer"],
            audience: configuration["Auth:Jwt:Audience"],
            claims: claims,
            notBefore: now.UtcDateTime,
            expires: expiresAtUtc.UtcDateTime,
            signingCredentials: credentials);

        return new VuxoAccessToken(
            new JwtSecurityTokenHandler().WriteToken(token),
            expiresAtUtc);
    }
}
