using System.Reflection;
using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.RateLimiting;
using System.Threading.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Vuxo.Api.Admin;
using Vuxo.Api.Auth;
using Vuxo.Api.Contracts.Auth;
using Vuxo.Api.Contracts.Players;
using Vuxo.Api.Observability;
using Vuxo.Api.PersonalContent;
using Vuxo.Api.Realtime;
using Vuxo.Api.Worlds;
using Vuxo.Application.AI;
using Vuxo.Application.Events;
using Vuxo.Application.Inventory;
using Vuxo.Application.Identity;
using Vuxo.Application.PersonalContent;
using Vuxo.Application.Players;
using Vuxo.Application.Worlds;
using Vuxo.Application.Worlds.Realtime;
using Vuxo.Domain.Players;
using Vuxo.Domain.Worlds;
using Vuxo.Infrastructure;
using Vuxo.Infrastructure.Persistence;

var builder = WebApplication.CreateBuilder(args);
builder.AddVuxoObservability();

builder.Services.AddOpenApi();
builder.Services.AddHealthChecks();
builder.Services.AddVuxoInfrastructure(builder.Configuration);
builder.Services.AddScoped<CharacterService>();
builder.Services.AddScoped<CharacterRestService>();
builder.Services.AddScoped<CharacterHealingService>();
builder.Services.AddScoped<LanguageModelSmokeService>();
builder.Services.AddSingleton<ILanguageModelToolHandler, GetWorldContextTool>();
builder.Services.AddSingleton<LanguageModelToolRegistry>();
builder.Services.AddScoped<LanguageModelOrchestrator>();
builder.Services.AddSingleton(provider =>
{
    var configuration = provider.GetRequiredService<IConfiguration>();
    var configuredMaxRounds = configuration.GetValue<int?>("Llm:MaxToolRounds") ?? 2;
    return LanguageModelOrchestrationOptions.Create(configuredMaxRounds);
});
builder.Services.AddScoped<WorldService>();
builder.Services.AddScoped<ExclusiveContentService>();
builder.Services.AddScoped<PlayerEquipmentService>();
builder.Services.AddScoped<WorldPortalService>();
builder.Services.AddScoped<PortalMistakeDamageService>();
builder.Services.AddScoped<PortalEncounterService>();
builder.Services.AddScoped<GameEventAuditService>();
builder.Services.AddSingleton<WorldChunkGenerator>();
builder.Services.AddSingleton<TimeProvider>(TimeProvider.System);
builder.Services.AddSingleton(provider =>
{
    var configuration = provider.GetRequiredService<IConfiguration>();
    var worldId = configuration["World:Id"] ?? "vuxo-prime";
    var seed = configuration.GetValue<long?>("World:Seed") ?? 9_162_026_001L;
    var generatorVersion = configuration.GetValue<int?>("World:GeneratorVersion")
        ?? WorldGenerationRules.CurrentGeneratorVersion;
    return new WorldBootstrapSpec(worldId, seed, generatorVersion);
});
builder.Services.AddSingleton<WorldSimulation>();
builder.Services.AddSingleton<WorldRuntimeMap>();
builder.Services.AddSingleton<IWorldPortalMap>(serviceProvider =>
    serviceProvider.GetRequiredService<WorldRuntimeMap>());
builder.Services.AddHostedService<WorldSimulationTicker>();
builder.Services.AddSingleton<MockTokenService>();
builder.Services.AddSingleton<VuxoTokenService>();
builder.Services.AddSingleton<ISocialIdentityVerifier, OidcSocialIdentityVerifier>();
builder.Services.AddScoped<SocialAuthenticationService>();
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddPolicy("auth-social", httpContext =>
        RateLimitPartition.GetFixedWindowLimiter(
            httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 10,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0,
                AutoReplenishment = true
            }));
    options.AddPolicy("portal-challenge", httpContext =>
        RateLimitPartition.GetFixedWindowLimiter(
            httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 12,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0,
                AutoReplenishment = true
            }));
});

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
app.UseRateLimiter();
app.UseAuthentication();
app.UseMiddleware<TelemetryContextMiddleware>();
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

app.MapSocialAuthEndpoints();

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
            character.CurrentHealth,
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

// Read-only until a transactional, audited healing/damage flow is implemented.
// The authenticated principal, never a client-supplied player ID, owns this view.
app.MapGet("/api/characters/me/health", async (ClaimsPrincipal user, IPlayerCharacterRepository characters, CancellationToken cancellationToken) =>
{
    var ownerId = user.FindFirstValue(ClaimTypes.NameIdentifier);
    if (string.IsNullOrWhiteSpace(ownerId)) return Results.Unauthorized();

    var character = await characters.GetByOwnerIdAsync(ownerId, cancellationToken);
    return character is null
        ? Results.NotFound(new { code = "character_not_found" })
        : Results.Ok(new
        {
            character.Name,
            character.CurrentHealth,
            character.MaxHealth,
            rulesVersion = PlayerHealth.RulesVersion
        });
}).RequireAuthorization();

// A rest request is an intention only: the server decides timing, amount,
// ownership, HP updates and idempotency in a single PostgreSQL transaction.
app.MapGet("/api/characters/me/encounter", async (
    ClaimsPrincipal user, PortalEncounterService service, CancellationToken cancellationToken) =>
{
    var ownerId = user.FindFirstValue(ClaimTypes.NameIdentifier);
    if (string.IsNullOrWhiteSpace(ownerId)) return Results.Unauthorized();
    return Results.Ok(await service.GetStatusAsync(ownerId, cancellationToken));
}).RequireAuthorization();

// No public encounter start/finish API: world portal proximity is validated
// server-side in WorldPortalService before the encounter is opened.
app.MapPost("/api/characters/me/rest", async (
    HttpRequest request,
    ClaimsPrincipal user,
    CharacterRestService service,
    CancellationToken cancellationToken) =>
{
    var ownerId = user.FindFirstValue(ClaimTypes.NameIdentifier);
    if (string.IsNullOrWhiteSpace(ownerId)) return Results.Unauthorized();

    if (!Guid.TryParse(request.Headers["Idempotency-Key"].ToString(), out var key)
        || key == Guid.Empty)
        return Results.BadRequest(new { code = CharacterRestErrorCodes.InvalidIdempotencyKey });

    try
    {
        return Results.Ok(await service.RestAsync(ownerId, key, cancellationToken));
    }
    catch (CharacterRestException exception)
        when (exception.Code == CharacterRestErrorCodes.CharacterNotFound)
    {
        return Results.NotFound(new { code = exception.Code });
    }
    catch (CharacterRestException exception)
    {
        return Results.Conflict(new
        {
            code = exception.Code,
            nextAllowedAtUtc = exception.NextAllowedAtUtc
        });
    }
}).RequireAuthorization();


// Server-authoritative healing: only a previously awarded, unspent, unequipped
// Grove Seed can be consumed. No client-provided HP amount is ever accepted.
app.MapPost("/api/characters/me/heal/{grantId:guid}", async (
    Guid grantId, HttpRequest request, ClaimsPrincipal user,
    CharacterHealingService service, CancellationToken cancellationToken) =>
{
    var ownerId = user.FindFirstValue(ClaimTypes.NameIdentifier);
    if (string.IsNullOrWhiteSpace(ownerId)) return Results.Unauthorized();
    if (!Guid.TryParse(request.Headers["Idempotency-Key"].ToString(), out var key)
        || key == Guid.Empty)
        return Results.BadRequest(new { code = CharacterHealingErrorCodes.InvalidKey });

    try
    {
        return Results.Ok(await service.HealAsync(ownerId, grantId, key, cancellationToken));
    }
    catch (CharacterHealingException exception) when (
        exception.Code is CharacterHealingErrorCodes.CharacterNotFound
            or CharacterHealingErrorCodes.ItemNotOwned)
    {
        return Results.NotFound(new { code = exception.Code });
    }
    catch (CharacterHealingException exception)
    {
        return Results.Conflict(new { code = exception.Code });
    }
    catch (DbUpdateException)
    {
        // Concurrent equip/consume or a failed constraint is not a successful
        // heal; translate DB exceptions to a stable, non-revealing API code.
        return Results.Conflict(new { code = "heal_conflict" });
    }
}).RequireAuthorization();

app.MapWorldEndpoints();
app.MapPersonalContentEndpoints();
app.MapAuditEndpoints();

app.MapGet("/health/llm", async (ILanguageModelHealthProbe healthProbe, CancellationToken cancellationToken) =>
{
    var status = await healthProbe.ProbeAsync(cancellationToken);
    if (!status.Enabled)
    {
        return Results.Ok(status);
    }

    return status.Healthy
        ? Results.Ok(status)
        : Results.Json(status, statusCode: StatusCodes.Status503ServiceUnavailable);
});

app.MapGet("/api/admin/llm/tool-smoke", async (
    ClaimsPrincipal user,
    ILanguageModelGateway gateway,
    LanguageModelSmokeService smoke,
    CancellationToken cancellationToken) =>
{
    if (!gateway.IsEnabled)
    {
        return Results.Json(new { code = "llm_disabled" }, statusCode: StatusCodes.Status503ServiceUnavailable);
    }

    var actorId = user.FindFirstValue(ClaimTypes.NameIdentifier);
    if (string.IsNullOrWhiteSpace(actorId))
    {
        return Results.Unauthorized();
    }

    try
    {
        var result = await smoke.RunAsync(
            actorId,
            user.IsInRole("Administrator"),
            cancellationToken);

        return result.ToolExecuted
            ? Results.Ok(result)
            : Results.Json(
                new { code = "llm_tool_not_executed", result },
                statusCode: StatusCodes.Status502BadGateway);
    }
    catch (LanguageModelToolException exception)
    {
        return Results.BadRequest(new { code = exception.Code });
    }
    catch (LanguageModelProtocolException exception)
    {
        return Results.Json(
            new { code = exception.Code },
            statusCode: StatusCodes.Status502BadGateway);
    }
    catch (LanguageModelCircuitOpenException)
    {
        return Results.Json(
            new { code = "llm_circuit_open" },
            statusCode: StatusCodes.Status503ServiceUnavailable);
    }
    catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
    {
        return Results.Json(
            new { code = "llm_timeout" },
            statusCode: StatusCodes.Status504GatewayTimeout);
    }
    catch (HttpRequestException)
    {
        return Results.Json(
            new { code = "llm_unavailable" },
            statusCode: StatusCodes.Status503ServiceUnavailable);
    }
}).RequireAuthorization("Administrator");

app.MapHub<WorldHub>("/hubs/world");

await app.RunAsync();

public partial class Program;
