import type { PpeIssueDocumentDto, SavePpeIssueDocumentDto } from "../../../api/contracts";

// A newer version alone does not prove that a timed-out save committed our input.
export function documentMatchesSave(document: PpeIssueDocumentDto, request: SavePpeIssueDocumentDto) {
  const content = document.content;
  const text = (value: string | null | undefined) => value?.trim() ?? "";
  if (content.employee.id !== request.employeeId || content.normSetId !== request.normSetId
    || content.documentDate !== request.documentDate || text(content.responsibleName) !== text(request.responsibleName)
    || text(content.basis) !== text(request.basis) || content.lines.length !== request.lines.length) return false;
  if (request.employeeDetails && Object.entries(request.employeeDetails).some(([key, value]) =>
    text(value) !== text(content.employee.details?.[key as keyof typeof request.employeeDetails]))) return false;
  return request.lines.every(input => {
    const line = content.lines.find(candidate => candidate.id === input.id);
    return line && line.itemId === input.itemId && line.normRowId === input.normRowId && line.issueDate === input.issueDate
      && line.quantity === input.quantity && (input.unitPriceMinor == null || line.unitPriceMinor === input.unitPriceMinor)
      && (input.lifeMonths == null || line.lifeMonths === input.lifeMonths)
      && text(line.sizeText) === text(input.sizeText) && text(line.exceptionReason) === text(input.exceptionReason)
      && line.manualControlConfirmed === (input.manualControlConfirmed ?? false)
      && (input.normPoint == null || text(line.normPoint) === text(input.normPoint));
  });
}
