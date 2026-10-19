import { useEffect, useRef, useState } from "react";
import { PackageCheck, Plus } from "lucide-react";
import type { CreateInventoryCustodyRecordDto, InventoryEmployeeDto, InventoryItemDto, InventorySettingsDto, UpsertInventoryItemDto } from "../../../api/contracts";
import { useInventoryRepository } from "../../../repositories/inventoryRepositoryContext";
import { CUSTODY_ITEM_GROUPS } from "./custodyCommon";
import { CustodyIssueDialog } from "./CustodyIssueDialog";
import { CustodyItemDialog } from "./CustodyItemDialog";

export function CustodyComposer({ employees, items, onNotify, onReload, settings }: {
  employees: InventoryEmployeeDto[]; items: InventoryItemDto[]; onNotify: (message: string) => void; onReload: () => Promise<void>; settings?: InventorySettingsDto;
}) {
  const repository = useInventoryRepository();
  const [dialog, setDialog] = useState<"issue" | "item" | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  function saved(message: string) {
    if (!mounted.current) return false;
    onNotify(message);
    void onReload().catch(() => { if (mounted.current) onNotify("Запись сохранена. Обновите список, чтобы увидеть изменения."); });
    return true;
  }
  async function issue(payload: CreateInventoryCustodyRecordDto) { await repository.createCustodyRecord(payload); return saved("Запись под ответственность создана"); }
  async function createItem(payload: UpsertInventoryItemDto) { await repository.createItem(payload); return saved("Предмет добавлен в учёт"); }
  return <section className="inventory-custody-composer" aria-label="Выдача под запись">
    <div className="inventory-custody-step"><span>1</span><div><strong>Выдача под запись</strong><small>Выберите сотрудника и предмет. Запись попадёт в историю движения.</small></div></div>
    <div className="inventory-custody-composer-summary"><div><span>Сотрудников</span><strong>{employees.filter(employee => employee.status !== "archived").length}</strong></div><div><span>Предметов</span><strong>{items.filter(item => item.isActive !== false).length}</strong></div><div><span>Групп учёта</span><strong>{CUSTODY_ITEM_GROUPS.length}</strong></div></div>
    <button className="button primary inventory-custody-submit" type="button" onClick={() => setDialog("issue")}><Plus size={16} />Новая выдача</button>
    <button className="button ghost inventory-custody-submit" type="button" onClick={() => setDialog("item")}><PackageCheck size={16} />Добавить предмет</button>
    <details className="custody-group-reference"><summary>Группы учёта</summary><ul>{CUSTODY_ITEM_GROUPS.map(group => <li key={group}>{group}</li>)}</ul></details>
    {dialog === "issue" ? <CustodyIssueDialog employees={employees} items={items} onClose={() => setDialog(null)} onSave={issue} /> : null}
    {dialog === "item" ? <CustodyItemDialog settings={settings} onClose={() => setDialog(null)} onSave={createItem} /> : null}
  </section>;
}
