import { Trash2 } from "lucide-react";
import type { EmuShiftReportSectionDto } from "../../../../api/emuShiftReportContracts";
import type { WorkRow } from "../shiftReportUi";
import { DurationInput } from "./DurationInput";

export function ShiftReportWorkRow({
  index,
  row,
  sections,
  errors,
  onChange,
  onRemove,
}: {
  index: number;
  row: WorkRow;
  sections: EmuShiftReportSectionDto[];
  errors: Record<string, string>;
  onChange: (patch: Partial<WorkRow>) => void;
  onRemove: () => void;
}) {
  const descriptionError = errors[`description-${row.id}`];
  const descriptionErrorId = `description-error-${row.id}`;
  return (
    <tr>
      <td data-label="№"><span className="emu-row-number">{index + 1}</span></td>
      <td data-label="Выполненная работа">
        <textarea
          id={`description-${row.id}`}
          value={row.description}
          onChange={(event) => onChange({ description: event.target.value })}
          placeholder="Что выполнено"
          aria-invalid={Boolean(descriptionError)}
          aria-describedby={descriptionError ? descriptionErrorId : undefined}
          maxLength={1500}
        />
        {descriptionError ? <small id={descriptionErrorId}>{descriptionError}</small> : null}
      </td>
      <td data-label="Время">
        <DurationInput row={row} error={errors[`duration-${row.id}`]} onChange={onChange} />
      </td>
      <td data-label="Участок">
        <select
          aria-label={`Участок, строка ${index + 1}`}
          value={row.sectionId}
          onChange={(event) => onChange({ sectionId: event.target.value })}
        >
          <option value="">Не указан</option>
          {sections.map((section) => <option value={section.id} key={section.id}>{section.name}</option>)}
        </select>
      </td>
      <td data-label="Примечание">
        <textarea
          aria-label={`Примечание, строка ${index + 1}`}
          value={row.note}
          onChange={(event) => onChange({ note: event.target.value })}
          placeholder="Необязательно"
          maxLength={1500}
        />
      </td>
      <td data-label="Действия" className="emu-row-actions">
        <button
          type="button"
          className="emu-row-delete"
          aria-label={`${index < 5 ? "Очистить" : "Удалить"} строку ${index + 1}`}
          title={index < 5 ? "Очистить строку" : "Удалить строку"}
          onClick={onRemove}
        >
          <Trash2 aria-hidden="true" size={17} />
        </button>
      </td>
    </tr>
  );
}
