import type { WorkRow } from "../shiftReportUi";

export function DurationInput({
  row,
  error,
  onChange,
}: {
  row: WorkRow;
  error?: string;
  onChange: (patch: Partial<WorkRow>) => void;
}) {
  const errorId = `duration-error-${row.id}`;
  return (
    <div className="emu-duration-field">
      <div className="emu-duration">
        <input
          id={`duration-${row.id}`}
          inputMode="numeric"
          aria-label="Часы"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          value={row.hours}
          onChange={(event) => onChange({ hours: event.target.value.replace(/\D/g, "").slice(0, 2) })}
          placeholder="0"
        />
        <span>ч</span>
        <input
          inputMode="numeric"
          aria-label="Минуты"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          value={row.minutes}
          onChange={(event) => onChange({ minutes: event.target.value.replace(/\D/g, "").slice(0, 2) })}
          placeholder="00"
        />
        <span>мин</span>
      </div>
      {error ? <small id={errorId}>{error}</small> : null}
    </div>
  );
}
