using Patrol360.Application;
using Patrol360.Contracts;

namespace Patrol360.Api.Authorization;

internal static class PpeIssuancePolicy
{
    internal static (bool Ready, int Count, int Total) Readiness(IInventoryWorkflowService? norms, IConfiguration configuration)
    {
        if (norms is null) return (false, 0, 0);
        var first = norms.GetPpeNormSets(new InventoryListQuery(PageSize: 100));
        var all = first.Rows.ToList();
        for (var page = 2; page <= first.PageCount; page++)
            all.AddRange(norms.GetPpeNormSets(new InventoryListQuery(Page: page, PageSize: 100)).Rows);
        var current = all.Where(x => x.Status != "archived").ToList();
        var ready = current.Count(x => x.Status == "active" && !x.RequiresReview && x.Readiness?.IsReady == true);
        var required = Math.Max(1, configuration.GetValue<int?>("Features:PpeMinimumReadyNormSets") ?? 34);
        return (ready >= required && ready == current.Count, ready, current.Count);
    }
}
