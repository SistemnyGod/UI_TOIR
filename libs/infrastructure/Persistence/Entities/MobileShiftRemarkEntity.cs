namespace Patrol360.Infrastructure.Persistence.Entities;

internal sealed class MobileShiftRemarkEntity
{
    public Guid Id { get; set; }

    public Guid MobileAccountId { get; set; }

    public MobileAccountEntity? MobileAccount { get; set; }

    public Guid EmployeeId { get; set; }

    public EmployeeEntity? Employee { get; set; }

    public Guid SectionId { get; set; }

    public EmuWorkSectionEntity? Section { get; set; }

    public string Title { get; set; } = string.Empty;

    public string Comment { get; set; } = string.Empty;

    public string MediaClientFileIdsJson { get; set; } = "[]";

    public DateTimeOffset CreatedAtLocal { get; set; }

    public DateTimeOffset CreatedAtServer { get; set; }

    public string Status { get; set; } = "accepted";
}
