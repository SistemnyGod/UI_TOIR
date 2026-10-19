import { Button } from "../../../../shared/ui";

export function WorkFormActions({ disabled = false, error, onClose, onSubmit, pending, label, danger = false }: {
  disabled?: boolean;
  error: string;
  onClose: () => void;
  onSubmit: () => void;
  pending: boolean;
  label: string;
  danger?: boolean;
}) {
  return <div className="emu-modal-actions emu-work-form-actions">
    {error ? <p className="emu-work-form-error" role="alert">{error}</p> : null}
    <Button disabled={pending} onClick={onClose} variant="ghost">Отмена</Button>
    <Button disabled={disabled || pending} isLoading={pending} onClick={onSubmit} variant={danger ? "danger" : "primary"}>{label}</Button>
  </div>;
}
