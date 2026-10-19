import { useEffect, useState } from "react";
import { readLegacyIssueDrafts } from "./legacyIssueDraftRecovery";

export function LegacyIssueDraftNotice({ userId, onNotify }: { userId: string; onNotify: (message: string) => void }) {
  const [available, setAvailable] = useState(false);
  useEffect(() => { setAvailable(Object.keys(readLegacyIssueDrafts(userId)).length > 0); }, [userId]);
  if (!available) return null;
  return <aside className="ppe-document-state" role="status"><p>В этом браузере есть черновик прежнего мастера СИЗ. Сохраните копию для проверки и переноса в новый документ.</p><button className="button secondary" type="button" onClick={() => {
    const drafts = readLegacyIssueDrafts(userId);
    if (!Object.keys(drafts).length) { setAvailable(false); onNotify("Локальный черновик недоступен. Серверные документы доступны в журнале."); return; }
    const url = URL.createObjectURL(new Blob([JSON.stringify({ userId, drafts }, null, 2)], { type: "application/json" }));
    try {
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = "ppe-legacy-drafts.json"; anchor.click();
    } finally { window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
  }}>Скачать прежний черновик</button></aside>;
}
