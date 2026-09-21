using Vuxo.Domain.Narrative;

namespace Vuxo.Domain.Tests.Narrative;

public sealed class NarrativeDecisionTests
{
    [Theory]
    [InlineData("it-IT")]
    [InlineData("en-US")]
    public void Localize_PreservesCanonicalDecisionAndAuditIdentity(string locale)
    {
        var correlationId = Guid.NewGuid();
        var causationId = Guid.NewGuid();
        var decision = NarrativeDecision.Create(
            "quest.portal.grove.001",
            "content-v3",
            "quest-rule-v7",
            "canonical-payload",
            "reward-grove-token",
            "condition-portal-completed",
            correlationId,
            causationId);

        var render = decision.Localize(
            locale,
            "render-v2",
            locale.StartsWith("it", StringComparison.Ordinal) ? "Testo italiano" : "English text",
            new DateTimeOffset(2026, 9, 21, 12, 0, 0, TimeSpan.Zero));
        var audit = render.ToAuditMetadata();

        Assert.Equal("reward-grove-token", decision.RewardKey);
        Assert.Equal("condition-portal-completed", decision.ConditionKey);
        Assert.Equal("quest-rule-v7", decision.RuleVersion);
        Assert.Equal(decision.ContentId, render.ContentId);
        Assert.Equal(decision.CanonicalVersion, render.CanonicalVersion);
        Assert.Equal(decision.RuleVersion, render.RuleVersion);
        Assert.Equal(correlationId, audit.CorrelationId);
        Assert.Equal(causationId, audit.CausationId);
        Assert.Equal("render-v2", audit.RenderVersion);
        Assert.Equal(CultureName(locale), audit.Locale);
    }

    [Fact]
    public void Localize_InvalidLocale_ThrowsWithoutChangingDecision()
    {
        var decision = NarrativeDecision.Create(
            "dialogue.npc.001",
            "content-v1",
            "dialogue-rule-v1",
            "canonical-payload",
            "reward-none",
            "condition-none",
            Guid.NewGuid());

        Assert.Throws<ArgumentException>(() =>
            decision.Localize("not_a_locale_@@", "render-v1", "text", DateTimeOffset.UtcNow));

        Assert.Equal("dialogue-rule-v1", decision.RuleVersion);
        Assert.Equal("reward-none", decision.RewardKey);
    }

    private static string CultureName(string locale) =>
        System.Globalization.CultureInfo.GetCultureInfo(locale).Name;
}
