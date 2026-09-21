namespace Vuxo.Api.Contracts.Auth;

public sealed record SocialLoginRequest(string Provider, string Credential);
