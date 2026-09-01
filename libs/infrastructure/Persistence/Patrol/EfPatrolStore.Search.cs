namespace Patrol360.Infrastructure.Persistence;

internal sealed partial class EfPatrolStore
{
    private static string ToLikeContainsPattern(string value) =>
        $"%{value.Trim().ToLowerInvariant()
            .Replace("\\", "\\\\", StringComparison.Ordinal)
            .Replace("%", "\\%", StringComparison.Ordinal)
            .Replace("_", "\\_", StringComparison.Ordinal)}%";
}
