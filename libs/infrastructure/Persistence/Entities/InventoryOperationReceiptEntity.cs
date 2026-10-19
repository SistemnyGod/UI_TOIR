namespace Patrol360.Infrastructure.Persistence.Entities;

internal sealed class InventoryOperationReceiptEntity
{
    public Guid Id { get; set; }
    public Guid? AuthorUserId { get; set; }
    public string PayloadHash { get; set; } = string.Empty;
    public string ResponseJson { get; set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; set; }
}
