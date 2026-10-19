import type { InventoryPpeNormRowDto, InventoryPpeNormSetDto } from "../../../../api/contracts";
import { Button } from "../../../../shared/ui";
import type { OpenNormEditor } from "./normEditorModel";
import "../../styles/ppe-norm-editor.css";

export function NormScopeEditor({ canManage, normSet, onEdit }: { canManage: boolean; normSet: InventoryPpeNormSetDto; onEdit: OpenNormEditor }) {
  return <div className="ppe-norm-scope-summary"><dl><div><dt>Подразделение</dt><dd>{normSet.departmentName || "Не подтверждено"}</dd></div><div><dt>Применимые должности</dt><dd>{normSet.positionAliases?.join("; ") || "Не подтверждены"}</dd></div></dl>
    <Button variant="secondary" onClick={() => onEdit({ kind: "scope", normSet })}>{canManage ? "Проверить область применения" : "Просмотреть область применения"}</Button></div>;
}
export function NormRowRulesEditor({ normSetId, normSetVersion, row, onEdit }: { normSetId: string; normSetVersion: number; row: InventoryPpeNormRowDto; onEdit: OpenNormEditor }) {
  return <Button variant="secondary" onClick={() => onEdit({ kind: "rules", normSetId, version: normSetVersion, row })}>Правила строки</Button>;
}
export function MappingApprovalEditor({ canManage, mapping, row, normSetId, normSetVersion, onEdit }: { canManage: boolean; mapping: InventoryPpeNormRowDto["mappings"][number]; row: InventoryPpeNormRowDto; normSetId: string; normSetVersion: number; onEdit: OpenNormEditor }) {
  return <Button variant="secondary" onClick={() => onEdit({ kind: "approval", normSetId, version: normSetVersion, row, mapping })}>{!canManage ? "Просмотреть соответствие" : mapping.isApproved ? "Проверить утверждение" : "Утвердить товар"}</Button>;
}
