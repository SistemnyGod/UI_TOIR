import type { EmuWorkSessionDto } from "../../../../api/contracts";

export function WorkSummary({ work }: { work: EmuWorkSessionDto }) {
  return (
    <div className="emu-work-summary">
      <strong>{work.sectionName}</strong>
      <span>{work.employees.map((employee) => employee.fullNameSnapshot).join(", ")}</span>
      <p>{work.taskDescription}</p>
    </div>
  );
}
