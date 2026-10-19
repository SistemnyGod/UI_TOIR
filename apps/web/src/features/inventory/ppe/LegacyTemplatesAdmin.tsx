import { useEffect, useRef, useState } from "react";
import type { InventoryPpeNormSetDto, PpeKitTemplateDto } from "../../../api/contracts";
import { useInventoryRepository } from "../../../repositories/inventoryRepositoryContext";
import { Button } from "../../../shared/ui";
import { LegacyTemplateDialog } from "./LegacyTemplateDialog";
import { ppeErrorMessage } from "./ppeErrors";
import "../styles/ppe-norm-editor.css";

export function LegacyTemplatesAdmin(props: { norms: InventoryPpeNormSetDto[]; onNotify: (message: string) => void }) {
  const repository = useInventoryRepository(), owner = useRef({ repository, revision: 0 });
  if (owner.current.repository !== repository) owner.current = { repository, revision: owner.current.revision + 1 };
  return <LegacyWorkspace key={owner.current.revision} {...props} />;
}
function LegacyWorkspace({ norms, onNotify }: { norms: InventoryPpeNormSetDto[]; onNotify: (message: string) => void }) {
  const repository = useInventoryRepository(), request = useRef(0), bound = useRef(new Set<string>());
  const [templates, setTemplates] = useState<PpeKitTemplateDto[]>([]), [selected, setSelected] = useState<PpeKitTemplateDto | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState("");
  async function load() {
    const generation = ++request.current; setLoading(true); setError("");
    try { const values = await repository.getLegacyPpeKitTemplates(); if (generation === request.current) setTemplates(values.filter(template => !bound.current.has(template.id))); }
    catch (reason) { if (generation === request.current) setError(ppeErrorMessage(reason, "Не удалось загрузить наследованные шаблоны")); }
    finally { if (generation === request.current) setLoading(false); }
  }
  useEffect(() => { void load(); return () => { request.current++; }; }, [repository]);
  return <details className="ppe-ref-panel ppe-legacy-templates"><summary>Наследованные шаблоны · {templates.length}</summary>
    <p className="ppe-norm-editor-hint">Состав, владелец и норма назначаются после явной проверки. Автоматическое утверждение товаров не выполняется.</p>
    <div className="ppe-legacy-list-actions"><Button disabled={loading} onClick={() => void load()}>Обновить шаблоны</Button><span role="status">{loading ? templates.length ? "Обновление шаблонов…" : "Загрузка шаблонов…" : "Доступно для проверки: " + templates.length}</span></div>
    {error ? <p className="field-error" role="alert">{error}</p> : null}
    {!loading && !templates.length && !error ? <p className="ppe-norm-editor-hint">Наследованных шаблонов для привязки нет.</p> : null}
    <ul className="ppe-legacy-template-list">{templates.map(template => <li key={template.id}><div><strong>{template.name}</strong><span>Исходных позиций: {template.lines.length} · версия {template.version}</span></div><Button onClick={() => setSelected(structuredClone(template))}>Проверить и привязать</Button></li>)}</ul>
    {selected ? <LegacyTemplateDialog key={selected.id + ":" + selected.version} template={selected} norms={norms} onClose={() => setSelected(null)} onBound={saved => { bound.current.add(saved.id); setTemplates(current => current.filter(template => template.id !== saved.id)); setSelected(null); onNotify("Шаблон явно привязан к выбранной норме и вашему аккаунту"); }} /> : null}
  </details>;
}
