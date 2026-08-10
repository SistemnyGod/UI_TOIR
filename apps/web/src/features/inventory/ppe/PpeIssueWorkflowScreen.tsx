import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, X } from "lucide-react";
import type {
  InventoryEmployeeDto,
  InventoryItemDto,
  InventoryItemSetDetailDto,
  InventoryPpeCardDetailDto,
  InventoryPpeCardNormRowDto,
  InventoryPpeNormCandidateDto,
  InventorySettingsDto,
} from "../../../api/contracts";
import type { ScreenId } from "../../../types";
import { useInventoryRepository } from "../../../repositories/inventoryRepositoryContext";
import { createClientUuid } from "../../../shared/clientUuid";
import { printDataFromWizard, saveApiFile } from "./ppeCommon";
import { PpeButton } from "./PpeUi";
import { PpeCatalogModal, type PpeCatalogSelection as PpeCatalogMappingSelection } from "./PpeCatalogModal";
import { PpeCatalogPicker, type PpeCatalogSelection } from "./PpeCatalogPicker";
import { PpeNormSelectionModal, type PpeNormConfirmationOptions } from "./PpeNormSelectionModal";
import {
  applyItemSetToDraft,
  clearPpeIssueWorkflowCache,
  createIssueDraftLine,
  getPpeIssueWorkflowStorageKey,
  mergeIssueDraftLine,
  readPpeIssueWorkflowCache,
  validateIssueDraftLine,
  writePpeIssueWorkflowCache,
  type PpeIssueDraftLine,
  type PpeSelectedCatalogItem,
} from "./ppeIssueDraft";
import {
  CompositionStep,
  EmployeeDocumentStep,
  PrintStep,
  SelectionStep,
  type PpeAutoMatchSummary,
  type DraftSource,
  type IssueType,
  type SelectionTab,
} from "./PpeIssueWorkflowSteps";
import { PrintPreviewModal, printDocument } from "./ppePrint";
import type { PpeEmployeeCardDetails, PpeWizardLine, PpeWizardState, PrintData, PrintMode } from "./ppeTypes";
import { toItemFromNorm } from "./ppePrintMapping";
import { savePpeNormSettingsIntent } from "./ppeNormSettingsIntent";
import "../styles/ppe-issue-workflow.css";
import "../styles/ppe-ui-system.css";

type WorkflowStep = 1 | 2 | 3 | 4;

function getLocalDateInputValue(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const today = getLocalDateInputValue();
const emptyEmployeeDetails: PpeEmployeeCardDetails = {
  clothingSize: "", gender: "", handProtectionSize: "", headSize: "", height: "", respiratorSize: "", shoeSize: "",
};

export function PpeIssueWorkflowScreen({ onNavigate, onNotify, currentUserId = "anonymous" }: { onNavigate: (screen: ScreenId) => void; onNotify: (message: string) => void; currentUserId?: string }) {
  const repository = useInventoryRepository();
  const [cache] = useState(() => readPpeIssueWorkflowCache(currentUserId));
  const storedPpeEmployeeId = window.localStorage.getItem("patrol360.inventory.ppe.employee")
    ?? window.localStorage.getItem(getPpeIssueWorkflowStorageKey(currentUserId) + ".employee")
    ?? "";
  const activeCache = cache?.employeeId && storedPpeEmployeeId && cache.employeeId !== storedPpeEmployeeId ? null : cache;
  const restoreStarted = useRef(false);
  const [query, setQuery] = useState("");
  const [employees, setEmployees] = useState<InventoryEmployeeDto[]>([]);
  const [employeeId, setEmployeeId] = useState(activeCache?.employeeId ?? storedPpeEmployeeId);
  const [employeeDetails, setEmployeeDetails] = useState<PpeEmployeeCardDetails>(emptyEmployeeDetails);
  const [issueDate, setIssueDate] = useState(activeCache?.issueDate ?? today);
  const [issueType, setIssueType] = useState<IssueType>(activeCache?.issueType ?? "planned");
  const [responsible, setResponsible] = useState(activeCache?.responsibleName ?? "");
  const [basis, setBasis] = useState(activeCache?.basis ?? "Приказ № 882н");
  const [source, setSource] = useState<DraftSource>(activeCache?.source ?? "empty");
  const [step, setStep] = useState<WorkflowStep>(activeCache?.step ?? 1);
  const [selectionTab, setSelectionTab] = useState<SelectionTab>("catalog");
  const [draft, setDraft] = useState<InventoryPpeCardDetailDto | null>(null);
  const [workspace, setWorkspace] = useState<{ employee: InventoryEmployeeDto; activeNormSet: { positionName: string; versionName: string; sourceName: string; rowsCount: number } | null } | null>(null);
  const [rows, setRows] = useState<InventoryPpeCardNormRowDto[]>([]);
  const [issueLines, setIssueLines] = useState<PpeIssueDraftLine[]>(activeCache?.issueLines ?? []);
  const [selectedCatalogItems, setSelectedCatalogItems] = useState<PpeSelectedCatalogItem[]>(activeCache?.selectedCatalogItems ?? []);
  const [settings, setSettings] = useState<InventorySettingsDto | null>(null);
  const [settingsError, setSettingsError] = useState("");
  const [settingsReloadToken, setSettingsReloadToken] = useState(0);
  const [mappingRow, setMappingRow] = useState<InventoryPpeCardNormRowDto | null>(null);
  const [catalogPickerOpen, setCatalogPickerOpen] = useState(false);
  const [replacementSelectionId, setReplacementSelectionId] = useState<string | null>(null);
  const [candidateItem, setCandidateItem] = useState<InventoryItemDto | null>(null);
  const [candidateSelectionId, setCandidateSelectionId] = useState<string | null>(null);
  const [normCandidates, setNormCandidates] = useState<InventoryPpeNormCandidateDto[]>([]);
  const [candidateLoading, setCandidateLoading] = useState(false);
  const [candidateError, setCandidateError] = useState("");
  const [autoMatching, setAutoMatching] = useState(false);
  const [autoMatchSummary, setAutoMatchSummary] = useState<PpeAutoMatchSummary | null>(null);
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
  const compositionSaveTimer = useRef<number | null>(null);
  const compositionSaveBusy = useRef(false);
  const lastCompositionSignature = useRef("");
  const issueBatchKey = useRef(activeCache?.idempotencyKey ?? createClientUuid());

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoadingEmployees(true);
      void (async () => {
        try {
          const all: InventoryEmployeeDto[] = [];
          let page = 1;
          let pageCount = 1;
          do {
            const result = await repository.getEmployees({ page, pageSize: 100, query, status: "active" }, { signal: controller.signal });
            all.push(...result.rows);
            pageCount = result.pageCount;
            page += 1;
          } while (page <= pageCount && !controller.signal.aborted);
          if (controller.signal.aborted) return;
          setEmployees(all);
          if (all[0]) setEmployeeId((current) => current || all[0].id);
        } catch (reason) {
          if (!controller.signal.aborted) setError(messageOf(reason, "Не удалось загрузить сотрудников"));
        } finally {
          if (!controller.signal.aborted) setLoadingEmployees(false);
        }
      })();
    }, 300);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, repository]);
  useEffect(() => {
    let cancelled = false;
    setSettingsError("");
    repository.getSettings().then((result) => { if (!cancelled) { setSettings(result); const defaultWarehouseId = result.warehouses.find((warehouse) => warehouse.isActive)?.id ?? null; if (defaultWarehouseId) setIssueLines((current) => current.map((line) => line.warehouseId ? line : { ...line, warehouseId: defaultWarehouseId })); } }).catch((reason) => { if (!cancelled) setSettingsError(messageOf(reason, "Не удалось загрузить наборы СИЗ")); });
    return () => { cancelled = true; };
  }, [repository, settingsReloadToken]);

  useEffect(() => {
    const defaultWarehouseId = settings?.warehouses.find((warehouse) => warehouse.isActive)?.id ?? null;
    if (!defaultWarehouseId) return;
    setIssueLines((current) => {
      const next = current.map((line) => line.warehouseId ? line : { ...line, warehouseId: defaultWarehouseId });
      return next.some((line, index) => line !== current[index]) ? next : current;
    });
  }, [issueLines, settings]);
  useEffect(() => {
    if (!activeCache?.draftId || restoreStarted.current) return;
    restoreStarted.current = true;
    setLoadingWorkspace(true);
    repository.getPpeCard(activeCache.draftId)
      .then((restored) => {
        setDraft(restored);
        const restoredRows = [...(restored.normRows ?? [])].sort((left, right) => left.sortOrder - right.sortOrder);
        setRows(restoredRows);
        setEmployeeDetails({ ...emptyEmployeeDetails, ...restored.employeeDetails });
        setIssueType(restored.issueType ?? activeCache.issueType);
        setResponsible(restored.responsibleName ?? activeCache.responsibleName);
        setBasis(restored.basis ?? activeCache.basis);
      })
      .catch(() => { clearPpeIssueWorkflowCache(currentUserId); setStep(1); setIssueLines([]); })
      .finally(() => setLoadingWorkspace(false));
  }, [activeCache, repository]);

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
    writePpeIssueWorkflowCache({ basis, draftId: draft?.id, employeeId, idempotencyKey: issueBatchKey.current, issueDate, issueLines, issueType, responsibleName: responsible, selectedCatalogItems, source, step }, currentUserId);
  }, [basis, committed, currentUserId, draft?.id, employeeId, issueDate, issueLines, issueType, responsible, selectedCatalogItems, source, step]);

  useEffect(() => {
    if (!draft || committed || savingRef.current) return;
    const signature = JSON.stringify(issueLines.map((line) => [line.cardNormRowId, line.issuedAt, line.quantity, line.unitPriceMinor, line.issueMethod, line.sizeText, line.warehouseId, line.comment]));
    if (signature === lastCompositionSignature.current) return;
    if (compositionSaveTimer.current !== null) window.clearTimeout(compositionSaveTimer.current);
    compositionSaveTimer.current = window.setTimeout(() => {
      if (savingRef.current || compositionSaveBusy.current) return;
      compositionSaveBusy.current = true;
      lastCompositionSignature.current = signature;
      const lineByRow = new Map(issueLines.map((line) => [line.cardNormRowId, line]));
      const nextRows = rows.map((row) => {
        const line = lineByRow.get(row.id);
        if (row.rowType !== "item") return row;
        if (!line) return { ...row, draftIssuedAt: null, draftQuantity: null, draftUnitPriceMinor: null, draftIssueMethod: "personal" as const, draftSizeText: "", draftWarehouseId: null, draftComment: "", draftBrandModelArticle: "" };
        return { ...row, draftIssuedAt: toApiDate(line.issuedAt), draftQuantity: line.quantity, draftUnitPriceMinor: line.unitPriceMinor, draftIssueMethod: line.issueMethod, draftSizeText: line.sizeText, draftWarehouseId: line.warehouseId, draftComment: line.comment, draftBrandModelArticle: line.brandModelArticle };
      });
      void repository.updatePpeCardNormRows(draft.id, { expectedVersion: draft.version ?? 0, rows: nextRows.map(toNormPayload) })
        .then((saved) => { setDraft(saved); setRows([...(saved.normRows ?? nextRows)].sort((left, right) => left.sortOrder - right.sortOrder)); })
        .catch((reason) => { lastCompositionSignature.current = ""; setError(messageOf(reason, "Не удалось сохранить состав черновика")); })
        .finally(() => { compositionSaveBusy.current = false; });
    }, 500);
    return () => { if (compositionSaveTimer.current !== null) window.clearTimeout(compositionSaveTimer.current); };
  }, [committed, draft, issueLines, repository, rows]);

  const selectedEmployee = useMemo(() => employees.find((employee) => employee.id === employeeId) ?? workspace?.employee ?? null, [employeeId, employees, workspace?.employee]);
  const itemRows = useMemo(() => rows.filter((row) => row.rowType === "item"), [rows]);
  const categories = useMemo(() => {
    const groups = rows.filter((row) => row.rowType === "group");
    return groups.length ? groups : [{ id: "base", normItemName: "Базовая выдача", rowType: "group" as const } as InventoryPpeCardNormRowDto];
  }, [rows]);
  const printData = useMemo(() => buildPrintData({ cardId: draft?.id, employee: selectedEmployee, employeeDetails, issueLines, rows }), [draft?.id, employeeDetails, issueLines, rows, selectedEmployee]);
  const blockingErrors = useMemo(() => collectBlockingErrors({ basis, issueDate, issueLines, responsible, rows, selectedCatalogItems }), [basis, issueDate, issueLines, responsible, rows, selectedCatalogItems]);

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
      window.localStorage.setItem(getPpeIssueWorkflowStorageKey(currentUserId) + ".employee", employeeId);
      setStep(2);
      onNotify(draft ? "Реквизиты черновика сохранены" : "Черновик документа выдачи подготовлен");
    } catch (reason) { setError(messageOf(reason, "Не удалось сохранить черновик")); }
    finally { endSaving(); }
  }

  async function saveMapping(selections: PpeCatalogMappingSelection[]) {
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

  function selectCatalogItems(selections: PpeCatalogSelection[]) {
    if (!draft) return;
    const selection = selections[0];
    if (!selection) return;
    if (replacementSelectionId) {
      const previous = selectedCatalogItems.find((row) => row.localId === replacementSelectionId);
      if (previous) {
        setIssueLines((current) => previous.normRowId ? current.filter((line) => line.cardNormRowId !== previous.normRowId) : current);
        setRows((current) => previous.normRowId
          ? current.map((row) => row.id === previous.normRowId ? { ...row, mappedItemId: null, mappedItemName: "", brandModelArticle: "", defaultUnitPriceMinor: null } : row)
          : current);
        setSelectedCatalogItems((current) => current.map((row) => row.localId === replacementSelectionId ? {
          ...row,
          brandModelArticle: selection.brandModelArticle,
          comment: selection.comment,
          item: selection.item,
          mappingId: null,
          saveMappingOnSuccess: false,
          makeDefaultMapping: false,
          normReasons: [],
          normWarnings: [],
          normResolutionStatus: "unresolved",
          normRowId: null,
          quantity: selection.quantity,
          sizeText: selection.sizeText,
          unitPriceMinor: selection.unitPriceMinor,
          warehouseId: selection.warehouseId,
        } : row));
        setReplacementSelectionId(null);
        setCatalogPickerOpen(false);
        setSelectionTab("selected");
        onNotify("Товар заменён. Норму нужно подтвердить заново");
        return;
      }
      setReplacementSelectionId(null);
    }
    const existingItemIds = new Set(selectedCatalogItems.map((row) => row.item.id));
    const additions = selections
      .filter((candidate) => !existingItemIds.has(candidate.item.id))
      .map((candidate): PpeSelectedCatalogItem => ({
        brandModelArticle: candidate.brandModelArticle,
        comment: candidate.comment,
        item: candidate.item,
        localId: createClientUuid(),
        mappingId: null,
        saveMappingOnSuccess: false,
        makeDefaultMapping: false,
        normReasons: [],
        normWarnings: [],
        normResolutionStatus: "unresolved",
        normRowId: null,
        quantity: candidate.quantity,
        sizeText: candidate.sizeText,
        unitPriceMinor: candidate.unitPriceMinor,
        warehouseId: candidate.warehouseId,
      }));
    setSelectedCatalogItems((current) => [...current, ...additions]);
    setCatalogPickerOpen(false);
    setSelectionTab("selected");
    onNotify(additions.length > 1
      ? `Добавлено позиций: ${additions.length}. Теперь подберите нормы АТОМ для нужных строк.`
      : additions.length === 1
        ? "Позиция сохранена. Теперь подберите и вручную подтвердите норму АТОМ"
        : "Выбранные позиции уже есть в документе");
  }

  function replaceSelectedCatalogItem(item: PpeSelectedCatalogItem) {
    setReplacementSelectionId(item.localId);
    setCatalogPickerOpen(true);
  }

  async function openNormCandidatesForSelection(selection: PpeSelectedCatalogItem) {
    if (!draft || candidateLoading) return;
    setCandidateSelectionId(selection.localId);
    setCandidateItem(selection.item);
    setCandidateLoading(true);
    setCandidateError("");
    try {
      setNormCandidates(await repository.getPpeNormCandidates(selection.item.id, { employeeId, issueDate, quantity: selection.quantity }));
    } catch (reason) {
      setNormCandidates([]);
      setCandidateError(messageOf(reason, "Не удалось загрузить подходящие нормы АТОМ"));
    } finally {
      setCandidateLoading(false);
    }
  }

  async function autoMatchSelectedCatalogItems() {
    const pending = selectedCatalogItems.filter((item) => item.normResolutionStatus !== "confirmed" && item.normResolutionStatus !== "additional");
    if (!draft || !employeeId || !pending.length || autoMatching) return;
    setAutoMatching(true);
    setError("");
    try {
      const result = await repository.getPpeNormCandidatesBatch({
        employeeId,
        issueDate,
        items: pending.map((item) => ({ selectionId: item.localId, itemId: item.item.id, quantity: item.quantity })),
      });
      const resultBySelection = new Map(result.items.map((item) => [item.selectionId, item]));
      const confirmed = result.items.filter((item) => item.resolution === "confirmed" && item.candidate);
      let nextRows = [...rows];
      const issueLinesToAdd: PpeIssueDraftLine[] = [];
      const savedRowIdsByNormId = new Map<string, string>();
      for (const match of confirmed) {
        const selected = pending.find((item) => item.localId === match.selectionId);
        const candidate = match.candidate;
        if (!selected || !candidate) continue;
        const existing = nextRows.find((row) => row.id === candidate.normRowId || row.sourceNormRowId === candidate.normRowId);
        const source = existing ?? {
          brandModelArticle: "",
          coverageStatus: "not_issued" as const,
          defaultUnitPriceMinor: selected.unitPriceMinor ?? selected.item.defaultUnitPriceMinor ?? null,
          id: createClientUuid(),
          issuePeriodText: candidate.issuePeriodText,
          issuedQuantity: candidate.alreadyIssuedQuantity,
          lifeMonths: candidate.lifeMonths,
          mappedItemId: null,
          mappedItemName: "",
          mappings: [],
          normItemName: candidate.normItemName,
          normPoint: candidate.normPoint,
          parentRowId: null,
          quantity: candidate.quantity,
          quantityText: candidate.quantityText,
          rowType: "item" as const,
          sortOrder: candidate.sortOrder ?? rows.length,
          sourceNormRowId: candidate.normRowId,
        };
        const mappedRow: InventoryPpeCardNormRowDto = {
          ...source,
          brandModelArticle: selected.brandModelArticle?.trim() || [selected.item.brandName, selected.item.modelName, selected.item.article, selected.item.protectionClass].filter(Boolean).join(" · "),
          defaultUnitPriceMinor: selected.unitPriceMinor ?? selected.item.defaultUnitPriceMinor ?? source.defaultUnitPriceMinor,
          mappedItemId: selected.item.id,
          mappedItemName: selected.item.name,
          quantity: candidate.quantity,
          quantityText: candidate.quantityText || `${candidate.quantity} ${selected.item.unit || "шт."}`,
          sortOrder: candidate.sortOrder ?? rows.length,
        };
        nextRows = existing
          ? nextRows.map((row) => row.id === existing.id ? mappedRow : row)
          : [...nextRows, mappedRow];
      }

      if (confirmed.length) {
        nextRows = nextRows
          .map((row, index) => ({ ...row, sortOrder: row.sourceNormRowId ? (result.items.find((item) => item.candidate?.normRowId === row.sourceNormRowId)?.candidate?.sortOrder ?? row.sortOrder) : index }))
          .sort((left, right) => left.sortOrder - right.sortOrder || left.normItemName.localeCompare(right.normItemName, "ru"))
          .map((row, index) => ({ ...row, sortOrder: index }));
        const saved = await repository.updatePpeCardNormRows(draft.id, { expectedVersion: draft.version ?? 0, rows: nextRows.map(toNormPayload) });
        const savedRows = [...(saved.normRows ?? nextRows)].sort((left, right) => left.sortOrder - right.sortOrder);
        for (const match of confirmed) {
          const selected = pending.find((item) => item.localId === match.selectionId);
          const candidate = match.candidate;
          const savedRow = selected && candidate ? savedRows.find((row) => row.sourceNormRowId === candidate.normRowId) : null;
          if (!selected || !candidate || !savedRow) continue;
          savedRowIdsByNormId.set(candidate.normRowId, savedRow.id);
          const created = createIssueDraftLine(savedRow, issueDate, selected.quantity);
          if (created) issueLinesToAdd.push({ ...created, comment: selected.comment, sizeText: selected.sizeText, unitPriceMinor: selected.unitPriceMinor ?? created.unitPriceMinor, warehouseId: selected.warehouseId });
        }
        setDraft(saved);
        setRows(savedRows);
      }
      if (issueLinesToAdd.length) setIssueLines((current) => issueLinesToAdd.reduce((next, line) => next.some((item) => item.cardNormRowId === line.cardNormRowId) ? next : [...next, line], current));
      setSelectedCatalogItems((current) => current.map((item) => {
        const match = resultBySelection.get(item.localId);
        if (!match) return item;
        if (match.resolution === "confirmed" && match.candidate) return {
          ...item,
          mappingId: match.candidate.mappingId,
          makeDefaultMapping: false,
          normReasons: match.reasons,
          normWarnings: match.warnings,
          normResolutionStatus: "confirmed",
          normRowId: savedRowIdsByNormId.get(match.candidate.normRowId) ?? match.candidate.normRowId,
          saveMappingOnSuccess: !match.candidate.mappingId,
        };
        if (match.resolution === "review_required") return { ...item, normReasons: match.reasons, normWarnings: match.warnings, normResolutionStatus: "review_required" };
        return { ...item, normReasons: match.reasons, normWarnings: match.warnings, normResolutionStatus: "additional_pending" };
      }));
      const summary = {
        confirmed: result.items.filter((item) => item.resolution === "confirmed").length,
        reviewRequired: result.items.filter((item) => item.resolution === "review_required").length,
        unmatched: result.items.filter((item) => item.resolution === "unmatched").length,
      } satisfies PpeAutoMatchSummary;
      setAutoMatchSummary(summary);
      const normSetMessage = result.normSetStatus === "norm_set_requires_review"
        ? "Опубликованный набор норм требует проверки"
        : result.normSetStatus === "norm_set_missing"
          ? "Для должности не найден опубликованный набор норм"
          : "";
      onNotify(`Автоподбор завершён: сопоставлено ${summary.confirmed}, требуют проверки ${summary.reviewRequired}, не определено ${summary.unmatched}${normSetMessage ? `. ${normSetMessage}` : ""}`);
    } catch (reason) {
      setError(messageOf(reason, "Не удалось выполнить пакетный подбор норм АТОМ"));
    } finally {
      setAutoMatching(false);
    }
  }

  function openNormSettingsForSelectedEmployee() {
    const position = selectedEmployee?.position?.trim();
    if (!position) {
      onNotify("У выбранного сотрудника не указана должность — открыть нормы по должности невозможно");
      return;
    }
    savePpeNormSettingsIntent(position);
    setCandidateItem(null);
    setCandidateSelectionId(null);
    setNormCandidates([]);
    onNavigate("inventory-settings");
  }

  async function confirmCatalogCandidate(candidate: InventoryPpeNormCandidateDto, options: PpeNormConfirmationOptions) {
    const selectedCatalog = selectedCatalogItems.find((row) => row.localId === candidateSelectionId);
    if (!draft || !candidateItem || !selectedCatalog) return;
    if (!beginSaving()) return;
    setError("");
    try {
      const model = selectedCatalog.brandModelArticle?.trim() || [candidateItem.brandName, candidateItem.modelName, candidateItem.article, candidateItem.protectionClass].filter(Boolean).join(" · ");
      const existing = rows.find((row) => row.id === candidate.normRowId || row.sourceNormRowId === candidate.normRowId);
      const source = existing ?? {
        brandModelArticle: "",
        coverageStatus: "not_issued" as const,
        defaultUnitPriceMinor: selectedCatalog.unitPriceMinor ?? candidateItem.defaultUnitPriceMinor ?? null,
        id: createClientUuid(),
        issuePeriodText: candidate.issuePeriodText,
        issuedQuantity: candidate.alreadyIssuedQuantity,
        lifeMonths: candidate.lifeMonths,
        mappedItemId: null,
        mappedItemName: "",
        mappings: [],
        normItemName: candidate.normItemName,
        normPoint: candidate.normPoint,
        parentRowId: null,
        quantity: candidate.quantity,
        quantityText: candidate.quantityText,
        rowType: "item" as const,
        sortOrder: rows.length,
        sourceNormRowId: candidate.normRowId,
      };
      const mappedRow: InventoryPpeCardNormRowDto = {
        ...source,
        brandModelArticle: model,
        defaultUnitPriceMinor: selectedCatalog.unitPriceMinor ?? candidateItem.defaultUnitPriceMinor ?? source.defaultUnitPriceMinor,
        mappedItemId: candidateItem.id,
        mappedItemName: candidateItem.name,
        quantity: candidate.quantity,
        quantityText: candidate.quantityText || `${candidate.quantity} ${candidateItem.unit || "шт."}`,
      };
      const nextRows = (existing ? rows.map((row) => row.id === existing.id ? mappedRow : row) : [...rows, mappedRow])
        .map((row, index) => ({ ...row, sortOrder: index }));
      const saved = await repository.updatePpeCardNormRows(draft.id, { expectedVersion: draft.version ?? 0, rows: nextRows.map(toNormPayload) });
      const savedRows = [...(saved.normRows ?? nextRows)].sort((left, right) => left.sortOrder - right.sortOrder);
      const savedRow = savedRows.find((row) => row.id === mappedRow.id || row.sourceNormRowId === candidate.normRowId) ?? mappedRow;
      const createdBase = createIssueDraftLine(savedRow, issueDate, selectedCatalog.quantity);
      const created = createdBase ? {
        ...createdBase,
        comment: selectedCatalog.comment,
        sizeText: selectedCatalog.sizeText,
        unitPriceMinor: selectedCatalog.unitPriceMinor ?? createdBase.unitPriceMinor,
        warehouseId: selectedCatalog.warehouseId,
      } : null;
      setDraft(saved);
      setRows(savedRows);
      if (created) setIssueLines((current) => current.some((line) => line.cardNormRowId === savedRow.id) ? current : [...current, created]);
      setSelectedCatalogItems((current) => current.map((row) => row.localId === selectedCatalog.localId ? {
        ...row,
        mappingId: candidate.mappingId,
        makeDefaultMapping: options.saveMapping ? options.makeDefault : false,
        normResolutionStatus: "confirmed",
        normRowId: savedRow.id,
        saveMappingOnSuccess: options.saveMapping,
        normReasons: candidate.reasons,
        normWarnings: candidate.warnings,
      } : row));
      setCandidateItem(null);
      setCandidateSelectionId(null);
      setNormCandidates([]);
      onNotify(options.saveMapping ? "Позиция сопоставлена. Правило будет сохранено после успешной выдачи" : "Позиция сопоставлена с нормой только для этой выдачи");
    } catch (reason) {
      setError(messageOf(reason, "Не удалось подтвердить норму АТОМ"));
    } finally {
      endSaving();
    }
  }

  async function addCatalogItemAsAdditional(reason = "") {
    const selectedCatalogSource = selectedCatalogItems.find((row) => row.localId === candidateSelectionId);
    const normalizedReason = reason.trim();
    const selectedCatalog = selectedCatalogSource && normalizedReason
      ? { ...selectedCatalogSource, comment: normalizedReason }
      : selectedCatalogSource;
    if (selectedCatalog && !selectedCatalog.comment.trim()) {
      setError("Для дополнительной выдачи укажите причину в комментарии выбранной позиции");
      return;
    }
    if (!basis.trim() || !responsible.trim()) {
      setError("Для дополнительной выдачи нужны основание и ответственное лицо");
      return;
    }
    if (!draft || !candidateItem || !selectedCatalog || !beginSaving()) return;
    setError("");
    try {
      const existingGroup = rows.find((row) => row.rowType === "group" && row.normItemName === "Дополнительная выдача");
      const group = existingGroup ?? createExtraGroup(rows.length);
      const row = {
        ...createExtraRow(group.id, rows.length + (existingGroup ? 0 : 1)),
        brandModelArticle: selectedCatalog.brandModelArticle?.trim() || [candidateItem.brandName, candidateItem.modelName, candidateItem.article].filter(Boolean).join(" · "),
        defaultUnitPriceMinor: selectedCatalog.unitPriceMinor ?? candidateItem.defaultUnitPriceMinor ?? null,
        mappedItemId: candidateItem.id,
        mappedItemName: candidateItem.name,
        quantity: selectedCatalog.quantity,
        quantityText: `${selectedCatalog.quantity} ${candidateItem.unit || "шт."}`,
      };
      const nextRows = (existingGroup ? [...rows, row] : [...rows, group, row]).map((candidate, index) => ({ ...candidate, sortOrder: index }));
      const saved = await repository.updatePpeCardNormRows(draft.id, { expectedVersion: draft.version ?? 0, rows: nextRows.map(toNormPayload) });
      const savedRows = [...(saved.normRows ?? nextRows)].sort((left, right) => left.sortOrder - right.sortOrder);
      const savedRow = savedRows.find((candidate) => candidate.id === row.id) ?? row;
      const createdBase = createIssueDraftLine(savedRow, issueDate, selectedCatalog.quantity);
      const created = createdBase ? {
        ...createdBase,
        comment: selectedCatalog.comment,
        sizeText: selectedCatalog.sizeText,
        unitPriceMinor: selectedCatalog.unitPriceMinor ?? createdBase.unitPriceMinor,
        warehouseId: selectedCatalog.warehouseId,
      } : null;
      setDraft(saved);
      setRows(savedRows);
      if (created) setIssueLines((current) => [...current, created]);
      setSelectedCatalogItems((current) => current.map((row) => row.localId === selectedCatalog.localId ? { ...row, comment: selectedCatalog.comment, mappingId: null, normResolutionStatus: "additional", normRowId: savedRow.id } : row));
      setCandidateItem(null);
      setCandidateSelectionId(null);
      setNormCandidates([]);
      onNotify("Позиция добавлена как дополнительная выдача");
    } catch (reason) {
      setError(messageOf(reason, "Не удалось добавить дополнительную позицию"));
    } finally {
      endSaving();
    }
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

  async function removeSelectedCatalogItem(localId: string) {
    const selected = selectedCatalogItems.find((row) => row.localId === localId);
    if (!selected) return;
    if (selected.normResolutionStatus === "additional" && selected.normRowId) {
      await removeExtraRow(selected.normRowId);
    } else {
      setIssueLines((current) => selected.normRowId ? current.filter((line) => line.cardNormRowId !== selected.normRowId) : current);
      onNotify("Позиция убрана из документа");
    }
    setSelectedCatalogItems((current) => current.filter((row) => row.localId !== localId));
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
  function goToComposition() {
    if (!issueLines.length) return setError("Выберите хотя бы одну сопоставленную позицию");
    if (selectedCatalogItems.some((item) => item.normResolutionStatus === "unresolved" || item.normResolutionStatus === "review_required" || item.normResolutionStatus === "additional_pending")) return setError("Завершите проверку норм или подтвердите дополнительную выдачу");
    setError(""); setStep(3);
  }
  function goToPrint() { if (!issueLines.length) return setError("В документе нет выбранных позиций"); setError(""); setStep(4); }

  async function commitIssue() {
    if (!draft || committed || blockingErrors.length) return;
    if (!beginSaving()) return; setError("");
    try {
      const saved = await repository.createPpeIssueBatch(draft.id, {
        expectedVersion: draft.version ?? 0,
        idempotencyKey: issueBatchKey.current,
        lines: issueLines.map((line) => {
          const row = rows.find((candidate) => candidate.id === line.cardNormRowId);
          const selected = selectedCatalogItems.find((candidate) => candidate.normRowId === line.cardNormRowId || candidate.item.id === line.itemId);
          return {
            brandModelArticle: line.brandModelArticle,
            cardNormRowId: line.cardNormRowId,
            issueMethod: line.issueMethod,
            issuedAt: toApiDate(line.issuedAt),
            itemId: line.itemId,
            quantity: line.quantity,
            unitPriceMinor: line.unitPriceMinor,
            sizeText: line.sizeText,
            comment: line.comment,
            warehouseId: line.warehouseId,
            isAdditional: row?.sourceNormRowId == null,
            saveMappingOnSuccess: selected?.saveMappingOnSuccess ?? false,
            makeDefaultMapping: selected?.makeDefaultMapping ?? false,
          };
        }),
      });
      setDraft(saved); setCommitted(true); clearPpeIssueWorkflowCache(currentUserId);
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
    if (!draft || !committed || downloadRef.current) return;
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
    {step === 2 ? <SelectionStep autoMatchSummary={autoMatchSummary} autoMatching={autoMatching} categories={categories} issueLines={issueLines} itemRows={itemRows} loadingItems={saving || autoMatching} onAddCatalog={() => { setReplacementSelectionId(null); setCatalogPickerOpen(true); }} onAutoMatch={() => void autoMatchSelectedCatalogItems()} onApplySet={applySet} onOpenCatalog={setMappingRow} onOpenNormCandidates={(item) => void openNormCandidatesForSelection(item)} onRemoveExtra={(id) => void removeExtraRow(id)} onRemoveSelected={(id) => void removeSelectedCatalogItem(id)} onReplaceSelected={replaceSelectedCatalogItem} onSelectAll={selectAllMapped} onToggle={toggleRow} selectionTab={selectionTab} selectedCatalogItems={selectedCatalogItems} setSelectionTab={setSelectionTab} settings={settings} settingsError={settingsError} onRetrySettings={() => setSettingsReloadToken((value) => value + 1)} /> : null}
    {step === 3 ? <CompositionStep issueLines={issueLines} onChange={patchIssueLine} onOpenCatalog={setMappingRow} onRemove={removeIssueLine} rows={rows} selectedCatalogItems={selectedCatalogItems} selectedEmployee={selectedEmployee} warehouses={settings?.warehouses ?? []} /> : null}
    {step === 4 ? <PrintStep committed={committed} data={printData} errors={blockingErrors} mode={printMode} downloadFormat={downloadFormat} onDownload={(format) => void download(format)} onModeChange={setPrintMode} onPreview={() => setPreviewOpen(true)} onPrint={() => handlePrint(printData, printMode)} printBusy={printing} onSave={() => void commitIssue()} saving={saving} /> : null}
    <footer className="ppe-issue-workflow-footer"><PpeButton disabled={step === 1 || saving || Boolean(downloadFormat) || printing} icon={<ArrowLeft size={16} />} onClick={() => setStep((current) => Math.max(1, current - 1) as WorkflowStep)} variant="secondary">Назад</PpeButton><span>{step} из 4</span>{step === 2 ? <PpeButton disabled={saving || Boolean(downloadFormat) || printing} icon={<ArrowRight size={16} />} onClick={goToComposition} variant="primary">К составу</PpeButton> : null}{step === 3 ? <PpeButton disabled={saving || Boolean(downloadFormat) || printing} icon={<ArrowRight size={16} />} onClick={goToPrint} variant="primary">Предпросмотр печати</PpeButton> : null}{step === 4 && committed ? <PpeButton icon={<ArrowRight size={16} />} onClick={() => onNavigate("inventory-ppe")} variant="primary">Открыть карточку</PpeButton> : null}</footer>
    {mappingRow ? <PpeCatalogModal allowMultiple={!mappingRow.sourceNormRowId} normRow={mappingRow} onClose={() => setMappingRow(null)} onConfirm={saveMapping} /> : null}
    {catalogPickerOpen ? <PpeCatalogPicker onClose={() => { setCatalogPickerOpen(false); setReplacementSelectionId(null); }} onConfirm={selectCatalogItems} singleSelection={Boolean(replacementSelectionId)} warehouses={settings?.warehouses ?? []} /> : null}
    {candidateItem ? <PpeNormSelectionModal additionalReason={selectedCatalogItems.find((row) => row.localId === candidateSelectionId)?.comment ?? ""} candidates={normCandidates} error={candidateError} item={candidateItem} loading={candidateLoading} onAddAdditional={(reason) => void addCatalogItemAsAdditional(reason)} onClose={() => { setCandidateItem(null); setCandidateSelectionId(null); setNormCandidates([]); }} onConfirm={(candidate, options) => void confirmCatalogCandidate(candidate, options)} onOpenNormSettings={openNormSettingsForSelectedEmployee} quantity={selectedCatalogItems.find((row) => row.localId === candidateSelectionId)?.quantity ?? 1} sizeText={selectedCatalogItems.find((row) => row.localId === candidateSelectionId)?.sizeText ?? ""} /> : null}
    {previewOpen ? <PrintPreviewModal data={printData} mode={printMode} onClose={() => setPreviewOpen(false)} onModeChange={setPrintMode} onPrint={handlePrint} printing={printing} /> : null}
  </section>;
}

function collectBlockingErrors({ basis, issueDate, issueLines, responsible, rows, selectedCatalogItems }: { basis: string; issueDate: string; issueLines: PpeIssueDraftLine[]; responsible: string; rows: InventoryPpeCardNormRowDto[]; selectedCatalogItems: PpeSelectedCatalogItem[] }) {
  const errors: string[] = [];
  if (!responsible.trim()) errors.push("Не указан ответственный");
  if (!basis.trim()) errors.push("Не указано основание выдачи");
  if (!issueDate) errors.push("Не указана дата выдачи");
  if (!issueLines.length) errors.push("Не выбраны позиции выдачи");
  for (const selected of selectedCatalogItems.filter((item) => ["unresolved", "review_required", "additional_pending"].includes(item.normResolutionStatus))) {
    errors.push(`${selected.item.name}: завершите проверку нормы или подтвердите дополнительную выдачу`);
  }
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
      normQuantity: row.quantity,
      normQuantityText: row.quantityText,
      priceText: row.defaultUnitPriceMinor ? String(row.defaultUnitPriceMinor / 100) : "0",
      printItemName: row.normItemName,
      quantityText: row.rowType === "group" ? "" : issue ? String(issue.quantity) : String(row.quantity || 1),
      status: issue ? "issued" : "not_issued",
      warehouseId: "",
    };
  });
  const wizard: PpeWizardState = { cardId, comment: "", employeeDetails, employeeId: employee?.id ?? "", lines: wizardLines, mode: "create", step: 3 };
  return printDataFromWizard(wizard, employee);
}

function createExtraGroup(sortOrder: number): InventoryPpeCardNormRowDto { return { brandModelArticle: "", coverageStatus: "not_issued", defaultUnitPriceMinor: null, id: createClientUuid(), issuePeriodText: "", issuedQuantity: 0, lifeMonths: null, mappedItemId: null, mappedItemName: "", mappings: [], normItemName: "Дополнительная выдача", normPoint: "", parentRowId: null, quantity: 0, quantityText: "", rowType: "group", sortOrder, sourceNormRowId: null }; }
function createExtraRow(parentRowId: string, sortOrder: number): InventoryPpeCardNormRowDto { return { brandModelArticle: "", coverageStatus: "not_issued", defaultUnitPriceMinor: null, id: createClientUuid(), issuePeriodText: "Дополнительная выдача", issuedQuantity: 0, lifeMonths: null, mappedItemId: null, mappedItemName: "", mappings: [], normItemName: "Дополнительное СИЗ", normPoint: "Дополнительная выдача", parentRowId, quantity: 1, quantityText: "1 шт.", rowType: "item", sortOrder, sourceNormRowId: null }; }
function toNormPayload(row: InventoryPpeCardNormRowDto) { return { brandModelArticle: row.brandModelArticle, defaultUnitPriceMinor: row.defaultUnitPriceMinor, draftIssuedAt: row.draftIssuedAt ?? null, draftQuantity: row.draftQuantity ?? null, draftUnitPriceMinor: row.draftUnitPriceMinor ?? null, draftIssueMethod: (row.draftIssueMethod === "dispenser" ? "dispenser" : "personal") as "personal" | "dispenser", draftSizeText: row.draftSizeText ?? "", draftWarehouseId: row.draftWarehouseId ?? null, draftComment: row.draftComment ?? "", draftBrandModelArticle: row.draftBrandModelArticle ?? "", id: row.id, issuePeriodText: row.issuePeriodText, lifeMonths: row.lifeMonths, mappedItemId: row.mappedItemId, normItemName: row.normItemName, normPoint: row.normPoint, parentRowId: row.parentRowId, quantity: row.quantity, quantityText: row.quantityText, rowType: row.rowType, sortOrder: row.sortOrder, sourceNormRowId: row.sourceNormRowId }; }
function toApiEmployeeDetails(details: PpeEmployeeCardDetails) { return { clothingSize: details.clothingSize ?? "", gender: details.gender ?? "", handProtectionSize: details.handProtectionSize ?? "", headSize: details.headSize ?? "", height: details.height ?? "", respiratorSize: details.respiratorSize ?? "", shoeSize: details.shoeSize ?? "" }; }
function toApiDate(value: string) { return new Date(`${value}T12:00:00`).toISOString(); }
function messageOf(value: unknown, fallback: string) { return value instanceof Error ? value.message : fallback; }
