namespace Patrol360.Infrastructure.Persistence;

internal static class PpeIssueStatusCatalog
{
    public const string Active = "active";
    public const string Archived = "archived";
    public const string Issued = "issued";
    public const string IssueLater = "issue_later";
    public const string Issuing = "issuing";
    public const string Lost = "lost";
    public const string NoStock = "no_stock";
    public const string NotIssued = "not_issued";
    public const string Partial = "partial";
    public const string Reissued = "reissued";
    public const string Replacement = "replacement";
    public const string Returned = "returned";
    public const string WrittenOff = "written_off";

    public static string NormalizeCode(string? status)
    {
        var value = Normalize(status);
        return value switch
        {
            NotIssued or Issuing or IssueLater or Issued or Partial or NoStock or Replacement
                or Returned or Reissued or Lost or WrittenOff => value,
            "write_off" => WrittenOff,
            _ => string.Empty
        };
    }

    public static bool IsAllowedTransition(string oldStatus, string nextStatus) =>
        Normalize(oldStatus) switch
        {
            NotIssued or Issuing or IssueLater or Partial or NoStock =>
                Normalize(nextStatus) is NotIssued or Issuing or IssueLater or Partial or NoStock or Replacement or Issued,
            Issued or Replacement or Reissued =>
                Normalize(nextStatus) is Returned or WrittenOff or Lost,
            Returned or WrittenOff or Lost or Archived => false,
            _ => Normalize(nextStatus) is NotIssued or Issuing or IssueLater or Issued or Partial or NoStock or Replacement
        };

    public static bool IsClosedStatus(string status) =>
        Normalize(status) is Returned or WrittenOff or Lost;

    public static bool IsDraftEditableStatus(string status) =>
        Normalize(status) is NotIssued or Issuing;

    public static bool IsSignatureStatus(string status) =>
        Normalize(status) is Issued or Partial or Replacement or Reissued or Returned or WrittenOff;

    public static string Label(string status) => Normalize(status) switch
    {
        Active => "Активна",
        Archived => "Архив",
        Issued => "Выдано",
        IssueLater => "Выдать позже",
        Issuing => "К выдаче",
        Lost => "Утеряно",
        NoStock => "Нет на складе",
        NotIssued => "Не выдано",
        Partial => "Частично",
        Reissued => "Переоформлено",
        Replacement => "Заменено аналогом",
        Returned => "Возвращено",
        WrittenOff => "Списано",
        _ => status
    };

    private static string Normalize(string? value) =>
        (value ?? string.Empty).Trim().ToLowerInvariant();
}
