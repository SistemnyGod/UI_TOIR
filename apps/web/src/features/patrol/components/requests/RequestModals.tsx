import type {
  CreateServiceRequestPayload,
  EmployeeDirectoryItem,
  PatrolResult,
  RouteDirectoryItem,
  ServiceRequest,
} from "../../../../types";
import type { RequestModalState } from "../../../../domain/serviceRequests";
import { Button, ModalShell } from "../../../../shared/ui";
import { RequestCreateModal } from "./RequestCreateModal";
import { RequestViewModal } from "./RequestViewModal";

export function RequestModals({
  modal,
  request,
  sourceResult,
  sourceResultId,
  employeeOptions,
  routeOptions,
  onClose,
  onCreateRelated,
  onSubmitCreate,
}: {
  modal: RequestModalState;
  request?: ServiceRequest;
  sourceResult?: PatrolResult;
  sourceResultId?: string;
  employeeOptions: EmployeeDirectoryItem[];
  routeOptions: RouteDirectoryItem[];
  onClose: () => void;
  onCreateRelated: (sourceResultId?: string) => void;
  onSubmitCreate: (payload: CreateServiceRequestPayload) => void | Promise<void>;
}) {
  if (!modal) return null;

  return (
    <>
      {modal.kind === "view" && request ? (
        <RequestViewModal
          request={request}
          onClose={onClose}
          onCreateRelated={() => onCreateRelated(request.sourceResultId)}
        />
      ) : null}
      {modal.kind === "view" && !request ? (
        <ModalShell
          actions={<Button onClick={onClose} variant="primary">Закрыть</Button>}
          className="request-modal"
          onClose={onClose}
          subtitle="Запись отсутствует в текущем списке заявок. Обновите данные или создайте новую заявку."
          title="Заявка не найдена"
        >
          <p>Создайте новую заявку или обновите список, чтобы повторить попытку.</p>
        </ModalShell>
      ) : null}
      {modal.kind === "create" ? (
        <RequestCreateModal
          employeeOptions={employeeOptions}
          routeOptions={routeOptions}
          sourceResult={sourceResult}
          sourceResultId={sourceResultId}
          onClose={onClose}
          onDirtyChange={() => undefined}
          onSubmitCreate={onSubmitCreate}
        />
      ) : null}
    </>
  );
}
