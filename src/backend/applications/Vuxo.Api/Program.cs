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
using Vuxo.Application.AI;
using Vuxo.Application.Players;
using Vuxo.Domain.Players;
using Vuxo.Infrastructure;
using Vuxo.Infrastructure.Persistence;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddOpenApi();
builder.Services.AddHealthChecks();
builder.Services.AddVuxoInfrastructure(builder.Configuration);
builder.Services.AddScoped<CharacterService>();
builder.Services.AddScoped<LanguageModelSmokeService>();
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
                var accessToken = SignalRAccessTokenResolver.Resolve(context.Request);
                if (accessToken is not null)
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

app.MapGet("/api/meta/character-appearance", () => Results.Ok(new
{
    catalogVersion = CharacterAppearanceCatalog.Version,
    hairStyles = CharacterAppearanceCatalog.HairStyles,
    hairColors = CharacterAppearanceCatalog.HairColors,
    faces = CharacterAppearanceCatalog.Faces,
    bodyTypes = CharacterAppearanceCatalog.BodyTypes,
    skinTones = CharacterAppearanceCatalog.SkinTones,
    topColors = CharacterAppearanceCatalog.TopColors,
    bottomStyles = CharacterAppearanceCatalog.BottomStyles,
    bottomColors = CharacterAppearanceCatalog.BottomColors,
    shoeStyles = CharacterAppearanceCatalog.ShoeStyles,
    shoeColors = CharacterAppearanceCatalog.ShoeColors
}));

if (MockAuthentication.IsEnabled(app.Environment, app.Configuration))
{
    app.MapPost("/api/auth/mock", (MockLoginRequest request, MockTokenService tokens) =>
    {
        var validationError = MockAuthentication.Validate(request);
        if (validationError is not null)
        {
            return Results.BadRequest(new { code = validationError });
        }

        return Results.Ok(new
        {
            accessToken = tokens.CreateToken(request.Subject, request.DisplayName, request.Role),
            tokenType = "Bearer"
        });
    });
}

app.MapPost("/api/characters", async (CreateCharacterRequest request, ClaimsPrincipal user, CharacterService service, CancellationToken cancellationToken) =>
{
    var ownerId = user.FindFirstValue(ClaimTypes.NameIdentifier);
    if (string.IsNullOrWhiteSpace(ownerId))
    {
        return Results.Unauthorized();
    }

    if (request.Appearance is null)
    {
        return Results.BadRequest(new { code = "character_appearance_required" });
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

    var invalidAppearanceField = CharacterAppearanceCatalog.FindInvalidField(appearance);
    if (invalidAppearanceField is not null)
    {
        return Results.BadRequest(new
        {
            code = "character_appearance_option_invalid",
            field = invalidAppearanceField
        });
    }

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

    try
    {
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
    }
    catch (CharacterCreationException exception) when (exception.Code == CharacterCreationErrorCodes.AlreadyExists)
    {
        return Results.Conflict(new { code = exception.Code });
    }
    catch (CharacterCreationException exception)
    {
        return Results.BadRequest(new { code = exception.Code });
    }
}).RequireAuthorization();

app.MapGet("/api/admin/llm/tool-smoke", async (ILanguageModelGateway gateway, LanguageModelSmokeService smoke, CancellationToken cancellationToken) =>
{
    if (!gateway.IsEnabled)
    {
        return Results.Json(new { code = "llm_disabled" }, statusCode: StatusCodes.Status503ServiceUnavailable);
    }

    try
    {
        var result = await smoke.RunAsync(cancellationToken);
        return result.ToolCallObserved
            ? Results.Ok(result)
            : Results.Json(new { code = "llm_tool_call_not_observed", result }, statusCode: StatusCodes.Status502BadGateway);
    }
    catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
    {
        return Results.Json(new { code = "llm_timeout" }, statusCode: StatusCodes.Status504GatewayTimeout);
    }
    catch (HttpRequestException)
    {
        return Results.Json(new { code = "llm_unavailable" }, statusCode: StatusCodes.Status503ServiceUnavailable);
    }
}).RequireAuthorization("Administrator");

app.MapHub<WorldHub>("/hubs/world");

await app.RunAsync();

public partial class Program;
