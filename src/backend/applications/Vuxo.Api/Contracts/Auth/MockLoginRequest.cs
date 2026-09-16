namespace Vuxo.Api.Contracts.Auth;

public sealed record MockLoginRequest(string Subject, string DisplayName, string Role);
