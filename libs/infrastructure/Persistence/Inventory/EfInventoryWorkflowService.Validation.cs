using System.IO.Compression;
using System.Text;
using System.Xml.Linq;
using System.Globalization;
using Microsoft.EntityFrameworkCore;
using Patrol360.Application;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Persistence.Entities;

namespace Patrol360.Infrastructure.Persistence;

internal sealed partial class EfInventoryWorkflowService
{

    private InventoryCommandResult<InventoryPpeCardLineDto>? ValidatePpeLine(UpsertInventoryPpeCardLineDto request)
    {
        if (request.Quantity <= 0)
        {
            return Failure<InventoryPpeCardLineDto>("quantity", "Quantity must be greater than zero");
        }

        if (!dbContext.InventoryItems.Any(row => row.Id == request.ItemId))
        {
            return Failure<InventoryPpeCardLineDto>("itemId", "Item not found");
        }

        if (IsPpeSectionTitle(request.PrintItemName) && IsPpeSignatureLineStatus(NormalizePpeStatus(request.Status)))
        {
            return Failure<InventoryPpeCardLineDto>("status", "PPE section title cannot be issued.");
        }

        if (request.WarehouseId is not null && !dbContext.InventoryWarehouses.Any(row => row.Id == request.WarehouseId.Value))
        {
            return Failure<InventoryPpeCardLineDto>("warehouseId", "Warehouse not found");
        }

        if (request.UnitPriceMinor is < 0)
        {
            return Failure<InventoryPpeCardLineDto>("unitPriceMinor", "Unit price cannot be negative");
        }

        return null;
    }

    private static void ApplyPpeEmployeeDetails(InventoryPpeCardEntity card, InventoryPpeEmployeeDetailsDto? details)
    {
        card.Gender = NormalizePrintField(details?.Gender, string.Empty, 40);
        card.Height = NormalizePrintField(details?.Height, string.Empty, 40);
        card.ClothingSize = NormalizePrintField(details?.ClothingSize, string.Empty, 80);
        card.ShoeSize = NormalizePrintField(details?.ShoeSize, string.Empty, 80);
        card.HeadSize = NormalizePrintField(details?.HeadSize, string.Empty, 80);
        card.RespiratorSize = NormalizePrintField(details?.RespiratorSize, string.Empty, 120);
        card.HandProtectionSize = NormalizePrintField(details?.HandProtectionSize, string.Empty, 120);
    }

    private long? NormalizeUnitPriceMinor(long? requestedPrice, Guid itemId)
    {
        if (requestedPrice is not null)
        {
            return requestedPrice.Value;
        }

        return dbContext.InventoryItems
            .Where(row => row.Id == itemId)
            .Select(row => row.DefaultUnitPriceMinor)
            .FirstOrDefault();
    }

    private InventoryCommandResult<InventoryPpeCardLineDto>? ValidatePpeStatusStockTransition(
        InventoryPpeCardLineEntity line,
        string oldStatus,
        string nextStatus)
        => null;

    private static string NormalizePrintField(string? value, string? fallback, int maxLength)
    {
        var normalized = NormalizeOptional(value);
        if (normalized.Length == 0)
        {
            normalized = NormalizeOptional(fallback);
        }

        return normalized.Length <= maxLength ? normalized : normalized[..maxLength];
    }

    private static string DefaultIssuePeriodText(int? lifeMonths) => lifeMonths switch
    {
        6 => "0,5 года",
        12 => "1 год",
        18 => "1,5 года",
        24 => "2 года",
        30 => "2,5 года",
        36 => "3 года",
        > 0 => $"на {lifeMonths.Value} мес.",
        _ => "по сроку носки"
    };

    private static string PpeModelDescription(InventoryItemEntity item) =>
        string.Join(" / ", new[] { item.BrandName, item.ModelName, item.Article, item.ProtectionClass }.Where(part => !string.IsNullOrWhiteSpace(part)));

    private static bool IsPpeSectionTitle(string? printItemName) =>
        !string.IsNullOrWhiteSpace(printItemName) &&
        printItemName.Trim().EndsWith(':');

    private static string NormalizePpeStatus(string? status)
    {
        return PpeIssueStatusCatalog.NormalizeCode(status);
    }

    private static bool IsAllowedPpeLineStatusTransition(string oldStatus, string nextStatus) =>
        PpeIssueStatusCatalog.IsAllowedTransition(oldStatus, nextStatus);

    private static bool IsPpeSignatureLineStatus(string status) =>
        PpeIssueStatusCatalog.IsSignatureStatus(status);
}
