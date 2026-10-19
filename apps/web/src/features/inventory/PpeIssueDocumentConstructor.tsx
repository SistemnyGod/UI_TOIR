import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import type { InventoryEmployeeDto, InventoryPpeEmployeeDetailsDto, InventoryPpeNormRowDto, InventoryPpeNormSetDetailDto, InventoryPpeNormSetDto, PpeIssueDocumentDto, SavePpeIssueDocumentDto } from "../../api/contracts";
import type { ScreenId } from "../../types";
import { createClientUuid } from "../../shared/clientUuid";
import { usePageLeaveGuard } from "../../shared/navigation/usePageLeaveGuard";
import { useInventoryRepository } from "../../repositories/inventoryRepositoryContext";
import { usePpeEmployeeSearch } from "./ppe/usePpeEmployeeSearch";
import { readDocumentStorage, writeDocumentStorage } from "./ppe/documentStorage";
import { documentMatchesSave } from "./ppe/documentPersistence";
import { ApiError } from "../../api/client";
import { ppeErrorMessage } from "./ppe/ppeErrors";
import "./styles/ppe-issue-document.css";
import "./styles/ppe-reference.css";
import type { DraftLine } from "./ppe/documentWorkflow";
import { StepEmployee, EmployeeCheck } from "./ppe/DocumentEmployee";
import { DocumentKit } from "./ppe/DocumentKit";
import { DocumentActions } from "./ppe/DocumentActions";
import { DocumentReview } from "./ppe/DocumentReview";
import { DocumentConfirmation } from "./ppe/DocumentConfirmation";
import { NormChangeDialog } from "./ppe/NormChangeDialog";
import { usePpeNormTransition } from "./ppe/usePpeNormTransition";
import { DocumentSteps, DocumentFooter, DocumentHistory, type DocumentStep } from "./ppe/DocumentNavigation";
import { usePpeDocumentFiles } from "./ppe/usePpeDocumentFiles";
import { toLineInput, fingerprintOf, confirmKeyStorageKey, alternativeKey, createDraftLine, mergeServerLines, messageOf, problemMessagesOf, validateDraftLines } from "./ppe/documentDraft";
export { formatDocumentStatus, formatRuDate, formatNormQuantity, formatPriceInput, parsePriceInput, problemMessagesOf, validateDraftLines, toLineInput, mergeServerLines } from "./ppe/documentDraft";

type Step = DocumentStep;

const storageKey = (userId: string) => `patrol360.inventory.ppe.issue-document.${userId}`;
const emptyEmployeeDetails: InventoryPpeEmployeeDetailsDto = { gender: "", height: "", clothingSize: "", shoeSize: "", headSize: "", respiratorSize: "", handProtectionSize: "" };
const localToday = () => { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; };
type ConstructorProps = { currentUserId?: string; canManage?: boolean; canManageTemplates?: boolean; canExport?: boolean; onNavigate: (screen: ScreenId) => void; onNotify: (message: string) => void };

export function isPpeIssueDocumentConfirmable(document: Pick<PpeIssueDocumentDto, "status" | "validation"> | null) {
  return Boolean(document && document.status.toLowerCase() === "draft" && document.validation.errors.length === 0);
}

export function PpeIssueDocumentConstructor(props: ConstructorProps) {
  const repository = useInventoryRepository(), owner = useRef({ repository, revision: 0 });
  if (owner.current.repository !== repository) owner.current = { repository, revision: owner.current.revision + 1 };
  return <DocumentWorkspace key={`${props.currentUserId ?? "anonymous"}:${owner.current.revision}`} {...props} />;
}
function DocumentWorkspace({ currentUserId = "anonymous", canManage = false, canManageTemplates = false, canExport = false, onNavigate, onNotify }: ConstructorProps) {
  const repository = useInventoryRepository();
  const [step, setStep] = useState<Step>(1);
  const [employeeId, setEmployeeId] = useState("");
  const [employeeChangeId, setEmployeeChangeId] = useState<string | null>(null);
  const [norms, setNorms] = useState<InventoryPpeNormSetDto[]>([]);
  const [normListOwner, setNormListOwner] = useState("");
  const [normListLoading, setNormListLoading] = useState(false), [normListError, setNormListError] = useState("");
  const [normListReload, setNormListReload] = useState(0);
  const [normSetId, setNormSetId] = useState("");
  const [normDetail, setNormDetail] = useState<InventoryPpeNormSetDetailDto | null>(null);
  const [documentDate, setDocumentDate] = useState(localToday);
  const [responsibleName, setResponsibleName] = useState("");
  const [basis, setBasis] = useState("Приказ о выдаче СИЗ");
  const [employeeDetails, setEmployeeDetails] = useState<InventoryPpeEmployeeDetailsDto>(emptyEmployeeDetails);
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [document, setDocument] = useState<PpeIssueDocumentDto | null>(null);
  const [documentContextRevision, setDocumentContextRevision] = useState(0);
  const [history, setHistory] = useState<Array<{ id: string; employeeName: string; documentDate: string; status: string; linesCount: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [commandPending, setCommandPending] = useState(false);
  const commandInFlightRef = useRef(false);
  const [validating, setValidating] = useState(false);
  const validationInFlightRef = useRef(false);
  const [error, setError] = useState("");
  const [problemMessages, setProblemMessages] = useState<string[]>([]);
  const [normChangeRequired, setNormChangeRequired] = useState(false);
  const [acceptNormChange, setAcceptNormChange] = useState(false);
  const linesRef = useRef(lines);
  const lastSavedFingerprintRef = useRef("");
  const failedAutoSaveRef = useRef("");
  const saveInFlightRef = useRef(false);
  const savePromiseRef = useRef<Promise<PpeIssueDocumentDto | null> | null>(null);
  const documentRef = useRef<PpeIssueDocumentDto | null>(null);
  const normsRequestRef = useRef(0);
  const resumeRequestRef = useRef(0);
  const historyRequestRef = useRef(0);
  const sessionRequestRef = useRef(0);
  const resumeInFlightRef = useRef(false);
  const [resuming, setResuming] = useState(false);
  const clientDocumentRef = useRef<{ id: string; employeeId: string; normSetId: string } | null>(null);
  const confirmKeysRef = useRef(new Map<string, string>());
  const employeeSearch = usePpeEmployeeSearch(repository, currentUserId, employeeId);
  const employees = employeeSearch.employees;

  const formLocked = resuming || validating || commandPending || employeeChangeId !== null;
  const initialLoading = loading || resuming && !document;
  const selectedEmployee: InventoryEmployeeDto | undefined = document && document.status !== "draft"
    ? { ...document.content.employee, status: "active", employeeGroup: "", hiredAt: document.content.employee.hiredAt ?? null, birthDate: null }
    : employees.find((employee) => employee.id === employeeId);
  const immutable = Boolean(document && document.status.toLowerCase() !== "draft");
  const validation = document?.validation;
  const hasErrors = Boolean(validation?.errors.length);
  const normScope = `${employeeId}:${documentDate}`;
  const availableNorms = normListOwner === normScope ? norms : [];
  const normListReady = !employeeId || immutable || normListOwner === normScope && !normListLoading && !normListError;
  const normIsApplicable = immutable || !normSetId || availableNorms.some(norm => norm.id === normSetId);
  const normRows = immutable ? document?.content.normRows ?? [] : normDetail?.rows ?? (document?.content.normSetId === normSetId ? document.content.normRows : []);
  const selectedNormRows = useMemo(() => normRows.filter(row => row.rowType === "item"), [normRows]);
  const normSelection = usePpeNormTransition({ contextKey: `${employeeId}:${documentDate}:${document?.id ?? "new"}:${documentContextRevision}`, normSetId, lines, enabled: Boolean(employeeId && normSetId) && !immutable, canManage,
    onCommit: (id, detail, mode, removeMissing) => {
      setNormSetId(id); setNormDetail(detail);
      if (canManage) setLines(current => { const available = new Set(detail?.rows.filter(row => row.rowType === "item").map(row => row.id) ?? []); const retained = removeMissing ? current.filter(line => available.has(line.normRowId)) : current; return mode === "select" ? appendNormKit(retained, detail?.rows.filter(row => row.rowType === "item") ?? []) : retained; });
      if (removeMissing) setAcceptNormChange(true);
    } });
  const busy = saving || formLocked || normSelection.pending;
  const canSaveDocument = Boolean(employeeId && normSetId && normListReady && normIsApplicable && normSelection.ready && !normSelection.pending);
  const draftFingerprint = useMemo(() => fingerprintOf(employeeId, normSetId, documentDate, responsibleName, basis, employeeDetails, lines, acceptNormChange), [acceptNormChange, basis, documentDate, employeeDetails, employeeId, lines, normSetId, responsibleName]);
  const emptyDraftFingerprint = useRef(draftFingerprint);
  const hasUnsavedChanges = canManage && !immutable && (document ? lastSavedFingerprintRef.current !== draftFingerprint : emptyDraftFingerprint.current !== draftFingerprint);
  const { requestLeave, leaveDialog } = usePageLeaveGuard({ dirty: hasUnsavedChanges, pending: busy, message: "Изменения ещё не сохранены. При выходе из текущей формы они будут потеряны. Сохранённый документ останется в журнале." });
  const requestJournal = () => requestLeave(() => onNavigate("inventory-ppe"));

  const files = usePpeDocumentFiles(repository, JSON.stringify([currentUserId, document?.id, document?.version, draftFingerprint, canExport]), document?.id, canExport);
  useEffect(() => { linesRef.current = lines; }, [lines]);
  useEffect(() => { documentRef.current = document; }, [document]);
  useEffect(() => {
    ++sessionRequestRef.current;
    validationInFlightRef.current = false;
    setValidating(false);
    documentRef.current = null;
    lastSavedFingerprintRef.current = "";
    failedAutoSaveRef.current = "";
    setDocument(null);
    setEmployeeId("");
    setNormSetId("");
    setNormDetail(null);
    normSelection.invalidate();
    setLines([]);
    setHistory([]);
    setStep(1);
    setLoading(true);
    setLoading(false);
    setSaving(false); setResuming(false); setError(""); setProblemMessages([]);
    setNorms([]); setNormListOwner(""); setNormListLoading(false); setNormListError(""); setEmployeeDetails(emptyEmployeeDetails); setResponsibleName(""); setBasis("Приказ о выдаче СИЗ"); setDocumentDate(localToday());
    setAcceptNormChange(false); setNormChangeRequired(false);
    saveInFlightRef.current = false; savePromiseRef.current = null;
    clientDocumentRef.current = null;
    try { clientDocumentRef.current = JSON.parse(readDocumentStorage("localStorage", `${storageKey(currentUserId)}.pending`) ?? "null"); } catch { /* Invalid browser metadata does not affect server documents. */ }
    const requestedId = readDocumentStorage("sessionStorage", `ppe.open-document.${currentUserId}`);
    const savedId = requestedId ?? readDocumentStorage("localStorage", storageKey(currentUserId));
    if (savedId) void resume(savedId);
    return () => {
      sessionRequestRef.current += 1;
      normsRequestRef.current += 1;
      historyRequestRef.current += 1;
      resumeRequestRef.current += 1;
      resumeInFlightRef.current = false;
    };
  // The repository is stable under its provider; restoring only once avoids overwriting active edits.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId, repository]);

  useEffect(() => {
    const requestId = ++normsRequestRef.current;
    if (!employeeId || immutable) { setNormListLoading(false); if (!employeeId) { setNorms([]); setNormListOwner(""); } return; }
    setNormListLoading(true); setNormListError("");
    void repository.getPpeIssueDocumentNorms(employeeId, documentDate)
      .then((value) => { if (requestId === normsRequestRef.current) { setNorms(value); setNormListOwner(normScope); } })
      .catch((reason) => { if (requestId === normsRequestRef.current) setNormListError(messageOf(reason, "Не удалось загрузить применимые нормы")); })
      .finally(() => { if (requestId === normsRequestRef.current) setNormListLoading(false); });
    return () => { normsRequestRef.current++; };
  }, [documentDate, employeeId, repository, normListReload, immutable]);
  useEffect(() => {
    const historyRequestId = ++historyRequestRef.current;
    if (!employeeId || immutable) { if (!employeeId) setHistory([]); return; }
    void repository.getPpeIssueDocuments(employeeId)
      .then((value) => { if (historyRequestId === historyRequestRef.current) setHistory(value); })
      .catch(() => undefined);
    return () => { historyRequestRef.current++; };
  }, [employeeId, repository, immutable]);

  const payload = useCallback((expectedVersion?: number, acceptChange = acceptNormChange): SavePpeIssueDocumentDto | null => {
    if (!employeeId || !normSetId) return null;
    return { employeeId, normSetId, documentDate, responsibleName, basis, employeeDetails, lines: lines.map(toLineInput), expectedVersion, acceptNormChange: acceptChange };
  }, [acceptNormChange, basis, documentDate, employeeDetails, employeeId, lines, normSetId, responsibleName]);

  const persist = useCallback(async (acceptChange = acceptNormChange) => {
    if (!canManage || immutable) return document;
    if (!canSaveDocument) { setError("Дождитесь проверки применимой нормы или повторите её загрузку. Текущий ввод сохранён."); return null; }
    if (saveInFlightRef.current) {
      try { return await savePromiseRef.current; } catch { return null; }
    }
    const clientError = validateDraftLines(lines);
    if (clientError) { setError(clientError); return null; }
    const currentDocument = documentRef.current;
    const nextPayload = payload(currentDocument?.version, acceptChange);
    if (!nextPayload) { setError("Выберите сотрудника и применимую норму."); return null; }
    const sessionId = sessionRequestRef.current;
    if (!currentDocument && (!clientDocumentRef.current || clientDocumentRef.current.employeeId !== employeeId || clientDocumentRef.current.normSetId !== normSetId))
      clientDocumentRef.current = { id: createClientUuid(), employeeId, normSetId };
    nextPayload.clientDocumentId = currentDocument?.id ?? clientDocumentRef.current!.id;
    if (!currentDocument) {
      writeDocumentStorage("localStorage", `${storageKey(currentUserId)}.pending`, JSON.stringify(clientDocumentRef.current));
      writeDocumentStorage("localStorage", storageKey(currentUserId), nextPayload.clientDocumentId);
    }
    saveInFlightRef.current = true;
    setSaving(true); setError(""); setProblemMessages([]); setNormChangeRequired(false);
    const operation = Promise.resolve().then(async () => { try {
      const request = currentDocument ? repository.updatePpeIssueDocument(currentDocument.id, nextPayload) : repository.createPpeIssueDocument(nextPayload);
      let next: PpeIssueDocumentDto;
      try { next = await request; }
      catch (reason) {
        if (sessionId !== sessionRequestRef.current) return null;
        // A timeout may hide a committed POST/PUT. Reconcile before offering a retry.
        if (!(reason instanceof ApiError) || reason.status >= 500 || reason.status === 0) {
          try {
            const restored = await repository.getPpeIssueDocument(nextPayload.clientDocumentId!);
            if (currentDocument && restored.version === currentDocument.version) throw reason;
            next = restored;
          } catch { throw reason; }
        } else throw reason;
      }
      if (sessionId !== sessionRequestRef.current || (currentDocument && documentRef.current?.id !== currentDocument.id)) return null;
      if (!documentMatchesSave(next, nextPayload)) throw new ApiError("Сохранённый документ отличается от отправленных данных. Ваш ввод сохранён в форме; откройте документ из журнала для сравнения.", 409);
      failedAutoSaveRef.current = "";
      documentRef.current = next;
      setDocument(next);
      setLines((current) => mergeServerLines(next, current, nextPayload.lines));
      lastSavedFingerprintRef.current = draftFingerprint;
      if (!writeDocumentStorage("localStorage", storageKey(currentUserId), next.id)) onNotify("Документ сохранён в БД. Браузер не сохранил ссылку; открыть его можно из журнала.");
      writeDocumentStorage("localStorage", `${storageKey(currentUserId)}.pending`);
      return next;
    } catch (reason) {
      if (sessionId !== sessionRequestRef.current) return null;
      failedAutoSaveRef.current = draftFingerprint;
      const messages = problemMessagesOf(reason);
      setProblemMessages(messages);
      setNormChangeRequired(reason instanceof ApiError && Boolean(reason.errors?.normChanged));
      setError(messageOf(reason, "Не удалось сохранить документ. Проверьте конфликт версии и повторите."));
      return null;
    }
    finally { if (sessionId === sessionRequestRef.current) { savePromiseRef.current = null; saveInFlightRef.current = false; setSaving(false); } }
    });
    savePromiseRef.current = operation;
    return operation;
  }, [acceptNormChange, canManage, canSaveDocument, currentUserId, document, draftFingerprint, immutable, lines, payload, repository]);

  const liveSave = useRef({ persist, draftFingerprint });
  liveSave.current = { persist, draftFingerprint };
  const saveForAction = useCallback(async (acceptChange = acceptNormChange) => {
    const sessionId = sessionRequestRef.current;
    if (savePromiseRef.current) {
      try { await savePromiseRef.current; } catch { return null; }
    }
    if (sessionId !== sessionRequestRef.current) return null;
    if (lastSavedFingerprintRef.current !== liveSave.current.draftFingerprint) return liveSave.current.persist(acceptChange);
    return documentRef.current;
  }, [acceptNormChange]);

  useEffect(() => {
    if (!canManage || !document || immutable || !canSaveDocument || saving || commandPending || validating || resuming || employeeChangeId !== null || lastSavedFingerprintRef.current === draftFingerprint || failedAutoSaveRef.current === draftFingerprint) return;
    const timer = window.setTimeout(() => { if (!commandInFlightRef.current && !validationInFlightRef.current && !resumeInFlightRef.current) void persist(); }, 450);
    return () => window.clearTimeout(timer);
  }, [canManage, document?.id, draftFingerprint, immutable, canSaveDocument, persist, saving, commandPending, validating, resuming, employeeChangeId]);

  async function runCommand(action: () => Promise<boolean>) {
    if (!canManage || commandInFlightRef.current || validationInFlightRef.current || resumeInFlightRef.current) return false;
    commandInFlightRef.current = true; setCommandPending(true);
    const sessionId = sessionRequestRef.current;
    try { return await action(); }
    finally { if (sessionId === sessionRequestRef.current) { commandInFlightRef.current = false; setCommandPending(false); } }
  }

  async function resume(id: string, throwOnError = false) {
    const requestId = ++resumeRequestRef.current;
    resumeInFlightRef.current = true;
    setResuming(true);
    setError(""); setProblemMessages([]);
    try {
      const value = await repository.getPpeIssueDocument(id);
      if (requestId !== resumeRequestRef.current) return;
      writeDocumentStorage("localStorage", storageKey(currentUserId), value.id);
      writeDocumentStorage("sessionStorage", `ppe.open-document.${currentUserId}`);
      const resumedLines = value.content.lines.map((line) => ({ ...line, normPoint: line.normPoint ?? value.content.normRows.find(row => row.id === line.normRowId)?.normPoint, normName: value.content.normRows.find((row) => row.id === line.normRowId)?.normItemName ?? "Норма", approved: true }));
      documentRef.current = value;
      setDocument(value); setEmployeeId(value.content.employee.id); setNormSetId(value.content.normSetId); setNormDetail(null); setDocumentContextRevision(value => value + 1);
      setDocumentDate(value.content.documentDate); setResponsibleName(value.content.responsibleName); setBasis(value.content.basis);
      setEmployeeDetails(value.content.employee.details ?? emptyEmployeeDetails);
      setLines(resumedLines);
      lastSavedFingerprintRef.current = fingerprintOf(value.content.employee.id, value.content.normSetId, value.content.documentDate, value.content.responsibleName, value.content.basis, value.content.employee.details ?? emptyEmployeeDetails, resumedLines, false);
      setStep(value.status.toLowerCase() === "draft" ? 2 : 4);
      return true;
    } catch (reason) { if (requestId === resumeRequestRef.current) { if (reason instanceof ApiError && [400, 403, 404].includes(reason.status)) { writeDocumentStorage("localStorage", storageKey(currentUserId)); writeDocumentStorage("sessionStorage", `ppe.open-document.${currentUserId}`); } setError(messageOf(reason, "Не удалось открыть документ. Повторите открытие из журнала.")); if (throwOnError) throw reason; } return false; }
    finally { if (requestId === resumeRequestRef.current) { resumeInFlightRef.current = false; setResuming(false); } }
  }
  async function migrateLegacyDraft(cardId: string) {
    const sessionId = sessionRequestRef.current;
    if (!cardId.trim()) throw new Error("Укажите идентификатор карточки с черновиком для переноса.");
    return runCommand(async () => { try {
      if (savePromiseRef.current && !await savePromiseRef.current) throw new Error("Не удалось завершить сохранение текущего документа. Проверьте его перед переносом.");
      if (sessionId !== sessionRequestRef.current) return false;
      const result = await repository.migratePpeLegacyDraft(cardId.trim());
      if (sessionId !== sessionRequestRef.current) return false;
      if (result.warnings.length) onNotify(result.warnings.join(" "));
      if (!result.documentId) throw new Error("В карточке нет черновика, доступного для переноса.");
      return Boolean(await resume(result.documentId, true));
    } catch (reason) { if (sessionId !== sessionRequestRef.current) return false; setError(messageOf(reason, "Не удалось перенести черновик карточки")); throw reason; } });
  }
  async function acceptNormChangeAndSave() {
    setAcceptNormChange(true);
    const saved = await saveForAction(true);
    if (saved) { setNormChangeRequired(false); onNotify("Изменение нормы подтверждено, черновик обновлён"); }
  }
  function startNewIssue() {
    if (saveInFlightRef.current || resumeInFlightRef.current || commandInFlightRef.current || validationInFlightRef.current) return false;
    resumeRequestRef.current += 1;
    // These reads still belong to the same employee and norm. Invalidating them
    // without changing their effect dependencies would leave the selectors empty.
    linesRef.current = [];
    setDocumentContextRevision(value => value + 1);
    if (document) writeDocumentStorage("localStorage", confirmKeyStorageKey(document.id));
    clientDocumentRef.current = null;
    writeDocumentStorage("localStorage", `${storageKey(currentUserId)}.pending`);
    documentRef.current = null;
    lastSavedFingerprintRef.current = "";
    writeDocumentStorage("localStorage", storageKey(currentUserId));
    setDocument(null);
    setLines([]);
    setError("");
    setProblemMessages([]);
    setNormChangeRequired(false);
    setAcceptNormChange(false);
    setStep(employeeId && normSetId ? 2 : 1);
    return true;
  }
  async function cancelDraft() {
    if (!document || document.status.toLowerCase() !== "draft") return false;
    const sessionId = sessionRequestRef.current;
    const id = document.id;
    return runCommand(async () => { try {
      if (savePromiseRef.current && !await savePromiseRef.current) throw new Error("Не удалось завершить сохранение. Проверьте состояние документа перед отменой.");
      if (sessionId !== sessionRequestRef.current || documentRef.current?.id !== id) return false;
      let cancelled: PpeIssueDocumentDto;
      try { cancelled = await repository.cancelPpeIssueDocument(id, documentRef.current.version); }
      catch (reason) { const restored = await repository.getPpeIssueDocument(id).catch(() => null); if (restored?.id !== id || restored.status !== "cancelled") throw reason; cancelled = restored; }
      if (sessionId !== sessionRequestRef.current || documentRef.current?.id !== id) return false;
      documentRef.current = cancelled; setDocument(cancelled); setError(""); setProblemMessages([]);
      setStep(4);
      lastSavedFingerprintRef.current = draftFingerprint;
      onNotify("Черновик выдачи отменён");
      return true;
    } catch (reason) {
      if (sessionId !== sessionRequestRef.current) return false;
      setProblemMessages(problemMessagesOf(reason));
      setError(messageOf(reason, "Не удалось отменить черновик выдачи"));
      throw reason;
    } });
  }

  function addFullKit() {
    if (!canManage) return;
    setLines(current => appendNormKit(current, selectedNormRows));
  }
  function appendNormKit(current: DraftLine[], rows: InventoryPpeNormRowDto[]) {
    const rowsById = new Map(rows.map(row => [row.id, row]));
    const selectedGroups = new Set(current.map(line => alternativeKey(rowsById.get(line.normRowId))));
    const next = [...current];
    for (const row of rows) {
      const group = alternativeKey(row);
      if (selectedGroups.has(group)) continue;
      const approved = row.mappings.filter(mapping => mapping.isApproved);
      const mapping = approved.find(mapping => mapping.isDefault) ?? approved[0];
      if (!mapping) continue;
      next.push(createDraftLine(row, mapping, documentDate, true));
      selectedGroups.add(group);
    }
    return next;
  }

  function selectEmployee(id: string) {
    if (saveInFlightRef.current || resumeInFlightRef.current) return;
    if (id === employeeId) return;
    if (canManage && hasUnsavedChanges) { setEmployeeChangeId(id); return; }
    applyEmployee(id);
  }
  function applyEmployee(id: string) {
    normsRequestRef.current++; historyRequestRef.current++;
    normSelection.invalidate(); setHistory([]);
    if (!canManage) {
      resumeRequestRef.current += 1;
      documentRef.current = null;
      setDocument(null); setLines([]); setNormDetail(null); setNormSetId(""); setEmployeeId(id); setStep(1);
      return;
    }
    if (id !== employeeId) { clientDocumentRef.current = null; resumeRequestRef.current++; }
    if (document && id !== document.content.employee.id) {
      documentRef.current = null;
      setDocument(null); setLines([]); setNormDetail(null); setNormSetId(""); setAcceptNormChange(false); lastSavedFingerprintRef.current = "";
    }
    if (id !== employeeId) { setEmployeeDetails(emptyEmployeeDetails); setLines([]); setNormDetail(null); setNormSetId(""); }
    setEmployeeId(id);
  }
  async function next() { if (step === 1 && (!employeeId || !normSetId)) { setError("Выберите сотрудника и норму."); return; } const sessionId = sessionRequestRef.current; await runCommand(async () => { const saved = await saveForAction(); if (!saved || sessionId !== sessionRequestRef.current) return false; if (step < 4) setStep((value) => (value + 1) as Step); return true; }); }
  async function validate() {
    if (!canManage || immutable || validationInFlightRef.current || resuming) return;
    validationInFlightRef.current = true;
    setValidating(true);
    const sessionId = sessionRequestRef.current;
    try {
      const saved = await saveForAction();
      if (!saved || sessionId !== sessionRequestRef.current) return;
      const checked = await repository.validatePpeIssueDocument(saved.id);
      if (sessionId !== sessionRequestRef.current || documentRef.current?.id !== saved.id) return;
      setDocument(checked); setStep(4); setError(""); setProblemMessages([]);
    } catch (reason) {
      if (sessionId === sessionRequestRef.current) { setProblemMessages(problemMessagesOf(reason)); setError(messageOf(reason, "Не удалось выполнить проверку")); }
    } finally {
      if (sessionId === sessionRequestRef.current) { validationInFlightRef.current = false; setValidating(false); }
    }
  }
  async function confirm() {
    if (!document || hasErrors || !canManage || immutable) return false;
    const sessionId = sessionRequestRef.current;
    const id = document.id;
    const keyStorage = confirmKeyStorageKey(id);
    const key = confirmKeysRef.current.get(id) ?? readDocumentStorage("localStorage", keyStorage) ?? createClientUuid();
    confirmKeysRef.current.set(id, key); writeDocumentStorage("localStorage", keyStorage, key);
    return runCommand(async () => { try {
      const saved = await saveForAction();
      if (!saved || sessionId !== sessionRequestRef.current || documentRef.current?.id !== id) return false;
      if (saved.validation.errors.length || saved.status !== "draft") throw new Error("Документ изменился. Проверьте его состояние перед подтверждением.");
      let confirmed: PpeIssueDocumentDto;
      try { confirmed = await repository.confirmPpeIssueDocument(id, saved.version, key); }
      catch (reason) {
        const restored = await repository.getPpeIssueDocument(id).catch(() => null);
        if (restored?.id !== id || restored.status !== "confirmed") throw reason;
        confirmed = restored;
      }
      if (sessionId !== sessionRequestRef.current || documentRef.current?.id !== id) return false;
      documentRef.current = confirmed; setDocument(confirmed); setError(""); setProblemMessages([]); onNotify("Документ выдачи подтверждён");
      return true;
    } catch (reason) {
      if (sessionId !== sessionRequestRef.current) return false;
      setProblemMessages(problemMessagesOf(reason)); setError(messageOf(reason, "Не удалось подтвердить документ")); throw reason;
    } });
  }


  return <section className="ppe-document-screen">
    <header className="ppe-document-head"><div><h1>{step === 4 ? "Предпросмотр и печать" : "Оформление выдачи СИЗ"}</h1>{selectedEmployee ? <p>{selectedEmployee.fullName} · Табельный № {selectedEmployee.personnelNo}</p> : <p>Выберите сотрудника и подготовьте комплект</p>}</div><div className="ppe-document-head-actions"><button className="button ghost" disabled={busy} onClick={requestJournal} type="button"><ArrowLeft size={16} /> К журналу</button>{canManage ? <DocumentActions contextKey={`${employeeId}:${normSetId}:${document?.id ?? "new"}`} hasUnsavedChanges={hasUnsavedChanges} busy={busy} draft={document?.status.toLowerCase() === "draft"} onNew={startNewIssue} onCancel={cancelDraft} onMigrate={migrateLegacyDraft} /> : null}</div></header>
    <DocumentSteps step={step} />
    {normListLoading ? <p className="ppe-document-norm-state" role="status">Проверяем применимые нормы. Текущий выбор и комплект сохраняются.</p> : null}
    {normListError ? <div className="ppe-document-norm-state is-error" role="alert">{normListError} <button className="button secondary" disabled={normListLoading || saving || formLocked} onClick={() => setNormListReload(value => value + 1)} type="button">Повторить список норм</button></div> : null}
    {normSelection.loading ? <p className="ppe-document-norm-state" role="status">Загружаем состав выбранной нормы… Сохранение доступно после проверки состава.</p> : null}
    {normSelection.error ? <div className="ppe-document-norm-state is-error" role="alert">{normSelection.error} <button className="button secondary" disabled={saving || formLocked} onClick={normSelection.retry} type="button">Повторить состав нормы</button></div> : null}
    {normSelection.notice ? <div className="ppe-document-norm-state" role="status">{normSelection.notice}{!normSelection.ready ? <button className="button secondary" onClick={normSelection.retry} type="button">Проверить актуальный состав</button> : null}</div> : null}
    {normSetId && normListReady && !normIsApplicable ? <p className="ppe-document-norm-state is-error" role="alert">Текущая норма недоступна для сотрудника на выбранную дату. Комплект сохранён в форме; выберите применимую норму или другую дату перед записью.</p> : null}
    <p className="ppe-document-save-state" role="status">{saving ? formLocked ? "Сохраняем черновик…" : "Сохраняем черновик… Можно продолжать ввод." : resuming && document ? "Открываем документ…" : ""}</p>
    {error ? <div className="ppe-document-alert is-error" role="alert"><AlertTriangle size={17} /><div><div>{error}</div>{problemMessages.map((message) => <div key={message}>{message}</div>)}{normChangeRequired ? <button className="button secondary" disabled={saving} onClick={() => void acceptNormChangeAndSave()} type="button">Подтвердить смену нормы и сохранить</button> : null}</div></div> : null}
    {employeeSearch.error ? <div role="alert">{employeeSearch.error} <button className="button secondary" disabled={employeeSearch.loading} onClick={employeeSearch.retry} type="button">Повторить поиск сотрудников</button></div> : null}
    {initialLoading ? <div className="ppe-document-state" role="status">Загрузка конструктора…</div> : null}
    {!initialLoading && step === 1 ? <StepEmployee canSelectEmployee={!busy} canSelectNorm={!saving && !formLocked && normListReady} canSelectDate={!busy} editable={canManage && !formLocked && !immutable} employees={employees} onSearch={employeeSearch.search} onMore={employeeSearch.more} searchLoading={employeeSearch.loading} hasMore={employeeSearch.hasMore} employeeId={employeeId} norms={availableNorms} normSetId={normSetId} normSelectionId={normSelection.displayId} currentNormLabel={normDetail?.normSet.versionName ?? document?.content.normVersionName} normsState={normListLoading ? "loading" : normListError ? "error" : "ready"} date={documentDate} responsibleName={responsibleName} basis={basis} employeeDetails={employeeDetails} onEmployee={selectEmployee} onNorm={normSelection.select} onDate={setDocumentDate} onResponsibleName={setResponsibleName} onBasis={setBasis} onEmployeeDetails={setEmployeeDetails} /> : null}
    {!initialLoading && step === 2 ? <EmployeeCheck employee={selectedEmployee} details={employeeDetails} norm={availableNorms.find(row => row.id === normSetId)?.versionName ?? document?.content.normVersionName} rows={selectedNormRows} onEdit={() => setStep(1)} /> : null}
    {!initialLoading && step === 3 ? <DocumentKit contextKey={`${employeeId}:${document?.id ?? "new"}`} currentUserId={currentUserId} canManageTemplates={canManageTemplates} normSetId={normSetId} rows={selectedNormRows} allRows={normRows} lines={lines} editable={canManage && !immutable && !formLocked} date={documentDate} onLines={setLines} onAddFullKit={addFullKit} /> : null}
    {!initialLoading && step === 4 ? <DocumentReview key={document?.id ?? "none"} busy={busy} canExport={canExport} canManage={canManage} document={document} hasErrors={hasErrors || hasUnsavedChanges} previewType={files.type} previewUrl={files.url} previewName={files.downloadName} filePending={files.pendingAction} fileError={files.error} onPreview={files.prepare} onConfirm={confirm} onDownload={files.download} /> : null}
    {!initialLoading ? <DocumentFooter step={step} canManage={canManage} busy={busy} immutable={immutable} document={document} canSave={canSaveDocument} hasLines={Boolean(lines.length)} onStep={setStep} onSave={() => void persist()} onNext={() => void next()} onValidate={() => void validate()} /> : null}
    {step === 1 ? <DocumentHistory history={history} busy={busy} onOpen={id => void resume(id)} /> : null}
    {document?.validation.warnings.length ? <div className="ppe-document-alert is-warning">{document.validation.warnings.map((problem) => <div key={`${problem.lineId}-${problem.code}`}>{problem.message}</div>)}</div> : null}
    {leaveDialog}
    {normSelection.choice ? <NormChangeDialog choice={normSelection.choice} onConfirm={normSelection.accept} onClose={normSelection.decline} busy={saving || commandPending || resuming || validating} /> : null}
    {employeeChangeId !== null ? <DocumentConfirmation title="Сменить сотрудника?" subtitle={employees.find(employee => employee.id === employeeChangeId)?.fullName} action="Сменить сотрудника" danger onConfirm={() => { applyEmployee(employeeChangeId); return true; }} onClose={() => setEmployeeChangeId(null)}><p>Несохранённый ввод текущего сотрудника будет потерян. Сохранённые документы останутся в журнале.</p></DocumentConfirmation> : null}
  </section>;
}
