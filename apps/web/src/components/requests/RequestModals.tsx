import { useEffect, useRef, useState } from "react";
import type {
  CreateServiceRequestPayload,
  EmployeeDirectoryItem,
  PatrolResult,
  RouteDirectoryItem,
  ServiceRequest,
} from "../../types";
import type { RequestModalState } from "../../domain/serviceRequests";
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
  const modalRootRef = useRef<HTMLDivElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!modal) {
      setIsCreateDirty(false);
      setShowCloseConfirm(false);
      return undefined;
    }

    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    window.setTimeout(() => {
      focusFirstControl(modalRootRef.current);
    }, 0);

    return () => {
      returnFocusRef.current?.focus();
    };
  }, [modal]);

  useEffect(() => {
    if (!modal) return undefined;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (showCloseConfirm) {
        setShowCloseConfirm(false);
        return;
      }
      requestClose();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  useEffect(() => {
    if (!showCloseConfirm) return;
    window.setTimeout(() => {
      focusFirstControl(modalRootRef.current?.querySelector(".confirm-window") ?? null);
    }, 0);
  }, [showCloseConfirm]);

  if (!modal) return null;

  function requestClose() {
    if (modal?.kind === "create" && isCreateDirty) {
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
    <div className="modal-backdrop" onMouseDown={requestClose} ref={modalRootRef}>
      {modal.kind === "view" && request ? (
        <RequestViewModal
          request={request}
          onClose={requestClose}
          onCreateRelated={() => onCreateRelated(request.sourceResultId)}
        />
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
        <section
          aria-label="Закрыть форму без сохранения"
          aria-modal="true"
          className="modal-window confirm-window"
          onMouseDown={(event) => event.stopPropagation()}
          role="alertdialog"
        >
          <div className="modal-head">
            <div>
              <h2>Закрыть форму?</h2>
              <p>В заявке есть несохраненные изменения. Если закрыть окно, черновик будет потерян.</p>
            </div>
          </div>
          <div className="modal-actions">
            <button className="button ghost" onClick={() => setShowCloseConfirm(false)} type="button">
              Вернуться к форме
            </button>
            <button className="button primary danger-primary" onClick={closeWithoutSaving} type="button">
              Закрыть без сохранения
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function focusFirstControl(root: HTMLElement | null) {
  if (!root) return;

  const firstControl = root.querySelector<HTMLElement>(
    [
      "button:not([disabled])",
      "input:not([disabled])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      "[tabindex]:not([tabindex='-1'])",
    ].join(","),
  );

  firstControl?.focus();
}
