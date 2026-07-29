namespace Patrol360.Infrastructure.Persistence.Entities;

internal sealed class EmuShiftReportEntity
{
    public Guid Id { get; set; }
    public DateOnly ReportDate { get; set; }
    public string ShiftType { get; set; } = string.Empty;
    public string WorkerCategory { get; set; } = string.Empty;
    public Guid EmployeeId { get; set; }
    public EmployeeEntity Employee { get; set; } = null!;
    public string EmployeeNameSnapshot { get; set; } = string.Empty;
    public string PersonnelNoSnapshot { get; set; } = string.Empty;
    public string PositionSnapshot { get; set; } = string.Empty;
    public string DepartmentSnapshot { get; set; } = string.Empty;
    public string Status { get; set; } = "submitted";
    public Guid? CreatedByUserId { get; set; }
    public SiteUserEntity? CreatedByUser { get; set; }
    public string CreatedByName { get; set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public DateTimeOffset SubmittedAt { get; set; }
    public long RowVersion { get; set; }
    public List<EmuShiftReportLineEntity> Lines { get; set; } = [];
}

internal sealed class EmuShiftReportLineEntity
{
    public Guid Id { get; set; }
    public Guid ReportId { get; set; }
    public EmuShiftReportEntity Report { get; set; } = null!;
    public int SequenceNo { get; set; }
    public string WorkDescription { get; set; } = string.Empty;
    public int DurationMinutes { get; set; }
    public Guid? SectionId { get; set; }
    public EmuWorkSectionEntity? Section { get; set; }
    public string SectionNameSnapshot { get; set; } = string.Empty;
    public string Note { get; set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; set; }
}
