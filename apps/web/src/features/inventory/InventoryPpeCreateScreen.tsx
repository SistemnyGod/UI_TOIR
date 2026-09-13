import { useEffect, useState } from "react";
import type { ScreenId } from "../../types";
import { useInventoryRepository } from "../../repositories/inventoryRepositoryContext";
import { PpeIssueDocumentConstructor } from "./PpeIssueDocumentConstructor";
import { PpeIssueWorkflowScreen } from "./ppe/PpeIssueWorkflowScreen";

export function InventoryPpeCreateScreen({ onNavigate, onNotify, currentUserId, canManage = false, canExport = false }: { onNavigate: (screen: ScreenId) => void; onNotify: (message: string) => void; currentUserId?: string; canManage?: boolean; canExport?: boolean }) {
  const repository = useInventoryRepository();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [capabilitiesError, setCapabilitiesError] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  useEffect(() => {
    let active = true;
    setEnabled(null);
    setCapabilitiesError("");
    void repository.getPpeIssueDocumentCapabilities()
      .then((value) => { if (active) setEnabled(value.enabled); })
      .catch((reason) => { if (active) setCapabilitiesError(reason instanceof Error ? reason.message : "Не удалось проверить доступность конструктора"); });
    return () => { active = false; };
  }, [repository, retryKey]);
  if (capabilitiesError) return <div className="ppe-document-state"><p>{capabilitiesError}</p><button className="button secondary" onClick={() => setRetryKey((value) => value + 1)} type="button">Повторить проверку</button></div>;
  if (enabled === null) return <div className="ppe-document-state">Проверяем доступность конструктора…</div>;
  return enabled ? <PpeIssueDocumentConstructor canExport={canExport} canManage={canManage} currentUserId={currentUserId} onNavigate={onNavigate} onNotify={onNotify} /> : <PpeIssueWorkflowScreen currentUserId={currentUserId} onNavigate={onNavigate} onNotify={onNotify} />;
}
