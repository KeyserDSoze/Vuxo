using System.Globalization;

namespace Vuxo.Domain.Narrative;

public readonly record struct NarrativeContentId
{
    private NarrativeContentId(string value) => Value = value;

    public string Value { get; }

    public static NarrativeContentId Parse(string value)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(value);
        var normalized = value.Trim();
        if (normalized.Length > 200)
        {
            throw new ArgumentOutOfRangeException(nameof(value), "Narrative content id cannot exceed 200 characters.");
        }

        return new NarrativeContentId(normalized);
    }

    public override string ToString() => Value;
}

public sealed class NarrativeDecision
{
    private NarrativeDecision(
        NarrativeContentId contentId,
        string canonicalVersion,
        string ruleVersion,
        string canonicalPayload,
        string rewardKey,
        string conditionKey,
        Guid correlationId,
        Guid? causationId)
    {
        ContentId = contentId;
        CanonicalVersion = canonicalVersion;
        RuleVersion = ruleVersion;
        CanonicalPayload = canonicalPayload;
        RewardKey = rewardKey;
        ConditionKey = conditionKey;
        CorrelationId = correlationId;
        CausationId = causationId;
    }

    public NarrativeContentId ContentId { get; }
    public string CanonicalVersion { get; }
    public string RuleVersion { get; }
    public string CanonicalPayload { get; }
    public string RewardKey { get; }
    public string ConditionKey { get; }
    public Guid CorrelationId { get; }
    public Guid? CausationId { get; }

    public static NarrativeDecision Create(
        string contentId,
        string canonicalVersion,
        string ruleVersion,
        string canonicalPayload,
        string rewardKey,
        string conditionKey,
        Guid correlationId,
        Guid? causationId = null)
    {
        if (correlationId == Guid.Empty)
        {
            throw new ArgumentException("Correlation id is required.", nameof(correlationId));
        }

        ArgumentException.ThrowIfNullOrWhiteSpace(canonicalVersion);
        ArgumentException.ThrowIfNullOrWhiteSpace(ruleVersion);
        ArgumentException.ThrowIfNullOrWhiteSpace(canonicalPayload);
        ArgumentException.ThrowIfNullOrWhiteSpace(rewardKey);
        ArgumentException.ThrowIfNullOrWhiteSpace(conditionKey);

        return new NarrativeDecision(
            NarrativeContentId.Parse(contentId),
            canonicalVersion.Trim(),
            ruleVersion.Trim(),
            canonicalPayload,
            rewardKey.Trim(),
            conditionKey.Trim(),
            correlationId,
            causationId);
    }

    public LocalizedNarrativeRender Localize(
        string locale,
        string renderVersion,
        string localizedText,
        DateTimeOffset renderedAtUtc)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(locale);
        ArgumentException.ThrowIfNullOrWhiteSpace(renderVersion);
        ArgumentException.ThrowIfNullOrWhiteSpace(localizedText);

        string normalizedLocale;
        try
        {
            normalizedLocale = CultureInfo.GetCultureInfo(locale.Trim()).Name;
        }
        catch (CultureNotFoundException exception)
        {
            throw new ArgumentException("Locale is invalid.", nameof(locale), exception);
        }

        return new LocalizedNarrativeRender(
            ContentId,
            CanonicalVersion,
            RuleVersion,
            normalizedLocale,
            renderVersion.Trim(),
            localizedText,
            CorrelationId,
            CausationId,
            renderedAtUtc);
    }
}

public sealed record LocalizedNarrativeRender(
    NarrativeContentId ContentId,
    string CanonicalVersion,
    string RuleVersion,
    string Locale,
    string RenderVersion,
    string Text,
    Guid CorrelationId,
    Guid? CausationId,
    DateTimeOffset RenderedAtUtc)
{
    public NarrativeRenderAuditMetadata ToAuditMetadata() =>
        new(
            ContentId,
            CanonicalVersion,
            RuleVersion,
            Locale,
            RenderVersion,
            CorrelationId,
            CausationId);
}

public sealed record NarrativeRenderAuditMetadata(
    NarrativeContentId ContentId,
    string CanonicalVersion,
    string RuleVersion,
    string Locale,
    string RenderVersion,
    Guid CorrelationId,
    Guid? CausationId);
