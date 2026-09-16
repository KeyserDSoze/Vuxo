namespace Vuxo.Application.PersonalContent;

public static class ExclusiveContentErrorCodes
{
    public const string NotFound = "exclusive_content_not_found";
    public const string Expired = "exclusive_content_expired";
    public const string Consumed = "exclusive_content_consumed";
}

public sealed class ExclusiveContentException(string code) : InvalidOperationException(code)
{
    public string Code { get; } = code;
}
