namespace Vuxo.Application.Players;

public sealed class CharacterCreationException(string code, string message) : Exception(message)
{
    public string Code { get; } = code;
}

public static class CharacterCreationErrorCodes
{
    public const string AlreadyExists = "character_already_exists";
    public const string NameRequired = "character_name_required";
    public const string NameLengthInvalid = "character_name_length_invalid";
    public const string AttributesNegative = "character_attributes_negative";
    public const string AttributeAllocationInvalid = "character_attribute_allocation_invalid";
}
