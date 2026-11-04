using Vuxo.Domain.PersonalContent;

namespace Vuxo.Domain.Tests.PersonalContent;

public sealed class PortalSequenceRulesTests
{
    private static readonly Guid GrantId = Guid.Parse("12345678-1234-1234-1234-123456789abc");

    [Theory]
    [InlineData(0)]
    [InlineData(42)]
    [InlineData(-42)]
    [InlineData(long.MinValue)]
    [InlineData(long.MaxValue)]
    public void Generate_IsDeterministicForSeedGrantAndRuleVersion(long seed)
    {
        var first = PortalSequenceRules.Generate(GrantId, seed, "personal-content-v1");
        var second = PortalSequenceRules.Generate(GrantId, seed, "personal-content-v1");

        Assert.Equal(PortalSequenceRules.Version, first.Version);
        Assert.Equal(PortalSequenceRules.Length, first.Sequence.Count);
        Assert.Equal(first.Sequence, second.Sequence);
        Assert.All(first.Sequence, rune => Assert.Contains(rune, PortalSequenceRules.RuneIds));
        Assert.True(PortalSequenceRules.Matches(first, first.Sequence));
    }

    [Fact]
    public void Generate_VariesWithSeedAndRules()
    {
        var sequences = Enumerable.Range(0, 24)
            .Select(seed => string.Join(",", PortalSequenceRules.Generate(GrantId, seed, "rules-v1").Sequence))
            .Distinct(StringComparer.Ordinal);
        Assert.True(sequences.Count() > 1);

        var versions = Enumerable.Range(0, 24)
            .Select(seed => PortalSequenceRules.Generate(GrantId, seed, "rules-v2"))
            .Zip(Enumerable.Range(0, 24).Select(seed => PortalSequenceRules.Generate(GrantId, seed, "rules-v1")))
            .Count(pair => !pair.First.Sequence.SequenceEqual(pair.Second.Sequence));
        Assert.True(versions > 0);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("sun")]
    public void Matches_RejectsMalformedAnswers(string? value)
    {
        var challenge = PortalSequenceRules.Generate(GrantId, 12, "rules-v1");
        Assert.False(PortalSequenceRules.Matches(challenge, value is null ? null : [value]));
        Assert.False(PortalSequenceRules.IsWellFormed(["sun", "moon", "star", "unknown"]));
        Assert.False(PortalSequenceRules.IsWellFormed(["sun", "moon", "star"]));
    }

    [Fact]
    public void Matches_RequiresTheExactOrder()
    {
        var challenge = PortalSequenceRules.Generate(GrantId, 42, "rules-v1");
        var wrong = challenge.Sequence.ToArray();
        wrong[0] = wrong[0] == "sun" ? "moon" : "sun";
        Assert.False(PortalSequenceRules.Matches(challenge, wrong));
    }

    [Fact]
    public void Generate_RejectsInvalidIdentity()
    {
        Assert.Throws<ArgumentException>(() => PortalSequenceRules.Generate(Guid.Empty, 0, "rules-v1"));
        Assert.Throws<ArgumentException>(() => PortalSequenceRules.Generate(GrantId, 0, ""));
    }
}
