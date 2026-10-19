import { useEffect, useState } from "react";
import type { ScreenId } from "../../types";
import { useInventoryRepository } from "../../repositories/inventoryRepositoryContext";
import { readDocumentStorage, writeDocumentStorage } from "./ppe/documentStorage";
import { PpeIssueDocumentConstructor } from "./PpeIssueDocumentConstructor";
import { LegacyIssueDraftNotice } from "./ppe/LegacyIssueDraftNotice";

export function InventoryPpeCreateScreen({ onNavigate, onNotify, currentUserId, canManage = false, canManageTemplates = false, canExport = false }: { onNavigate: (screen: ScreenId) => void; onNotify: (message: string) => void; currentUserId?: string; canManage?: boolean; canManageTemplates?: boolean; canExport?: boolean }) {
  const repository = useInventoryRepository();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [capabilitiesError, setCapabilitiesError] = useState("");
  const [blockedReason, setBlockedReason] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  const [existing, setExisting] = useState(() => ({ userId: currentUserId, id: readDocumentStorage("sessionStorage", `ppe.open-document.${currentUserId ?? "anonymous"}`) }));
  useEffect(() => { setExisting({ userId: currentUserId, id: readDocumentStorage("sessionStorage", `ppe.open-document.${currentUserId ?? "anonymous"}`) }); }, [currentUserId]);
  useEffect(() => {
    let active = true;
    setEnabled(null);
    setCapabilitiesError("");
    setBlockedReason("");
    void repository.getPpeIssueDocumentCapabilities()
      .then((value) => { if (active) { setEnabled(value.enabled); setBlockedReason(value.reason ?? ""); } })
      .catch((reason) => { if (active) setCapabilitiesError(reason instanceof Error ? reason.message : "Не удалось проверить доступность конструктора"); });
    return () => { active = false; };
  }, [repository, retryKey, currentUserId]);
  if (capabilitiesError) return <div className="ppe-document-state"><p>{capabilitiesError}</p><button className="button secondary" onClick={() => setRetryKey((value) => value + 1)} type="button">Повторить проверку</button></div>;
  if (enabled === null) return <div className="ppe-document-state">Проверяем доступность конструктора…</div>;
  if (!enabled && existing.userId === currentUserId && existing.id) return <PpeIssueDocumentConstructor canExport={canExport} currentUserId={currentUserId} onNavigate={onNavigate} onNotify={onNotify} />;
  return <><LegacyIssueDraftNotice userId={currentUserId ?? "anonymous"} onNotify={onNotify} />{enabled ? <PpeIssueDocumentConstructor canExport={canExport} canManage={canManage} canManageTemplates={canManageTemplates} currentUserId={currentUserId} onNavigate={onNavigate} onNotify={onNotify} /> : <section className="ppe-document-state"><h1>Новые выдачи СИЗ выключены</h1>{blockedReason ? <p>{blockedReason}</p> : null}<p>Перед запуском необходимо проверить применимость всех наборов норм, правила выдачи и утвердить товары. История и возвраты существующих позиций доступны в журнале.</p><button className="button primary" onClick={() => { writeDocumentStorage("sessionStorage", "patrol360:inventory-ppe:norm-settings-intent", JSON.stringify({ position: "" })); onNavigate("inventory-settings"); }} type="button">Подготовить нормы СИЗ</button><button className="button secondary" onClick={() => onNavigate("inventory-ppe")} type="button">Открыть журнал</button></section>}</>;
}
