using System.Reflection;
using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Vuxo.Api.Auth;
using Vuxo.Api.Contracts.Auth;
using Vuxo.Api.Contracts.Players;
using Vuxo.Api.Realtime;
using Vuxo.Application.Players;
using Vuxo.Domain.Players;
using Vuxo.Infrastructure;
using Vuxo.Infrastructure.Persistence;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddOpenApi();
builder.Services.AddHealthChecks();
builder.Services.AddVuxoInfrastructure(builder.Configuration);
builder.Services.AddScoped<CharacterService>();
builder.Services.AddSingleton<MockTokenService>();

var signingKey = builder.Configuration["Auth:Jwt:SigningKey"];
if (string.IsNullOrWhiteSpace(signingKey) || signingKey.Length < 32)
{
    throw new InvalidOperationException("Auth:Jwt:SigningKey must be provided via configuration and contain at least 32 characters.");
}

builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = builder.Configuration["Auth:Jwt:Issuer"],
            ValidateAudience = true,
            ValidAudience = builder.Configuration["Auth:Jwt:Audience"],
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(signingKey)),
            NameClaimType = ClaimTypes.Name,
            RoleClaimType = ClaimTypes.Role
        };

        options.Events = new JwtBearerEvents
        {
            OnMessageReceived = context =>
            {
                var accessToken = context.Request.Query["access_token"];
                if (!string.IsNullOrEmpty(accessToken) && context.HttpContext.Request.Path.StartsWithSegments("/hubs/world"))
                {
                    context.Token = accessToken;
                }

                return Task.CompletedTask;
            }
        };
    });

builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("GameMaster", policy => policy.RequireRole("GameMaster", "Administrator"));
    options.AddPolicy("Administrator", policy => policy.RequireRole("Administrator"));
});

var origins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [];
builder.Services.AddCors(options =>
{
    options.AddPolicy("web", policy =>
    {
        if (origins.Length > 0)
        {
            policy.WithOrigins(origins).AllowAnyHeader().AllowAnyMethod().AllowCredentials();
        }
    });
});

var signalR = builder.Services.AddSignalR();
var redisConnection = builder.Configuration["Redis:ConnectionString"];
if (!string.IsNullOrWhiteSpace(redisConnection))
{
    signalR.AddStackExchangeRedis(redisConnection);
}

var app = builder.Build();

if (app.Configuration.GetValue("Database:ApplyMigrationsOnStartup", true))
{
    await using var scope = app.Services.CreateAsyncScope();
    var db = scope.ServiceProvider.GetRequiredService<VuxoDbContext>();
    await db.Database.MigrateAsync();
}

app.UseCors("web");
app.UseAuthentication();
app.UseAuthorization();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.MapHealthChecks("/health");
app.MapGet("/api/meta/version", (IConfiguration configuration) => Results.Ok(new
{
    application = "Vuxo",
    version = Assembly.GetExecutingAssembly().GetName().Version?.ToString() ?? "0.0.0",
    informationalVersion = Assembly.GetExecutingAssembly().GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion,
    commit = configuration["Build:CommitSha"] ?? "local",
    buildDateUtc = configuration["Build:BuildDateUtc"],
    environment = app.Environment.EnvironmentName
}));

app.MapPost("/api/auth/mock", (MockLoginRequest request, IConfiguration configuration, MockTokenService tokens) =>
{
    if (!configuration.GetValue("Auth:EnableMockLogin", false))
    {
        return Results.NotFound();
    }

    return Results.Ok(new { accessToken = tokens.CreateToken(request.Subject, request.DisplayName, request.Role) });
});

app.MapPost("/api/characters", async (CreateCharacterRequest request, ClaimsPrincipal user, CharacterService service, CancellationToken cancellationToken) =>
{
    var ownerId = user.FindFirstValue(ClaimTypes.NameIdentifier);
    if (string.IsNullOrWhiteSpace(ownerId))
    {
        return Results.Unauthorized();
    }

    var appearance = new CharacterAppearance(
        request.Appearance.HairStyle,
        request.Appearance.HairColor,
        request.Appearance.Face,
        request.Appearance.BodyType,
        request.Appearance.SkinTone,
        request.Appearance.TopColor,
        request.Appearance.BottomStyle,
        request.Appearance.BottomColor,
        request.Appearance.ShoeStyle,
        request.Appearance.ShoeColor);

    var command = new CreateCharacterCommand(
        ownerId,
        request.Name,
        request.Strength,
        request.Dexterity,
        request.Intelligence,
        request.Constitution,
        request.Luck,
        request.Faith,
        appearance);

    var character = await service.CreateAsync(command, cancellationToken);
    return Results.Created($"/api/characters/{character.Id}", new
    {
        character.Id,
        character.Name,
        character.Level,
        character.Attributes,
        character.Appearance,
        character.Attributes.MaxHealth,
        character.Attributes.MovementSpeedMultiplier
    });
}).RequireAuthorization();

app.MapHub<WorldHub>("/hubs/world");

await app.RunAsync();

public partial class Program;
