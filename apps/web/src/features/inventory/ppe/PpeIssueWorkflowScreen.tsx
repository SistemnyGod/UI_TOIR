import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, X } from "lucide-react";
import type {
  InventoryEmployeeDto,
  InventoryItemSetDetailDto,
  InventoryPpeCardDetailDto,
  InventoryPpeCardNormRowDto,
  InventorySettingsDto,
} from "../../../api/contracts";
import type { ScreenId } from "../../../types";
import { useInventoryRepository } from "../../../repositories/inventoryRepositoryContext";
import { createClientUuid } from "../../../shared/clientUuid";
import { printDataFromWizard, saveApiFile } from "./ppeCommon";
import { PpeButton } from "./PpeUi";
import { PpeCatalogModal, type PpeCatalogSelection } from "./PpeCatalogModal";
import {
  applyItemSetToDraft,
  clearPpeIssueWorkflowCache,
  createIssueDraftLine,
  mergeIssueDraftLine,
  readPpeIssueWorkflowCache,
  validateIssueDraftLine,
  writePpeIssueWorkflowCache,
  type PpeIssueDraftLine,
} from "./ppeIssueDraft";
import {
  CompositionStep,
  EmployeeDocumentStep,
  PrintStep,
  SelectionStep,
  type DraftSource,
  type IssueType,
  type SelectionTab,
} from "./PpeIssueWorkflowSteps";
import { PrintPreviewModal, printDocument } from "./ppePrint";
import type { PpeEmployeeCardDetails, PpeWizardLine, PpeWizardState, PrintData, PrintMode } from "./ppeTypes";
import { toItemFromNorm } from "./ppePrintMapping";
import "../styles/ppe-issue-workflow.css";
import "../styles/ppe-ui-system.css";

type WorkflowStep = 1 | 2 | 3 | 4;

const today = new Date().toISOString().slice(0, 10);
const emptyEmployeeDetails: PpeEmployeeCardDetails = {
  clothingSize: "", gender: "", handProtectionSize: "", headSize: "", height: "", respiratorSize: "", shoeSize: "",
};

export function PpeIssueWorkflowScreen({ onNavigate, onNotify }: { onNavigate: (screen: ScreenId) => void; onNotify: (message: string) => void }) {
  const repository = useInventoryRepository();
  const [cache] = useState(readPpeIssueWorkflowCache);
  const restoreStarted = useRef(false);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [employees, setEmployees] = useState<InventoryEmployeeDto[]>([]);
  const [employeeId, setEmployeeId] = useState(cache?.employeeId ?? window.localStorage.getItem("patrol360.inventory.ppe.employee") ?? "");
  const [employeeDetails, setEmployeeDetails] = useState<PpeEmployeeCardDetails>(emptyEmployeeDetails);
  const [issueDate, setIssueDate] = useState(cache?.issueDate ?? today);
  const [issueType, setIssueType] = useState<IssueType>(cache?.issueType ?? "planned");
  const [responsible, setResponsible] = useState(cache?.responsibleName ?? "");
  const [basis, setBasis] = useState(cache?.basis ?? "Приказ № 882н");
  const [source, setSource] = useState<DraftSource>(cache?.source ?? "active_norms");
  const [step, setStep] = useState<WorkflowStep>(cache?.step ?? 1);
  const [selectionTab, setSelectionTab] = useState<SelectionTab>("norms");
  const [draft, setDraft] = useState<InventoryPpeCardDetailDto | null>(null);
  const [workspace, setWorkspace] = useState<{ employee: InventoryEmployeeDto; activeNormSet: { positionName: string; versionName: string; sourceName: string; rowsCount: number } | null } | null>(null);
  const [rows, setRows] = useState<InventoryPpeCardNormRowDto[]>([]);
  const [issueLines, setIssueLines] = useState<PpeIssueDraftLine[]>(cache?.issueLines ?? []);
  const [settings, setSettings] = useState<InventorySettingsDto | null>(null);
  const [settingsError, setSettingsError] = useState("");
  const [settingsReloadToken, setSettingsReloadToken] = useState(0);
  const [mappingRow, setMappingRow] = useState<InventoryPpeCardNormRowDto | null>(null);
  const [printMode, setPrintMode] = useState<PrintMode>("sheet");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [downloadFormat, setDownloadFormat] = useState<"pdf" | "docx" | null>(null);
  const downloadRef = useRef<"pdf" | "docx" | null>(null);
  const [printing, setPrinting] = useState(false);
  const printingRef = useRef(false);
  const [loadingEmployees, setLoadingEmployees] = useState(true);
  const [loadingWorkspace, setLoadingWorkspace] = useState(false);
  const [committed, setCommitted] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoadingEmployees(true);
    repository.getEmployees({ page: 1, pageSize: 60, query: deferredQuery, status: "active" })
      .then((result) => { if (!cancelled) { setEmployees(result.rows); if (!employeeId && result.rows[0]) setEmployeeId(result.rows[0].id); } })
      .catch((reason) => { if (!cancelled) setError(messageOf(reason, "Не удалось загрузить сотрудников")); })
      .finally(() => { if (!cancelled) setLoadingEmployees(false); });
    return () => { cancelled = true; };
  }, [deferredQuery, repository]);

  useEffect(() => {
    let cancelled = false;
    setSettingsError("");
    repository.getSettings().then((result) => { if (!cancelled) setSettings(result); }).catch((reason) => { if (!cancelled) setSettingsError(messageOf(reason, "Не удалось загрузить наборы СИЗ")); });
    return () => { cancelled = true; };
  }, [repository, settingsReloadToken]);

  useEffect(() => {
    if (!cache?.draftId || restoreStarted.current) return;
    restoreStarted.current = true;
    setLoadingWorkspace(true);
    repository.getPpeCard(cache.draftId)
      .then((restored) => {
        setDraft(restored);
        setRows([...(restored.normRows ?? [])].sort((left, right) => left.sortOrder - right.sortOrder));
        setEmployeeDetails({ ...emptyEmployeeDetails, ...restored.employeeDetails });
        setIssueType(restored.issueType ?? cache.issueType);
        setResponsible(restored.responsibleName ?? cache.responsibleName);
        setBasis(restored.basis ?? cache.basis);
      })
      .catch(() => { clearPpeIssueWorkflowCache(); setStep(1); setIssueLines([]); })
      .finally(() => setLoadingWorkspace(false));
  }, [cache, repository]);

  useEffect(() => {
    if (!employeeId) return;
    let cancelled = false;
    setLoadingWorkspace(true);
    repository.getPpeWorkspace(employeeId)
      .then((result) => {
        if (cancelled) return;
        setWorkspace({ employee: result.employee, activeNormSet: result.activeNormSet });
        if (!draft) setEmployeeDetails((current) => ({ ...current, ...(result.card?.employeeDetails ?? {}) }));
      })
      .catch(() => { if (!cancelled) setWorkspace(null); })
      .finally(() => { if (!cancelled) setLoadingWorkspace(false); });
    return () => { cancelled = true; };
  }, [draft, employeeId, repository]);


  useEffect(() => {
    if (committed) return;
    writePpeIssueWorkflowCache({ basis, draftId: draft?.id, employeeId, issueDate, issueLines, issueType, responsibleName: responsible, source, step });
  }, [basis, committed, draft?.id, employeeId, issueDate, issueLines, issueType, responsible, source, step]);

  const selectedEmployee = useMemo(() => employees.find((employee) => employee.id === employeeId) ?? workspace?.employee ?? null, [employeeId, employees, workspace?.employee]);
  const itemRows = useMemo(() => rows.filter((row) => row.rowType === "item"), [rows]);
  const categories = useMemo(() => {
    const groups = rows.filter((row) => row.rowType === "group");
    return groups.length ? groups : [{ id: "base", normItemName: "Базовая выдача", rowType: "group" as const } as InventoryPpeCardNormRowDto];
  }, [rows]);
  const printData = useMemo(() => buildPrintData({ cardId: draft?.id, employee: selectedEmployee, employeeDetails, issueLines, rows }), [draft?.id, employeeDetails, issueLines, rows, selectedEmployee]);
  const blockingErrors = useMemo(() => collectBlockingErrors({ basis, issueDate, issueLines, responsible, rows }), [basis, issueDate, issueLines, responsible, rows]);

  function patchEmployeeDetails(field: keyof PpeEmployeeCardDetails, value: string) { setEmployeeDetails((current) => ({ ...current, [field]: value })); }

  function beginSaving() {
    if (savingRef.current) return false;
    savingRef.current = true;
    setSaving(true);
    return true;
  }

  function endSaving() {
    savingRef.current = false;
    setSaving(false);
  }

  async function saveDocumentDraft() {
    if (!employeeId) return setError("Выберите сотрудника");
    if (!issueDate) return setError("Укажите дату выдачи");
    if (!responsible.trim()) return setError("Укажите ответственное лицо");
    if (!basis.trim()) return setError("Укажите основание выдачи");
    if (source === "active_norms" && workspace && !workspace.activeNormSet) return setError("Для должности не найден опубликованный набор норм");
    if (!beginSaving()) return; setError("");
    try {
      const saved = draft
        ? await repository.updatePpeCardDraft(draft.id, { basis: basis.trim(), cardDate: toApiDate(issueDate), employeeDetails: toApiEmployeeDetails(employeeDetails), expectedVersion: draft.version ?? 0, issueType, responsibleName: responsible.trim() })
        : await repository.createPpeCardDraft({ basis: basis.trim(), cardDate: toApiDate(issueDate), employeeDetails: toApiEmployeeDetails(employeeDetails), employeeId, issueType, responsibleName: responsible.trim(), source });
      setDraft(saved);
      setRows([...(saved.normRows ?? rows)].sort((left, right) => left.sortOrder - right.sortOrder));
      window.localStorage.setItem("patrol360.inventory.ppe.employee", employeeId);
      setStep(2);
      onNotify(draft ? "Реквизиты черновика сохранены" : "Черновик документа выдачи подготовлен");
    } catch (reason) { setError(messageOf(reason, "Не удалось сохранить черновик")); }
    finally { endSaving(); }
  }

  async function saveMapping(selections: PpeCatalogSelection[]) {
    if (!draft || !mappingRow) throw new Error("Черновик или строка выдачи недоступны");
    if (!beginSaving()) throw new Error("Дождитесь завершения текущего сохранения");
    setError("");
    try {
      const selectedByItemId = new Map(selections.map((selection) => [selection.item.id, selection]));
      const itemIdsInOtherRows = new Set(rows
        .filter((row) => row.id !== mappingRow.id && row.mappedItemId)
        .map((row) => row.mappedItemId as string));
      const accepted = [...selectedByItemId.values()].filter((selection) => !itemIdsInOtherRows.has(selection.item.id));
      const skipped = selections.length - accepted.length;
      if (!accepted.length) throw new Error("Все выбранные позиции уже добавлены в документ");

      const effectiveSelections = mappingRow.sourceNormRowId ? accepted.slice(0, 1) : accepted;
      if (mappingRow.sourceNormRowId) {
        await repository.upsertPpeNormRowMapping(mappingRow.sourceNormRowId, effectiveSelections[0].mapping);
      }

      const parentRowId = mappingRow.parentRowId
        ?? rows.find((row) => row.rowType === "group" && row.normItemName === "Дополнительная выдача")?.id
        ?? mappingRow.id;
      const mappedRows = effectiveSelections.map((selection, index) => {
        const source = index === 0 ? mappingRow : createExtraRow(parentRowId, rows.length + index);
        return {
          ...source,
          brandModelArticle: selection.mapping.brandModelArticle ?? "",
          defaultUnitPriceMinor: selection.mapping.defaultUnitPriceMinor ?? selection.item.defaultUnitPriceMinor ?? null,
          mappedItemId: selection.item.id,
          mappedItemName: selection.item.name,
          normItemName: source.sourceNormRowId ? source.normItemName : selection.item.normItemName || selection.item.name,
          quantity: selection.quantity,
          quantityText: `${selection.quantity} ${selection.item.unit || "шт."}`,
        };
      });

      const nextRows = rows
        .map((row) => row.id === mappingRow.id ? mappedRows[0] : row)
        .concat(mappedRows.slice(1))
        .map((row, index) => ({ ...row, sortOrder: index }));
      const saved = await repository.updatePpeCardNormRows(draft.id, {
        expectedVersion: draft.version ?? 0,
        rows: nextRows.map(toNormPayload),
      });
      const savedRows = [...(saved.normRows ?? nextRows)].sort((left, right) => left.sortOrder - right.sortOrder);
      const selectionsByRowId = new Map(mappedRows.map((row, index) => [row.id, effectiveSelections[index]]));
      setDraft(saved);
      setRows(savedRows);
      setIssueLines((current) => {
        let next = [...current];
        for (const savedRow of savedRows) {
          const selection = selectionsByRowId.get(savedRow.id);
          if (!selection) continue;
          const existing = next.find((line) => line.cardNormRowId === savedRow.id);
          const created = createIssueDraftLine(savedRow, issueDate, selection.quantity);
          if (!created) {
            next = next.filter((line) => line.cardNormRowId !== savedRow.id);
            continue;
          }
          const merged = mergeIssueDraftLine(created, existing);
          if (existing) next = next.map((line) => line.cardNormRowId === savedRow.id ? merged : line);
          else if (!mappingRow.sourceNormRowId) next.push(merged);
        }
        return next;
      });
      onNotify(effectiveSelections.length > 1
        ? `Добавлено позиций: ${effectiveSelections.length}${skipped ? `. Пропущено дублей: ${skipped}` : ""}`
        : skipped ? "Позиция добавлена, дубликаты пропущены" : "Номенклатура добавлена в документ");
    } catch (reason) {
      const message = messageOf(reason, "Не удалось сохранить номенклатуру");
      setError(message);
      throw new Error(message);
    } finally {
      endSaving();
    }
  }

  async function addCatalogRow() {
    if (!draft || saving) return;
    if (!beginSaving()) return; setError("");
    try {
      const existingGroup = rows.find((row) => row.rowType === "group" && row.normItemName === "Дополнительная выдача");
      const group = existingGroup ?? createExtraGroup(rows.length);
      const row = createExtraRow(group.id, rows.length + (existingGroup ? 0 : 1));
      const nextRows = existingGroup ? [...rows, row] : [...rows, group, row];
      const saved = await repository.updatePpeCardNormRows(draft.id, { expectedVersion: draft.version ?? 0, rows: nextRows.map(toNormPayload) });
      const savedRows = [...(saved.normRows ?? nextRows)].sort((left, right) => left.sortOrder - right.sortOrder);
      setDraft(saved); setRows(savedRows); setSelectionTab("catalog");
      setMappingRow(savedRows.find((candidate) => candidate.id === row.id) ?? row);
    } catch (reason) { setError(messageOf(reason, "Не удалось добавить дополнительную позицию")); }
    finally { endSaving(); }
  }

  async function removeExtraRow(rowId: string) {
    if (!draft) return;
    const target = rows.find((row) => row.id === rowId);
    if (!target || target.sourceNormRowId) return;
    if (!beginSaving()) return; setError("");
    try {
      let nextRows = rows.filter((row) => row.id !== rowId);
      if (target.parentRowId && !nextRows.some((row) => row.parentRowId === target.parentRowId)) nextRows = nextRows.filter((row) => row.id !== target.parentRowId);
      nextRows = nextRows.map((row, index) => ({ ...row, sortOrder: index }));
      const saved = await repository.updatePpeCardNormRows(draft.id, { expectedVersion: draft.version ?? 0, rows: nextRows.map(toNormPayload) });
      setDraft(saved); setRows([...(saved.normRows ?? nextRows)].sort((left, right) => left.sortOrder - right.sortOrder));
      setIssueLines((current) => current.filter((line) => line.cardNormRowId !== rowId));
      onNotify("Дополнительная позиция удалена");
    } catch (reason) { setError(messageOf(reason, "Не удалось удалить позицию")); }
    finally { endSaving(); }
  }

  async function applySet(set: InventoryItemSetDetailDto) {
    if (!draft) throw new Error("Сначала создайте черновик");
    const result = applyItemSetToDraft(rows, issueLines, set, issueDate);
    if (!result.added && !result.matched) { onNotify("Все позиции набора уже выбраны"); return; }
    if (!beginSaving()) return; setError("");
    try {
      const saved = await repository.updatePpeCardNormRows(draft.id, { expectedVersion: draft.version ?? 0, rows: result.rows.map(toNormPayload) });
      setDraft(saved); setRows([...(saved.normRows ?? result.rows)].sort((left, right) => left.sortOrder - right.sortOrder)); setIssueLines(result.lines);
      onNotify(`Набор добавлен: по норме ${result.matched}, дополнительно ${result.added}, пропущено дублей ${result.skipped}`);
    } catch (reason) { const message = messageOf(reason, "Не удалось применить набор"); setError(message); throw new Error(message); }
    finally { endSaving(); }
  }

  function toggleRow(row: InventoryPpeCardNormRowDto) {
    setIssueLines((current) => {
      const exists = current.some((line) => line.cardNormRowId === row.id);
      if (exists) return current.filter((line) => line.cardNormRowId !== row.id);
      const created = createIssueDraftLine(row, issueDate);
      return created ? [...current, created] : current;
    });
  }

  function selectAllMapped() {
    setIssueLines((current) => {
      const byRow = new Map(current.map((line) => [line.cardNormRowId, line]));
      for (const row of itemRows) { const created = createIssueDraftLine(row, issueDate); if (created && !byRow.has(row.id)) byRow.set(row.id, created); }
      return Array.from(byRow.values());
    });
  }

  function patchIssueLine(id: string, patch: Partial<PpeIssueDraftLine>) { setIssueLines((current) => current.map((line) => line.cardNormRowId === id ? { ...line, ...patch } : line)); }
  function removeIssueLine(id: string) { setIssueLines((current) => current.filter((line) => line.cardNormRowId !== id)); }
  function goToComposition() { if (!issueLines.length) return setError("Выберите хотя бы одну сопоставленную позицию"); setError(""); setStep(3); }
  function goToPrint() { if (!issueLines.length) return setError("В документе нет выбранных позиций"); setError(""); setStep(4); }

  async function commitIssue() {
    if (!draft || committed || blockingErrors.length) return;
    if (!beginSaving()) return; setError("");
    try {
      const saved = await repository.createPpeIssueBatch(draft.id, {
        expectedVersion: draft.version ?? 0,
        lines: issueLines.map((line) => ({ brandModelArticle: line.brandModelArticle, cardNormRowId: line.cardNormRowId, issueMethod: line.issueMethod, issuedAt: toApiDate(line.issuedAt), itemId: line.itemId, quantity: line.quantity, unitPriceMinor: line.unitPriceMinor })),
      });
      setDraft(saved); setCommitted(true); clearPpeIssueWorkflowCache();
      onNotify(`Документ выдачи сохранён: ${issueLines.length} позиций`);
    } catch (reason) { setError(messageOf(reason, "Не удалось сохранить выдачу")); }
    finally { endSaving(); }
  }

  function handlePrint(data: PrintData, mode: PrintMode) {
    if (printingRef.current) return;
    printingRef.current = true;
    setPrinting(true);
    try {
      printDocument(data, mode);
    } finally {
      window.setTimeout(() => {
        printingRef.current = false;
        setPrinting(false);
      }, 1200);
    }
  }
  async function download(format: "pdf" | "docx") {
    if (!draft || downloadRef.current) return;
    downloadRef.current = format;
    setDownloadFormat(format);
    try { const file = await repository.printPpeCard(draft.id, printMode === "sheet" ? "sheet" : "card", format); saveApiFile(file); onNotify(`${format.toUpperCase()} сформирован`); }
    catch (reason) { setError(messageOf(reason, `Не удалось сформировать ${format.toUpperCase()}`)); }
    finally { downloadRef.current = null; setDownloadFormat(null); }
  }

  return <section className="ppe-issue-workflow">
    <header className="ppe-issue-workflow-head"><div><span className="ppe-issue-eyebrow">СИЗ · оформление выдачи</span><h1>Документ выдачи СИЗ</h1><p>Сформируйте выдачу поэтапно: сотрудник → подбор → проверка → печать.</p></div><div className="ppe-issue-head-actions"><span className={committed ? "ppe-issue-save-state is-done" : "ppe-issue-save-state"}>{committed ? <><CheckCircle2 size={15} /> Сохранено</> : draft ? "Черновик сохранён" : "Новый документ"}</span><PpeButton disabled={saving || Boolean(downloadFormat) || printing} onClick={() => onNavigate("inventory-ppe")} variant="ghost">К карточкам</PpeButton></div></header>
    <ol aria-label="Этапы оформления выдачи" className="ppe-issue-stepper">{[[1, "Сотрудник", "Документ и владелец"], [2, "Подбор СИЗ", "Норма и каталог"], [3, "Состав", "Проверка строк"], [4, "Печать", "Лист выдачи"]].map(([value, title, description]) => { const numeric = value as WorkflowStep; return <li className={`${step === numeric ? "is-current" : ""} ${step > numeric ? "is-complete" : ""}`} key={numeric}><button disabled={saving || Boolean(downloadFormat) || printing || numeric > step || (!draft && numeric > 1)} onClick={() => setStep(numeric)} type="button"><span>{step > numeric ? <Check size={15} /> : numeric}</span><strong>{title}</strong><small>{description}</small></button></li>; })}</ol>
    {error ? <div className="ppe-issue-error" role="alert"><X size={17} />{error}</div> : null}
    {step === 1 ? <EmployeeDocumentStep basis={basis} details={employeeDetails} draftExists={Boolean(draft)} employee={selectedEmployee} employees={employees} employeeId={employeeId} issueDate={issueDate} issueType={issueType} loading={loadingEmployees || loadingWorkspace} onBasisChange={setBasis} onDetailsChange={patchEmployeeDetails} onEmployeeChange={setEmployeeId} onIssueDateChange={setIssueDate} onIssueTypeChange={setIssueType} onQueryChange={setQuery} query={query} responsible={responsible} onResponsibleChange={setResponsible} source={source} sourceReady={Boolean(workspace?.activeNormSet)} onSourceChange={setSource} onContinue={() => void saveDocumentDraft()} saving={saving} /> : null}
    {step === 2 ? <SelectionStep categories={categories} issueLines={issueLines} itemRows={itemRows} loadingItems={saving} onAddCatalog={() => void addCatalogRow()} onApplySet={applySet} onOpenCatalog={setMappingRow} onRemoveExtra={(id) => void removeExtraRow(id)} onSelectAll={selectAllMapped} onToggle={toggleRow} selectionTab={selectionTab} setSelectionTab={setSelectionTab} settings={settings} settingsError={settingsError} onRetrySettings={() => setSettingsReloadToken((value) => value + 1)} /> : null}
    {step === 3 ? <CompositionStep issueLines={issueLines} onChange={patchIssueLine} onOpenCatalog={setMappingRow} onRemove={removeIssueLine} rows={rows} selectedEmployee={selectedEmployee} /> : null}
    {step === 4 ? <PrintStep committed={committed} data={printData} errors={blockingErrors} mode={printMode} downloadFormat={downloadFormat} onDownload={(format) => void download(format)} onModeChange={setPrintMode} onPreview={() => setPreviewOpen(true)} onPrint={() => handlePrint(printData, printMode)} printBusy={printing} onSave={() => void commitIssue()} saving={saving} /> : null}
    <footer className="ppe-issue-workflow-footer"><PpeButton disabled={step === 1 || saving || Boolean(downloadFormat) || printing} icon={<ArrowLeft size={16} />} onClick={() => setStep((current) => Math.max(1, current - 1) as WorkflowStep)} variant="secondary">Назад</PpeButton><span>{step} из 4</span>{step === 2 ? <PpeButton disabled={saving || Boolean(downloadFormat) || printing} icon={<ArrowRight size={16} />} onClick={goToComposition} variant="primary">К составу</PpeButton> : null}{step === 3 ? <PpeButton disabled={saving || Boolean(downloadFormat) || printing} icon={<ArrowRight size={16} />} onClick={goToPrint} variant="primary">Предпросмотр печати</PpeButton> : null}{step === 4 && committed ? <PpeButton icon={<ArrowRight size={16} />} onClick={() => onNavigate("inventory-ppe")} variant="primary">Открыть карточку</PpeButton> : null}</footer>
    {mappingRow ? <PpeCatalogModal allowMultiple={!mappingRow.sourceNormRowId} normRow={mappingRow} onClose={() => setMappingRow(null)} onConfirm={saveMapping} /> : null}
    {previewOpen ? <PrintPreviewModal data={printData} mode={printMode} onClose={() => setPreviewOpen(false)} onModeChange={setPrintMode} onPrint={handlePrint} printing={printing} /> : null}
  </section>;
}

function collectBlockingErrors({ basis, issueDate, issueLines, responsible, rows }: { basis: string; issueDate: string; issueLines: PpeIssueDraftLine[]; responsible: string; rows: InventoryPpeCardNormRowDto[] }) {
  const errors: string[] = [];
  if (!responsible.trim()) errors.push("Не указан ответственный");
  if (!basis.trim()) errors.push("Не указано основание выдачи");
  if (!issueDate) errors.push("Не указана дата выдачи");
  if (!issueLines.length) errors.push("Не выбраны позиции выдачи");
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  for (const line of issueLines) for (const problem of validateIssueDraftLine(line, rowsById.get(line.cardNormRowId))) if (problem.level === "error") errors.push(`${rowsById.get(line.cardNormRowId)?.normItemName ?? "Позиция"}: ${problem.text}`);
  return Array.from(new Set(errors));
}

function buildPrintData({ cardId, employee, employeeDetails, issueLines, rows }: { cardId?: string; employee: InventoryEmployeeDto | null; employeeDetails: PpeEmployeeCardDetails; issueLines: PpeIssueDraftLine[]; rows: InventoryPpeCardNormRowDto[] }): PrintData {
  const linesByRow = new Map(issueLines.map((line) => [line.cardNormRowId, line]));
  const wizardLines: PpeWizardLine[] = rows.map((row) => {
    const issue = linesByRow.get(row.id);
    return {
      brandModelArticle: issue?.brandModelArticle ?? row.brandModelArticle,
      catalogName: row.mappedItemName || row.normItemName,
      dueAt: "",
      issueMethod: issue?.issueMethod,
      issuePeriodText: row.issuePeriodText,
      issuedAt: issue?.issuedAt ?? "",
      isSectionTitle: row.rowType === "group",
      item: toItemFromNorm({ id: row.mappedItemId || row.id, itemId: row.mappedItemId || row.id, itemName: row.mappedItemName || row.normItemName, lifeMonths: row.lifeMonths, normItemName: row.normItemName, normPoint: row.normPoint, quantity: row.quantity, quantityText: row.quantityText, positionName: "" }),
      normPoint: row.normPoint,
      priceText: row.defaultUnitPriceMinor ? String(row.defaultUnitPriceMinor / 100) : "0",
      printItemName: row.normItemName,
      quantityText: row.rowType === "group" ? "" : String(issue?.quantity ?? (row.quantity || 1)),
      status: issue ? "issued" : "not_issued",
      warehouseId: "",
    };
  });
  const wizard: PpeWizardState = { cardId, comment: "", employeeDetails, employeeId: employee?.id ?? "", lines: wizardLines, mode: "create", step: 3 };
  return printDataFromWizard(wizard, employee);
}

function createExtraGroup(sortOrder: number): InventoryPpeCardNormRowDto { return { brandModelArticle: "", coverageStatus: "not_issued", defaultUnitPriceMinor: null, id: createClientUuid(), issuePeriodText: "", issuedQuantity: 0, lifeMonths: null, mappedItemId: null, mappedItemName: "", mappings: [], normItemName: "Дополнительная выдача", normPoint: "", parentRowId: null, quantity: 0, quantityText: "", rowType: "group", sortOrder, sourceNormRowId: null }; }
function createExtraRow(parentRowId: string, sortOrder: number): InventoryPpeCardNormRowDto { return { brandModelArticle: "", coverageStatus: "not_issued", defaultUnitPriceMinor: null, id: createClientUuid(), issuePeriodText: "Дополнительная выдача", issuedQuantity: 0, lifeMonths: null, mappedItemId: null, mappedItemName: "", mappings: [], normItemName: "Дополнительное СИЗ", normPoint: "Дополнительная выдача", parentRowId, quantity: 1, quantityText: "1 шт.", rowType: "item", sortOrder, sourceNormRowId: null }; }
function toNormPayload(row: InventoryPpeCardNormRowDto) { return { brandModelArticle: row.brandModelArticle, defaultUnitPriceMinor: row.defaultUnitPriceMinor, id: row.id, issuePeriodText: row.issuePeriodText, lifeMonths: row.lifeMonths, mappedItemId: row.mappedItemId, normItemName: row.normItemName, normPoint: row.normPoint, parentRowId: row.parentRowId, quantity: row.quantity, quantityText: row.quantityText, rowType: row.rowType, sortOrder: row.sortOrder, sourceNormRowId: row.sourceNormRowId }; }
function toApiEmployeeDetails(details: PpeEmployeeCardDetails) { return { clothingSize: details.clothingSize ?? "", gender: details.gender ?? "", handProtectionSize: details.handProtectionSize ?? "", headSize: details.headSize ?? "", height: details.height ?? "", respiratorSize: details.respiratorSize ?? "", shoeSize: details.shoeSize ?? "" }; }
function toApiDate(value: string) { return new Date(`${value}T12:00:00`).toISOString(); }
function messageOf(value: unknown, fallback: string) { return value instanceof Error ? value.message : fallback; }
