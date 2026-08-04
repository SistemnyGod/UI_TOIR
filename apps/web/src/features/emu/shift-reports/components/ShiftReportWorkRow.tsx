import { Trash2 } from "lucide-react";
import { useLayoutEffect, useRef, type ChangeEvent, type TextareaHTMLAttributes } from "react";
import type { EmuShiftReportSectionDto } from "../../../../api/emuShiftReportContracts";
import type { WorkRow } from "../shiftReportUi";
import { DurationInput } from "./DurationInput";

type AutoResizeTextareaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value"> & {
  value: string;
};

function resizeTextarea(element: HTMLTextAreaElement) {
  element.style.height = "0px";
  element.style.height = `${element.scrollHeight}px`;
}

function AutoResizeTextarea({ value, onChange, className = "", ...props }: AutoResizeTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    if (textareaRef.current) resizeTextarea(textareaRef.current);
  }, [value]);

  function handleChange(event: ChangeEvent<HTMLTextAreaElement>) {
    resizeTextarea(event.currentTarget);
    onChange?.(event);
  }

  return (
    <textarea
      {...props}
      ref={textareaRef}
      className={`emu-autosize-textarea ${className}`.trim()}
      rows={2}
      value={value}
      onChange={handleChange}
    />
  );
}

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
        <AutoResizeTextarea
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
        <AutoResizeTextarea
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
          aria-label={'Удалить строку ' + (index + 1)}
          title='Удалить строку'
          onClick={onRemove}
        >
          <Trash2 aria-hidden="true" size={17} />
        </button>
      </td>
    </tr>
  );
}
