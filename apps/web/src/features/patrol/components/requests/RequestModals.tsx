import { useState } from "react";
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
  const [isCreateDirty, setIsCreateDirty] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);

  if (!modal) {
    return null;
  }

  function requestClose() {
    if (!modal) {
      return;
    }

    if (modal.kind === "create" && isCreateDirty) {
      setShowCloseConfirm(true);
      return;
    }

    onClose();
  }

  function closeWithoutSaving() {
    setIsCreateDirty(false);
    setShowCloseConfirm(false);
    onClose();
  }

  return (
    <>
      {modal.kind === "view" && request ? (
        <RequestViewModal
          request={request}
          onClose={requestClose}
          onCreateRelated={() => onCreateRelated(request.sourceResultId)}
        />
      ) : null}
      {modal.kind === "view" && !request ? (
        <ModalShell
          actions={<Button onClick={requestClose} variant="primary">Закрыть</Button>}
          className="request-modal"
          onClose={requestClose}
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
          onClose={requestClose}
          onDirtyChange={setIsCreateDirty}
          onSubmitCreate={async (payload) => {
            setIsCreateDirty(false);
            await onSubmitCreate(payload);
          }}
        />
      ) : null}
      {showCloseConfirm ? (
        <ModalShell
          actions={
            <>
              <Button onClick={() => setShowCloseConfirm(false)} variant="ghost">
                Вернуться к форме
              </Button>
              <Button className="danger-primary" onClick={closeWithoutSaving} variant="danger">
                Закрыть без сохранения
              </Button>
            </>
          }
          className="confirm-window"
          onClose={() => setShowCloseConfirm(false)}
          subtitle="В заявке есть несохраненные изменения. Если закрыть окно, черновик будет потерян."
          title="Закрыть форму?"
        >
          <p>Выберите «Вернуться к форме», чтобы продолжить редактирование.</p>
        </ModalShell>
      ) : null}
    </>
  );
}
