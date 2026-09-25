import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, Download, Eye, FileText, Plus, RefreshCw, Trash2 } from "lucide-react";
import type { InventoryEmployeeDto, InventoryPpeEmployeeDetailsDto, InventoryPpeNormRowDto, InventoryPpeNormSetDetailDto, InventoryPpeNormSetDto, PpeIssueDocumentDto, PpeIssueDocumentLineInputDto, SavePpeIssueDocumentDto } from "../../api/contracts";
import type { ScreenId } from "../../types";
import { createClientUuid } from "../../shared/clientUuid";
import { useInventoryRepository } from "../../repositories/inventoryRepositoryContext";
import { ApiError } from "../../api/client";
import { ppeErrorMessage } from "./ppe/ppeErrors";
import "./styles/ppe-issue-document.css";
import "./styles/ppe-reference.css";
import type { DraftLine } from "./ppe/documentWorkflow";
import { StepEmployee, EmployeeCheck } from "./ppe/DocumentEmployee";
import { DocumentKit } from "./ppe/DocumentKit";
import { DocumentActions } from "./ppe/DocumentActions";
import { DocumentReview } from "./ppe/DocumentReview";
import { fingerprintOf, confirmKeyStorageKey, alternativeKey, createDraftLine, mergeServerLines, messageOf, problemMessagesOf, validateDraftLines, formatRuDate, formatDocumentStatus } from "./ppe/documentDraft";
export { formatDocumentStatus, formatRuDate, formatNormQuantity, formatPriceInput, parsePriceInput, problemMessagesOf, validateDraftLines, toLineInput, mergeServerLines } from "./ppe/documentDraft";

type Step = 1 | 2 | 3 | 4;

const storageKey = (userId: string) => `patrol360.inventory.ppe.issue-document.${userId}`;
const emptyEmployeeDetails: InventoryPpeEmployeeDetailsDto = { gender: "", height: "", clothingSize: "", shoeSize: "", headSize: "", respiratorSize: "", handProtectionSize: "" };
const localToday = () => { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; };

export function isPpeIssueDocumentConfirmable(document: Pick<PpeIssueDocumentDto, "status" | "validation"> | null) {
  return Boolean(document && document.status.toLowerCase() === "draft" && document.validation.errors.length === 0);
}

export function PpeIssueDocumentConstructor({ currentUserId = "anonymous", canManage = false, canManageTemplates = false, canExport = false, onNavigate, onNotify }: { currentUserId?: string; canManage?: boolean; canManageTemplates?: boolean; canExport?: boolean; onNavigate: (screen: ScreenId) => void; onNotify: (message: string) => void }) {
  const repository = useInventoryRepository();
  const [step, setStep] = useState<Step>(1);
  const [employees, setEmployees] = useState<InventoryEmployeeDto[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [norms, setNorms] = useState<InventoryPpeNormSetDto[]>([]);
  const [normSetId, setNormSetId] = useState("");
  const [normDetail, setNormDetail] = useState<InventoryPpeNormSetDetailDto | null>(null);
  const [documentDate, setDocumentDate] = useState(localToday);
  const [responsibleName, setResponsibleName] = useState("");
  const [basis, setBasis] = useState("Приказ о выдаче СИЗ");
  const [employeeDetails, setEmployeeDetails] = useState<InventoryPpeEmployeeDetailsDto>(emptyEmployeeDetails);
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [document, setDocument] = useState<PpeIssueDocumentDto | null>(null);
  const [history, setHistory] = useState<Array<{ id: string; employeeName: string; documentDate: string; status: string; linesCount: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const validationInFlightRef = useRef(false);
  const [error, setError] = useState("");
  const [problemMessages, setProblemMessages] = useState<string[]>([]);
  const [normChangeRequired, setNormChangeRequired] = useState(false);
  const [acceptNormChange, setAcceptNormChange] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewType, setPreviewType] = useState<"norms" | "signature" | "both">("norms");
  const [legacyCardId, setLegacyCardId] = useState("");
  const previewUrlRef = useRef("");
  const previewRequestRef = useRef(0);
  const linesRef = useRef(lines);
  const lastSavedFingerprintRef = useRef("");
  const pendingKitNormRef = useRef("");
  const previousNormRef = useRef<{ id: string; detail: InventoryPpeNormSetDetailDto | null }>({ id: "", detail: null });
  const saveInFlightRef = useRef(false);
  const savePromiseRef = useRef<Promise<PpeIssueDocumentDto> | null>(null);
  const documentRef = useRef<PpeIssueDocumentDto | null>(null);
  const normsRequestRef = useRef(0);
  const normDetailRequestRef = useRef(0);
  const resumeRequestRef = useRef(0);
  const historyRequestRef = useRef(0);
  const sessionRequestRef = useRef(0);
  const resumeInFlightRef = useRef(false);
  const [resuming, setResuming] = useState(false);

  const busy = saving || resuming || validating;
  const selectedEmployee = employees.find((employee) => employee.id === employeeId);
  const immutable = Boolean(document && document.status.toLowerCase() !== "draft");
  const validation = document?.validation;
  const hasErrors = Boolean(validation?.errors.length);
  const selectedNormRows = useMemo(() => (immutable ? document?.content.normRows ?? [] : normDetail?.rows ?? []).filter((row) => row.rowType === "item"), [document, immutable, normDetail]);
  const draftFingerprint = useMemo(() => fingerprintOf(employeeId, normSetId, documentDate, responsibleName, basis, employeeDetails, lines, acceptNormChange), [acceptNormChange, basis, documentDate, employeeDetails, employeeId, lines, normSetId, responsibleName]);
  const hasUnsavedChanges = Boolean(document && !immutable && lastSavedFingerprintRef.current !== draftFingerprint);

  useEffect(() => {
    previewRequestRef.current++;
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = ""; setPreviewUrl("");
  }, [draftFingerprint, document?.id, document?.version]);
  useEffect(() => () => { previewRequestRef.current++; if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current); }, []);
  useEffect(() => { linesRef.current = lines; }, [lines]);
  useEffect(() => { documentRef.current = document; }, [document]);
  useEffect(() => {
    const sessionId = ++sessionRequestRef.current;
    validationInFlightRef.current = false;
    setValidating(false);
    documentRef.current = null;
    lastSavedFingerprintRef.current = "";
    setDocument(null);
    setEmployeeId("");
    setNormSetId("");
    setNormDetail(null);
    setLines([]);
    setHistory([]);
    setStep(1);
    setLoading(true);
    const controller = new AbortController();
    void (async () => {
      const all: InventoryEmployeeDto[] = [];
      let page = 1;
      let pageCount = 1;
      do {
        const result = await repository.getEmployees({ page, pageSize: 200, status: "active" }, { signal: controller.signal });
        all.push(...result.rows); pageCount = result.pageCount; page += 1;
      } while (page <= pageCount && !controller.signal.aborted);
      return all;
    })()
      .then((result) => { if (!controller.signal.aborted) setEmployees(result); })
      .catch((reason) => { if (sessionId === sessionRequestRef.current && !controller.signal.aborted) setError(messageOf(reason, "Не удалось загрузить сотрудников")); })
      .finally(() => { if (sessionId === sessionRequestRef.current && !controller.signal.aborted) setLoading(false); });
    const requestedId = window.sessionStorage.getItem(`ppe.open-document.${currentUserId}`);
    const savedId = requestedId ?? window.localStorage.getItem(storageKey(currentUserId));
    if (savedId) void resume(savedId);
    return () => {
      controller.abort();
      sessionRequestRef.current += 1;
      normsRequestRef.current += 1;
      normDetailRequestRef.current += 1;
      historyRequestRef.current += 1;
      resumeRequestRef.current += 1;
      resumeInFlightRef.current = false;
    };
  // The repository is stable under its provider; restoring only once avoids overwriting active edits.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId, repository]);

  useEffect(() => {
    const requestId = ++normsRequestRef.current;
    const historyRequestId = ++historyRequestRef.current;
    if (!employeeId || immutable) { if (!employeeId) { setNorms([]); setNormSetId(""); setHistory([]); } return; }
    void repository.getPpeIssueDocumentNorms(employeeId, documentDate)
      .then((value) => { if (requestId === normsRequestRef.current) { setNorms(value); setNormSetId((current) => value.some((norm) => norm.id === current) ? current : ""); } })
      .catch((reason) => { if (requestId === normsRequestRef.current) setError(messageOf(reason, "Не удалось загрузить применимые нормы")); });
    void repository.getPpeIssueDocuments(employeeId)
      .then((value) => { if (historyRequestId === historyRequestRef.current) setHistory(value); })
      .catch(() => undefined);
    return () => { normsRequestRef.current += 1; historyRequestRef.current += 1; };
  }, [documentDate, employeeId, repository]);

  useEffect(() => {
    const requestId = ++normDetailRequestRef.current;
    if (!normSetId || immutable) { setNormDetail(null); return; }
    void repository.getPpeNormSet(normSetId)
      .then((detail) => {
        if (requestId !== normDetailRequestRef.current) return;
        const available = new Set(detail.rows.filter((row) => row.rowType === "item").map((row) => row.id));
        const removed = linesRef.current.filter((line) => !available.has(line.normRowId));
        if (removed.length && !window.confirm(`В новой норме отсутствуют ${removed.length} выбранных строк. Удалить их и продолжить?`)) { pendingKitNormRef.current = ""; setNormSetId(previousNormRef.current.id); setNormDetail(previousNormRef.current.detail); return; }
        if (removed.length) { setLines((current) => current.filter((line) => available.has(line.normRowId))); setAcceptNormChange(true); }
        setNormDetail(detail);
        if (pendingKitNormRef.current === normSetId) {
          pendingKitNormRef.current = "";
          setLines(current => appendNormKit(current.filter(line => available.has(line.normRowId)), detail.rows.filter(row => row.rowType === "item")));
        }
        previousNormRef.current = { id: normSetId, detail };
      })
      .catch((reason) => { if (requestId === normDetailRequestRef.current) setError(messageOf(reason, "Не удалось открыть состав нормы")); });
    return () => { normDetailRequestRef.current += 1; };
  }, [immutable, normSetId, repository]);

  const payload = useCallback((expectedVersion?: number, acceptChange = acceptNormChange): SavePpeIssueDocumentDto | null => {
    if (!employeeId || !normSetId) return null;
    return { employeeId, normSetId, documentDate, responsibleName, basis, employeeDetails, lines: lines.map(({ itemName: _itemName, unitSymbol: _unitSymbol, normName: _normName, approved: _approved, ...line }) => line), expectedVersion, acceptNormChange: acceptChange };
  }, [acceptNormChange, basis, documentDate, employeeDetails, employeeId, lines, normSetId, responsibleName]);

  const persist = useCallback(async (acceptChange = acceptNormChange) => {
    if (!canManage || immutable) return document;
    if (saveInFlightRef.current) {
      try { return await savePromiseRef.current; } catch { return null; }
    }
    const clientError = validateDraftLines(lines);
    if (clientError) { setError(clientError); return null; }
    const currentDocument = documentRef.current;
    const nextPayload = payload(currentDocument?.version, acceptChange);
    if (!nextPayload) { setError("Выберите сотрудника и применимую норму."); return null; }
    saveInFlightRef.current = true;
    setSaving(true); setError(""); setProblemMessages([]); setNormChangeRequired(false);
    try {
      const request = currentDocument ? repository.updatePpeIssueDocument(currentDocument.id, nextPayload) : repository.createPpeIssueDocument(nextPayload);
      savePromiseRef.current = request;
      const next = await request;
      documentRef.current = next;
      setDocument(next);
      setLines((current) => mergeServerLines(next, current, nextPayload.lines));
      lastSavedFingerprintRef.current = draftFingerprint;
      window.localStorage.setItem(storageKey(currentUserId), next.id);
      return next;
    } catch (reason) {
      const messages = problemMessagesOf(reason);
      setProblemMessages(messages);
      setNormChangeRequired(reason instanceof ApiError && Boolean(reason.errors?.normChanged));
      setError(messageOf(reason, "Не удалось сохранить документ. Проверьте конфликт версии и повторите."));
      return null;
    }
    finally { savePromiseRef.current = null; saveInFlightRef.current = false; setSaving(false); }
  }, [acceptNormChange, canManage, currentUserId, document, draftFingerprint, immutable, lines, payload, repository]);

  const saveForAction = useCallback(async (acceptChange = acceptNormChange) => {
    if (savePromiseRef.current) {
      try { await savePromiseRef.current; } catch { return null; }
    }
    if (lastSavedFingerprintRef.current !== draftFingerprint) return persist(acceptChange);
    return documentRef.current;
  }, [acceptNormChange, draftFingerprint, persist]);

  useEffect(() => {
    if (!canManage || !document || immutable || saving || lastSavedFingerprintRef.current === draftFingerprint) return;
    const timer = window.setTimeout(() => { void persist(); }, 450);
    return () => window.clearTimeout(timer);
  }, [canManage, document?.id, draftFingerprint, immutable, persist, saving]);

  async function resume(id: string) {
    const requestId = ++resumeRequestRef.current;
    normDetailRequestRef.current += 1;
    resumeInFlightRef.current = true;
    setResuming(true);
    try {
      const value = await repository.getPpeIssueDocument(id);
      if (requestId !== resumeRequestRef.current) return;
      window.localStorage.setItem(storageKey(currentUserId), value.id);
      window.sessionStorage.removeItem(`ppe.open-document.${currentUserId}`);
      const resumedLines = value.content.lines.map((line) => ({ ...line, normPoint: line.normPoint ?? value.content.normRows.find(row => row.id === line.normRowId)?.normPoint, normName: value.content.normRows.find((row) => row.id === line.normRowId)?.normItemName ?? "Норма", approved: true }));
      documentRef.current = value;
      setDocument(value); setEmployeeId(value.content.employee.id); setNormSetId(value.content.normSetId);
      setDocumentDate(value.content.documentDate); setResponsibleName(value.content.responsibleName); setBasis(value.content.basis);
      setEmployeeDetails(value.content.employee.details ?? emptyEmployeeDetails);
      setLines(resumedLines);
      lastSavedFingerprintRef.current = fingerprintOf(value.content.employee.id, value.content.normSetId, value.content.documentDate, value.content.responsibleName, value.content.basis, value.content.employee.details ?? emptyEmployeeDetails, resumedLines, false);
      setStep(value.status.toLowerCase() === "draft" ? 2 : 4);
    } catch (reason) { if (requestId === resumeRequestRef.current) { window.localStorage.removeItem(storageKey(currentUserId)); window.sessionStorage.removeItem(`ppe.open-document.${currentUserId}`); setError(messageOf(reason, "Не удалось открыть документ")); } }
    finally { if (requestId === resumeRequestRef.current) { resumeInFlightRef.current = false; setResuming(false); } }
  }
  async function migrateLegacyDraft() {
    if (!legacyCardId.trim()) { setError("Укажите идентификатор карточки с черновиком для миграции."); return; }
    try {
      const result = await repository.migratePpeLegacyDraft(legacyCardId.trim());
      if (result.warnings.length) onNotify(result.warnings.join(" "));
      if (result.documentId) await resume(result.documentId);
      else setError("В карточке нет черновика, доступного для миграции.");
    } catch (reason) { setError(messageOf(reason, "Не удалось мигрировать черновик карточки")); }
  }
  async function acceptNormChangeAndSave() {
    setAcceptNormChange(true);
    const saved = await saveForAction(true);
    if (saved) { setNormChangeRequired(false); onNotify("Изменение нормы подтверждено, черновик обновлён"); }
  }
  function startNewIssue() {
    if (saveInFlightRef.current || resumeInFlightRef.current) return;
    resumeRequestRef.current += 1;
    normsRequestRef.current += 1;
    normDetailRequestRef.current += 1;
    historyRequestRef.current += 1;
    if (hasUnsavedChanges && !window.confirm("Несохранённые изменения текущего черновика будут потеряны. Начать новую выдачу?")) return;
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = "";
    if (document) window.localStorage.removeItem(confirmKeyStorageKey(document.id));
    documentRef.current = null;
    lastSavedFingerprintRef.current = "";
    window.localStorage.removeItem(storageKey(currentUserId));
    setDocument(null);
    setLines([]);
    setPreviewUrl("");
    setError("");
    setProblemMessages([]);
    setNormChangeRequired(false);
    setAcceptNormChange(false);
    setStep(employeeId && normSetId ? 2 : 1);
  }
  async function cancelDraft() {
    if (!document || document.status.toLowerCase() !== "draft") return;
    if (!window.confirm("Отменить черновик выдачи? Его нельзя будет редактировать.")) return;
    try {
      setSaving(true);
      const cancelled = await repository.cancelPpeIssueDocument(document.id, document.version);
      setDocument(cancelled);
      setStep(4);
      lastSavedFingerprintRef.current = draftFingerprint;
      onNotify("Черновик выдачи отменён");
    } catch (reason) {
      setProblemMessages(problemMessagesOf(reason));
      setError(messageOf(reason, "Не удалось отменить черновик выдачи"));
    } finally { setSaving(false); }
  }

  function addMapping(row: InventoryPpeNormRowDto, mapping: NonNullable<InventoryPpeNormRowDto["mappings"]>[number]) {
    if (!canManage || !mapping.isApproved) return;
    setLines((current) => [...current, createDraftLine(row, mapping, documentDate, false)]);
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

  function updateLine(id: string, patch: Partial<DraftLine>) { if (canManage) setLines((current) => current.map((line) => line.id === id ? { ...line, ...patch } : line)); }
  function removeLine(id: string) { if (canManage) setLines((current) => current.filter((line) => line.id !== id)); }
  function selectEmployee(id: string) {
    if (saveInFlightRef.current || resumeInFlightRef.current) return;
    if (!canManage) {
      resumeRequestRef.current += 1;
      normDetailRequestRef.current += 1;
      documentRef.current = null;
      setDocument(null); setLines([]); setNormDetail(null); setNormSetId(""); setEmployeeId(id); setStep(1);
      return;
    }
    if (document && id !== document.content.employee.id) {
      documentRef.current = null;
      setDocument(null); setLines([]); setNormDetail(null); setNormSetId(""); setAcceptNormChange(false); lastSavedFingerprintRef.current = "";
    }
    if (id !== employeeId) { setEmployeeDetails(emptyEmployeeDetails); setLines([]); setNormDetail(null); setNormSetId(""); }
    setEmployeeId(id);
  }
  async function next() { if (step === 1 && (!employeeId || !normSetId)) { setError("Выберите сотрудника и норму."); return; } const saved = await saveForAction(); if (saved && step < 4) setStep((value) => (value + 1) as Step); }
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
  async function confirm() { if (!document || hasErrors || saving) return; try { setSaving(true); const keyStorage = confirmKeyStorageKey(document.id); const idempotencyKey = window.localStorage.getItem(keyStorage) ?? createClientUuid(); window.localStorage.setItem(keyStorage, idempotencyKey); const confirmed = await repository.confirmPpeIssueDocument(document.id, document.version, idempotencyKey); setDocument(confirmed); onNotify("Документ выдачи подтверждён"); } catch (reason) { setProblemMessages(problemMessagesOf(reason)); setError(messageOf(reason, "Не удалось подтвердить документ")); } finally { setSaving(false); } }
  async function preview(type: "norms" | "signature" | "both") {
    if (!document || !canExport) return;
    const request = ++previewRequestRef.current;
    setPreviewType(type); setPreviewUrl(""); setError("");
    try {
      const file = await repository.printPpeIssueDocument(document.id, type, "pdf");
      if (request !== previewRequestRef.current) return;
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      const url = URL.createObjectURL(file.blob); previewUrlRef.current = url; setPreviewUrl(url);
    } catch (reason) { if (request === previewRequestRef.current) setError(messageOf(reason, "Не удалось сформировать PDF")); }
  }
  async function download(type: "norms" | "signature" | "both", format: "docx" | "pdf") { if (!document) return; try { const file = await repository.printPpeIssueDocument(document.id, type, format); const link = window.document.createElement("a"); link.href = URL.createObjectURL(file.blob); link.download = file.downloadName; link.click(); URL.revokeObjectURL(link.href); } catch (reason) { setProblemMessages(problemMessagesOf(reason)); setError(messageOf(reason, `Не удалось сформировать ${format.toUpperCase()}`)); } }

  return <section className="ppe-document-screen">
    <header className="ppe-document-head"><div><h1>{step === 4 ? "Предпросмотр и печать" : "Оформление выдачи СИЗ"}</h1>{selectedEmployee ? <p>{selectedEmployee.fullName} · Табельный № {selectedEmployee.personnelNo}</p> : <p>Выберите сотрудника и подготовьте комплект</p>}</div><div className="ppe-document-head-actions"><button className="button ghost" disabled={busy} onClick={() => onNavigate("inventory-ppe")} type="button"><ArrowLeft size={16} /> К журналу</button>{canManage ? <DocumentActions busy={busy} draft={document?.status.toLowerCase() === "draft"} cardId={legacyCardId} onCardId={setLegacyCardId} onNew={startNewIssue} onCancel={() => void cancelDraft()} onMigrate={() => void migrateLegacyDraft()} /> : null}</div></header>
    <ol className="ppe-document-steps">{["Сотрудник", "Проверка", "Комплект СИЗ", "Документы"].map((label, index) => <li className={step === index + 1 ? "is-active" : step > index + 1 ? "is-done" : ""} key={label}><span>{index + 1}</span>{label}</li>)}</ol>
    {error ? <div className="ppe-document-alert is-error"><AlertTriangle size={17} /><div><div>{error}</div>{problemMessages.map((message) => <div key={message}>{message}</div>)}{normChangeRequired ? <button className="button secondary" disabled={saving} onClick={() => void acceptNormChangeAndSave()} type="button">Подтвердить смену нормы и сохранить</button> : null}</div></div> : null}
    {loading ? <div className="ppe-document-state">Загрузка конструктора…</div> : null}
    {!loading && step === 1 ? <StepEmployee canSelectEmployee={!busy} editable={canManage && !busy && !immutable} employees={employees} employeeId={employeeId} norms={norms} normSetId={normSetId} date={documentDate} responsibleName={responsibleName} basis={basis} employeeDetails={employeeDetails} onEmployee={selectEmployee} onNorm={id => { pendingKitNormRef.current = id; setNormSetId(id); }} onDate={setDocumentDate} onResponsibleName={setResponsibleName} onBasis={setBasis} onEmployeeDetails={setEmployeeDetails} /> : null}
    {!loading && step === 2 ? <EmployeeCheck employee={selectedEmployee} details={employeeDetails} norm={norms.find(row => row.id === normSetId)?.versionName} rows={selectedNormRows} onEdit={() => setStep(1)} /> : null}
    {!loading && step === 3 ? <DocumentKit currentUserId={currentUserId} canManageTemplates={canManageTemplates} normSetId={normSetId} rows={selectedNormRows} allRows={normDetail?.rows ?? []} lines={lines} editable={canManage && !immutable && !busy} date={documentDate} onLines={setLines} onAddFullKit={addFullKit} /> : null}
    {!loading && step === 4 ? <DocumentReview busy={busy} canExport={canExport} canManage={canManage} document={document} hasErrors={hasErrors} previewType={previewType} previewUrl={previewUrl} onPreview={(type) => void preview(type)} onConfirm={() => void confirm()} onDownload={(type, format) => void download(type, format)} /> : null}
    {!loading && canManage ? <footer className="ppe-document-footer">
      <button className="button ghost" disabled={step === 1 || busy || immutable} onClick={() => setStep((value) => (value - 1) as Step)} type="button"><ArrowLeft size={16} /> Назад</button>
      {document ? <span className="ppe-document-saved" data-status={document.status}>
        {document.status === "draft" ? "Черновик" : document.status === "confirmed" ? "Выдача подтверждена" : "Черновик отменён"} · версия {document.version}
      </span> : null}
      {!immutable ? <button className="button secondary" disabled={busy || !employeeId || !normSetId} onClick={() => void persist()} type="button">Сохранить черновик</button> : null}
      {step < 3 ? <button className="button primary" disabled={immutable || busy} onClick={() => void next()} type="button">Далее <ArrowRight size={16} /></button>
        : step === 3 ? <button className="button primary" disabled={immutable || busy || !lines.length} onClick={() => void validate()} type="button"><CheckCircle2 size={16} /> Предпросмотр документов</button> : null}
    </footer> : null}
    {!loading && !canManage && document ? <footer className="ppe-document-footer"><button className="button secondary" disabled={step <= 1 || busy} onClick={() => setStep(value => (value - 1) as Step)} type="button">Назад</button><button className="button secondary" disabled={step >= 4 || busy} onClick={() => setStep(value => (value + 1) as Step)} type="button">Далее</button></footer> : null}
    {history.length && step === 1 ? <section className="ppe-document-history"><h2>Документы сотрудника</h2>{history.map((item) => <button disabled={busy} key={item.id} onClick={() => void resume(item.id)} type="button"><span>{formatRuDate(item.documentDate)} · {item.employeeName}</span><small>{formatDocumentStatus(item.status)} · {item.linesCount} строк</small></button>)}</section> : null}
    {document?.validation.warnings.length ? <div className="ppe-document-alert is-warning">{document.validation.warnings.map((problem) => <div key={`${problem.lineId}-${problem.code}`}>{problem.message}</div>)}</div> : null}
  </section>;
}
