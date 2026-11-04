namespace Vuxo.Application.PersonalContent;

public static class ExclusiveContentErrorCodes
{
    public const string NotFound = "exclusive_content_not_found";
    public const string Expired = "exclusive_content_expired";
    public const string Consumed = "exclusive_content_consumed";
    public const string ChallengeRequired = "portal_challenge_required";
    public const string ChallengeNotAvailable = "portal_challenge_not_available";
    public const string ChallengeInvalidAnswer = "portal_challenge_invalid_answer";
    public const string ChallengeIncorrect = "portal_challenge_incorrect";
    public const string WorldPortalNotJoined = "world_portal_not_joined";
    public const string WorldPortalTooFar = "world_portal_too_far";
}

public sealed class ExclusiveContentException(string code) : InvalidOperationException(code)
{
    public string Code { get; } = code;
}
