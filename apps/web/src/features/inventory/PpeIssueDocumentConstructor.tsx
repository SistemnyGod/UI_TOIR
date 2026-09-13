import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, Download, Eye, FileText, Plus, RefreshCw, Trash2 } from "lucide-react";
import type { InventoryEmployeeDto, InventoryPpeEmployeeDetailsDto, InventoryPpeNormRowDto, InventoryPpeNormSetDetailDto, InventoryPpeNormSetDto, PpeIssueDocumentDto, PpeIssueDocumentLineInputDto, SavePpeIssueDocumentDto } from "../../api/contracts";
import type { ScreenId } from "../../types";
import { createClientUuid } from "../../shared/clientUuid";
import { useInventoryRepository } from "../../repositories/inventoryRepositoryContext";
import { ApiError } from "../../api/client";
import "./styles/ppe-issue-document.css";
import "./styles/ppe-issue-document-fixes.css";

type Step = 1 | 2 | 3 | 4;
type DraftLine = PpeIssueDocumentLineInputDto & { itemName: string; unitSymbol: string; normName: string; approved: boolean };
const storageKey = (userId: string) => `patrol360.inventory.ppe.issue-document.${userId}`;
const emptyEmployeeDetails: InventoryPpeEmployeeDetailsDto = { gender: "", height: "", clothingSize: "", shoeSize: "", headSize: "", respiratorSize: "", handProtectionSize: "" };
const localToday = () => { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; };

export function isPpeIssueDocumentConfirmable(document: Pick<PpeIssueDocumentDto, "status" | "validation"> | null) {
  return Boolean(document && document.status.toLowerCase() === "draft" && document.validation.errors.length === 0);
}

export function PpeIssueDocumentConstructor({ currentUserId = "anonymous", canManage = false, canExport = false, onNavigate, onNotify }: { currentUserId?: string; canManage?: boolean; canExport?: boolean; onNavigate: (screen: ScreenId) => void; onNotify: (message: string) => void }) {
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
  const [error, setError] = useState("");
  const [problemMessages, setProblemMessages] = useState<string[]>([]);
  const [normChangeRequired, setNormChangeRequired] = useState(false);
  const [acceptNormChange, setAcceptNormChange] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewType, setPreviewType] = useState<"norms" | "signature">("norms");
  const [legacyCardId, setLegacyCardId] = useState("");
  const previewUrlRef = useRef("");
  const linesRef = useRef(lines);
  const lastSavedFingerprintRef = useRef("");
  const previousNormRef = useRef<{ id: string; detail: InventoryPpeNormSetDetailDto | null }>({ id: "", detail: null });
  const saveInFlightRef = useRef(false);
  const savePromiseRef = useRef<Promise<PpeIssueDocumentDto> | null>(null);
  const documentRef = useRef<PpeIssueDocumentDto | null>(null);
  const normsRequestRef = useRef(0);
  const normDetailRequestRef = useRef(0);
  const resumeRequestRef = useRef(0);

  const selectedEmployee = employees.find((employee) => employee.id === employeeId);
  const immutable = Boolean(document && document.status.toLowerCase() !== "draft");
  const validation = document?.validation;
  const hasErrors = Boolean(validation?.errors.length);
  const selectedNormRows = useMemo(() => (normDetail?.rows ?? []).filter((row) => row.rowType === "item"), [normDetail]);
  const draftFingerprint = useMemo(() => fingerprintOf(employeeId, normSetId, documentDate, responsibleName, basis, employeeDetails, lines, acceptNormChange), [acceptNormChange, basis, documentDate, employeeDetails, employeeId, lines, normSetId, responsibleName]);
  const hasUnsavedChanges = Boolean(document && !immutable && lastSavedFingerprintRef.current !== draftFingerprint);

  useEffect(() => () => { if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current); }, []);
  useEffect(() => { linesRef.current = lines; }, [lines]);
  useEffect(() => { documentRef.current = document; }, [document]);
  useEffect(() => {
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
      .catch((reason) => setError(messageOf(reason, "Не удалось загрузить сотрудников")))
      .finally(() => setLoading(false));
    const savedId = window.localStorage.getItem(storageKey(currentUserId));
    if (savedId) void resume(savedId);
    return () => controller.abort();
  // The repository is stable under its provider; restoring only once avoids overwriting active edits.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId, repository]);

  useEffect(() => {
    const requestId = ++normsRequestRef.current;
    if (!employeeId || immutable) { if (!employeeId) { setNorms([]); setNormSetId(""); } return; }
    void repository.getPpeIssueDocumentNorms(employeeId, documentDate)
      .then((value) => { if (requestId === normsRequestRef.current) { setNorms(value); setNormSetId((current) => value.some((norm) => norm.id === current) ? current : ""); } })
      .catch((reason) => { if (requestId === normsRequestRef.current) setError(messageOf(reason, "Не удалось загрузить применимые нормы")); });
    void repository.getPpeIssueDocuments(employeeId)
      .then((value) => setHistory(value))
      .catch(() => undefined);
  }, [documentDate, employeeId, repository]);

  useEffect(() => {
    const requestId = ++normDetailRequestRef.current;
    if (!normSetId) { setNormDetail(null); return; }
    void repository.getPpeNormSet(normSetId)
      .then((detail) => {
        if (requestId !== normDetailRequestRef.current) return;
        const available = new Set(detail.rows.filter((row) => row.rowType === "item").map((row) => row.id));
        const removed = linesRef.current.filter((line) => !available.has(line.normRowId));
        if (removed.length && !window.confirm(`В новой норме отсутствуют ${removed.length} выбранных строк. Удалить их и продолжить?`)) { setNormSetId(previousNormRef.current.id); setNormDetail(previousNormRef.current.detail); return; }
        if (removed.length) { setLines((current) => current.filter((line) => available.has(line.normRowId))); setAcceptNormChange(true); }
        setNormDetail(detail);
        previousNormRef.current = { id: normSetId, detail };
      })
      .catch((reason) => { if (requestId === normDetailRequestRef.current) setError(messageOf(reason, "Не удалось открыть состав нормы")); });
  }, [normSetId, repository]);

  const payload = useCallback((expectedVersion?: number, acceptChange = acceptNormChange): SavePpeIssueDocumentDto | null => {
    if (!employeeId || !normSetId) return null;
    return { employeeId, normSetId, documentDate, responsibleName, basis, employeeDetails, lines: lines.map(({ itemName: _itemName, unitSymbol: _unitSymbol, normName: _normName, approved: _approved, ...line }) => line), expectedVersion, acceptNormChange: acceptChange };
  }, [acceptNormChange, basis, documentDate, employeeDetails, employeeId, lines, normSetId, responsibleName]);

  const persist = useCallback(async (acceptChange = acceptNormChange) => {
    if (immutable) return document;
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
  }, [acceptNormChange, currentUserId, document, draftFingerprint, immutable, lines, payload, repository]);

  const saveForAction = useCallback(async (acceptChange = acceptNormChange) => {
    if (savePromiseRef.current) {
      try { await savePromiseRef.current; } catch { return null; }
    }
    if (lastSavedFingerprintRef.current !== draftFingerprint) return persist(acceptChange);
    return documentRef.current;
  }, [acceptNormChange, draftFingerprint, persist]);

  useEffect(() => {
    if (!document || immutable || saving || lastSavedFingerprintRef.current === draftFingerprint) return;
    const timer = window.setTimeout(() => { void persist(); }, 450);
    return () => window.clearTimeout(timer);
  }, [document?.id, draftFingerprint, immutable, persist, saving]);

  async function resume(id: string) {
    const requestId = ++resumeRequestRef.current;
    try {
      const value = await repository.getPpeIssueDocument(id);
      if (requestId !== resumeRequestRef.current) return;
      const resumedLines = value.content.lines.map((line) => ({ ...line, normName: value.content.normRows.find((row) => row.id === line.normRowId)?.normItemName ?? "Норма", approved: true }));
      documentRef.current = value;
      setDocument(value); setEmployeeId(value.content.employee.id); setNormSetId(value.content.normSetId);
      setDocumentDate(value.content.documentDate); setResponsibleName(value.content.responsibleName); setBasis(value.content.basis);
      setEmployeeDetails(value.content.employee.details ?? emptyEmployeeDetails);
      setLines(resumedLines);
      lastSavedFingerprintRef.current = fingerprintOf(value.content.employee.id, value.content.normSetId, value.content.documentDate, value.content.responsibleName, value.content.basis, value.content.employee.details ?? emptyEmployeeDetails, resumedLines, false);
      setStep(value.status.toLowerCase() === "draft" ? 2 : 4);
    } catch { if (requestId === resumeRequestRef.current) window.localStorage.removeItem(storageKey(currentUserId)); }
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
    if (!mapping.isApproved) return;
    setLines((current) => [...current, createDraftLine(row, mapping, documentDate, false)]);
  }
  function addFullKit() {
    const rowsById = new Map(selectedNormRows.map((row) => [row.id, row]));
    setLines((current) => {
      const selectedGroups = new Set(current.map((line) => alternativeKey(rowsById.get(line.normRowId))));
      const next = [...current];
      selectedNormRows.forEach((row) => {
        const group = alternativeKey(row);
        if (selectedGroups.has(group)) return;
        const approved = row.mappings.filter((candidate) => candidate.isApproved);
        const mapping = approved.find((candidate) => candidate.isDefault) ?? approved[0];
        if (!mapping) return;
        next.push(createDraftLine(row, mapping, documentDate, true));
        selectedGroups.add(group);
      });
      return next;
    });
  }

  function updateLine(id: string, patch: Partial<DraftLine>) { setLines((current) => current.map((line) => line.id === id ? { ...line, ...patch } : line)); }
  function removeLine(id: string) { setLines((current) => current.filter((line) => line.id !== id)); }
  function selectEmployee(id: string) {
    if (document && id !== document.content.employee.id) {
      documentRef.current = null;
      setDocument(null); setLines([]); setNormDetail(null); setNormSetId(""); setAcceptNormChange(false); lastSavedFingerprintRef.current = "";
    }
    setEmployeeId(id);
  }
  async function next() { if (step === 1 && (!employeeId || !normSetId)) { setError("Выберите сотрудника и норму."); return; } const saved = await saveForAction(); if (saved && step < 4) setStep((value) => (value + 1) as Step); }
  async function validate() { const saved = await saveForAction(); if (!saved) return; try { setDocument(await repository.validatePpeIssueDocument(saved.id)); setStep(4); } catch (reason) { setProblemMessages(problemMessagesOf(reason)); setError(messageOf(reason, "Не удалось выполнить проверку")); } }
  async function confirm() { if (!document || hasErrors || saving) return; try { setSaving(true); const keyStorage = confirmKeyStorageKey(document.id); const idempotencyKey = window.localStorage.getItem(keyStorage) ?? createClientUuid(); window.localStorage.setItem(keyStorage, idempotencyKey); const confirmed = await repository.confirmPpeIssueDocument(document.id, document.version, idempotencyKey); setDocument(confirmed); onNotify("Документ выдачи подтверждён"); } catch (reason) { setProblemMessages(problemMessagesOf(reason)); setError(messageOf(reason, "Не удалось подтвердить документ")); } finally { setSaving(false); } }
  async function preview(type: "norms" | "signature") { if (!document) return; try { setPreviewType(type); const file = await repository.printPpeIssueDocument(document.id, type, "pdf"); if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current); const url = URL.createObjectURL(file.blob); previewUrlRef.current = url; setPreviewUrl(url); } catch (reason) { setError(messageOf(reason, "Не удалось сформировать PDF")); } }
  async function download(type: "norms" | "signature", format: "docx" | "pdf") { if (!document) return; try { const file = await repository.printPpeIssueDocument(document.id, type, format); const link = window.document.createElement("a"); link.href = URL.createObjectURL(file.blob); link.download = file.downloadName; link.click(); URL.revokeObjectURL(link.href); } catch (reason) { setProblemMessages(problemMessagesOf(reason)); setError(messageOf(reason, `Не удалось сформировать ${format.toUpperCase()}`)); } }

  return <section className="ppe-document-screen">
    <header className="ppe-document-head"><div><h1>Документ выдачи СИЗ</h1></div><div className="ppe-document-head-actions">{canManage ? <><button className="button primary" disabled={saving} onClick={startNewIssue} type="button"><Plus size={16} /> Новая выдача</button>{document?.status.toLowerCase() === "draft" ? <button className="button ghost" disabled={saving} onClick={() => void cancelDraft()} type="button">Отменить черновик</button> : null}<details><summary>Мигрировать черновик карточки</summary><label>Идентификатор карточки<input value={legacyCardId} onChange={(event) => setLegacyCardId(event.target.value)} /></label><button className="button secondary" disabled={saving} onClick={() => void migrateLegacyDraft()} type="button">Мигрировать</button></details></> : null}<button className="button ghost" disabled={saving} onClick={() => onNavigate("inventory-ppe")} type="button"><ArrowLeft size={16} /> К карточкам</button></div></header>
    <ol className="ppe-document-steps">{["Сотрудник и норма", "Подбор", "Параметры строк", "Проверка и подтверждение"].map((label, index) => <li className={step === index + 1 ? "is-active" : step > index + 1 ? "is-done" : ""} key={label}><span>{index + 1}</span>{label}</li>)}</ol>
    {error ? <div className="ppe-document-alert is-error"><AlertTriangle size={17} /><div><div>{error}</div>{problemMessages.map((message) => <div key={message}>{message}</div>)}{normChangeRequired ? <button className="button secondary" disabled={saving} onClick={() => void acceptNormChangeAndSave()} type="button">Подтвердить смену нормы и сохранить</button> : null}</div></div> : null}
    {loading ? <div className="ppe-document-state">Загрузка конструктора…</div> : null}
    {!loading && step === 1 ? <StepEmployee employees={employees} employeeId={employeeId} norms={norms} normSetId={normSetId} date={documentDate} responsibleName={responsibleName} basis={basis} employeeDetails={employeeDetails} onEmployee={selectEmployee} onNorm={setNormSetId} onDate={setDocumentDate} onResponsibleName={setResponsibleName} onBasis={setBasis} onEmployeeDetails={setEmployeeDetails} /> : null}
    {!loading && step === 2 ? <StepSelection allRows={normDetail?.rows ?? []} lines={lines} entitlements={document?.validation.entitlements ?? []} rows={selectedNormRows} onAdd={addMapping} onAddFullKit={addFullKit} /> : null}
    {!loading && step === 3 ? <StepLines lines={lines} immutable={immutable} onChange={updateLine} onRemove={removeLine} onApplyDate={(date) => setLines((current) => current.map((line) => ({ ...line, issueDate: date })))} /> : null}
    {!loading && step === 4 ? <StepReview canExport={canExport} canManage={canManage} document={document} hasErrors={hasErrors} previewType={previewType} previewUrl={previewUrl} onPreview={(type) => void preview(type)} onConfirm={() => void confirm()} onDownload={(type, format) => void download(type, format)} /> : null}
    {!loading && canManage ? <footer className="ppe-document-footer">
      <button className="button ghost" disabled={step === 1 || saving || immutable} onClick={() => setStep((value) => (value - 1) as Step)} type="button"><ArrowLeft size={16} /> Назад</button>
      {document ? <span className="ppe-document-saved" data-status={document.status}>
        {document.status === "draft" ? "Черновик" : document.status === "confirmed" ? "Выдача подтверждена" : "Черновик отменён"} · версия {document.version}
      </span> : null}
      {step < 3 ? <button className="button primary" disabled={immutable} onClick={() => void next()} type="button">Далее <ArrowRight size={16} /></button>
        : step === 3 ? <button className="button primary" disabled={immutable || !lines.length} onClick={() => void validate()} type="button"><CheckCircle2 size={16} /> Проверить</button> : null}
    </footer> : null}
    {history.length ? <section className="ppe-document-history"><h2>Документы сотрудника</h2>{history.map((item) => <button key={item.id} onClick={() => void resume(item.id)} type="button"><span>{item.documentDate} · {item.employeeName}</span><small>{item.status} · {item.linesCount} строк</small></button>)}</section> : null}
    {document?.validation.warnings.length ? <div className="ppe-document-alert is-warning">{document.validation.warnings.map((problem) => <div key={`${problem.lineId}-${problem.code}`}>{problem.message}</div>)}</div> : null}
  </section>;
}

function StepEmployee({ employees, employeeId, norms, normSetId, date, responsibleName, basis, employeeDetails, onEmployee, onNorm, onDate, onResponsibleName, onBasis, onEmployeeDetails }: { employees: InventoryEmployeeDto[]; employeeId: string; norms: InventoryPpeNormSetDto[]; normSetId: string; date: string; responsibleName: string; basis: string; employeeDetails: InventoryPpeEmployeeDetailsDto; onEmployee: (value: string) => void; onNorm: (value: string) => void; onDate: (value: string) => void; onResponsibleName: (value: string) => void; onBasis: (value: string) => void; onEmployeeDetails: (value: InventoryPpeEmployeeDetailsDto) => void }) {
  const detailFields: Array<[keyof InventoryPpeEmployeeDetailsDto, string]> = [["clothingSize", "Размер одежды"], ["shoeSize", "Размер обуви"], ["headSize", "Размер головы"], ["handProtectionSize", "Размер перчаток"], ["respiratorSize", "Размер СИЗОД"], ["height", "Рост"]];
  return <div className="ppe-document-form"><label>Сотрудник<select value={employeeId} onChange={(event) => onEmployee(event.target.value)}><option value="">Выберите сотрудника</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.fullName} · {employee.position}</option>)}</select></label><label>Дата документа<input type="date" value={date} onChange={(event) => onDate(event.target.value)} /></label><label>Нормативный набор<select value={normSetId} onChange={(event) => onNorm(event.target.value)}><option value="">Выберите применимую норму</option>{norms.map((norm) => <option key={norm.id} value={norm.id}>{norm.positionName} · {norm.versionName}</option>)}</select></label><label>Ответственный<input value={responsibleName} onChange={(event) => onResponsibleName(event.target.value)} /></label><label>Основание<input value={basis} onChange={(event) => onBasis(event.target.value)} /></label>{detailFields.map(([field, label]) => <label key={field}>{label}<input value={employeeDetails[field]} onChange={(event) => onEmployeeDetails({ ...employeeDetails, [field]: event.target.value })} /></label>)}</div>;
}
function StepSelection({ allRows, rows, lines, entitlements, onAdd, onAddFullKit }: { allRows: InventoryPpeNormRowDto[]; rows: InventoryPpeNormRowDto[]; lines: DraftLine[]; entitlements: NonNullable<PpeIssueDocumentDto["validation"]>["entitlements"]; onAdd: (row: InventoryPpeNormRowDto, mapping: InventoryPpeNormRowDto["mappings"][number]) => void; onAddFullKit: () => void }) {
  const groupNameById = new Map(allRows.filter((row) => row.rowType === "group").map((row) => [row.id, row.normItemName]));
  let activeGroup = "";
  return <div className="ppe-document-selection"><button className="button secondary" onClick={onAddFullKit} type="button">Добавить полный комплект</button>{rows.map((row) => {
    const group = row.parentRowId ? groupNameById.get(row.parentRowId) ?? "Без категории" : "Без категории";
    const groupHeader = group !== activeGroup ? (activeGroup = group, <h2 className="ppe-document-category" key={`group-${group}`}>{group}</h2>) : null;
    const rowLines = lines.filter((line) => line.normRowId === row.id);
    const entitlement = rowLines.map((line) => entitlements.find((item) => item.lineId === line.id)).find(Boolean);
    return <section className="ppe-document-norm" key={row.id}>{groupHeader}<header><div><strong>{row.normItemName}</strong><small>{row.quantityText || row.quantity} {row.unitSymbol || "шт."} · {row.issuePeriodText || "Период не указан"}</small></div><span>Норма: {row.quantity}</span></header><div>{row.mappings.filter((mapping) => mapping.isApproved).map((mapping) => <button className="ppe-document-product" key={mapping.id} onClick={() => onAdd(row, mapping)} type="button"><span><strong>{mapping.itemName}</strong><small>{mapping.brandModelArticle || mapping.itemSku || "Артикул не указан"}</small></span><Plus size={17} /></button>)}{!row.mappings.some((mapping) => mapping.isApproved) ? <p>Нет утверждённых товаров для этой нормы.</p> : null}</div><small>Выбрано строк: {rowLines.length}{entitlement ? ` · доступно: ${entitlement.availableQuantity ?? "—"}` : ""}</small></section>;
  })}</div>;
}
function StepLines({ lines, immutable, onChange, onRemove, onApplyDate }: { lines: DraftLine[]; immutable: boolean; onChange: (id: string, patch: Partial<DraftLine>) => void; onRemove: (id: string) => void; onApplyDate: (date: string) => void }) { const [batchDate, setBatchDate] = useState(localToday); return <div><div className="ppe-document-batch"><label>Применить дату ко всем строкам<input type="date" value={batchDate} onChange={(event) => setBatchDate(event.target.value)} /></label><button className="button secondary" disabled={immutable || !lines.length} onClick={() => onApplyDate(batchDate)} type="button">Применить</button></div><div className="ppe-document-lines">{lines.map((line) => <article key={line.id}><div><strong>{line.itemName}</strong><small>{line.normName} · норматив: отдельно от выбранного количества</small></div><label>Дата<input disabled={immutable} type="date" value={line.issueDate} onChange={(event) => onChange(line.id, { issueDate: event.target.value })} /></label><label>Количество<input disabled={immutable} min="0.001" step="0.001" type="number" value={line.quantity} onChange={(event) => onChange(line.id, { quantity: Number(event.target.value) })} /></label><label>Размер<input disabled={immutable} value={line.sizeText || ""} onChange={(event) => onChange(line.id, { sizeText: event.target.value })} /></label><label>Цена, руб.<input disabled={immutable} min="0.01" step="0.01" type="number" value={line.unitPriceMinor ? (line.unitPriceMinor / 100).toFixed(2) : ""} onChange={(event) => onChange(line.id, { unitPriceMinor: event.target.value ? Math.round(Number(event.target.value) * 100) : null })} /></label><label className="ppe-document-exception">Причина исключения<input disabled={immutable} required={line.manualControlConfirmed} value={line.exceptionReason || ""} onChange={(event) => onChange(line.id, { exceptionReason: event.target.value })} /></label><label className="ppe-document-manual"><input checked={line.manualControlConfirmed} disabled={immutable} onChange={(event) => onChange(line.id, { manualControlConfirmed: event.target.checked })} type="checkbox" /> Ручной контроль</label><button aria-label={`Удалить ${line.itemName}`} className="ppe-document-icon" disabled={immutable} onClick={() => onRemove(line.id)} type="button"><Trash2 size={17} /></button></article>)}{!lines.length ? <div className="ppe-document-state">Добавьте хотя бы одну утверждённую позицию.</div> : null}</div></div>; }
function StepReview({ canManage, canExport, document, hasErrors, previewType, previewUrl, onPreview, onConfirm, onDownload }: { canManage: boolean; canExport: boolean; document: PpeIssueDocumentDto | null; hasErrors: boolean; previewType: "norms" | "signature"; previewUrl: string; onPreview: (type: "norms" | "signature") => void; onConfirm: () => void; onDownload: (type: "norms" | "signature", format: "docx" | "pdf") => void }) {
  if (!document) return <div className="ppe-document-state">Сначала сохраните состав документа.</div>;
  const total = document.validation.totalMinor;
  const money = (value: number | null) => value === null ? "не указана" : `${(value / 100).toFixed(2)} руб.`;
  return <div className="ppe-document-review">
    <div>
      <h2>Проверка документа</h2>
      <p>{document.content.employee.fullName} · {document.content.employee.department} · {document.content.employee.position}</p>
      <p>Итого: {total === null ? "не рассчитано" : money(total)}</p>
      {document.validation.errors.map((problem) => <p className="is-error" key={`${problem.lineId}-${problem.code}`}>{problem.message}</p>)}
      {!hasErrors ? <p className="is-ready"><CheckCircle2 size={17} /> Ошибок проверки нет.</p> : null}
    </div>
    <div className="ppe-document-table-scroll">
      <table className="ppe-document-review-table">
        <thead><tr><th>Выбранный товар</th><th>Дата выдачи</th><th>Количество</th><th>Цена</th><th>Сумма</th></tr></thead>
        <tbody>{document.content.lines.map((line) => <tr key={line.id}>
          <td>{line.itemName}<small>{line.brandModelArticle}{line.sizeText ? ` · размер ${line.sizeText}` : ""}</small></td>
          <td>{line.issueDate.split("-").reverse().join(".")}</td>
          <td>{line.quantity} {line.unitSymbol}</td>
          <td>{money(line.unitPriceMinor)}</td><td>{money(line.totalMinor)}</td>
        </tr>)}</tbody>
      </table>
    </div>
    {canManage || canExport ? <div className="ppe-document-actions">
      {canExport ? <>
      <button className="button secondary" onClick={() => onPreview("norms")} type="button"><Eye size={16} /> PDF нормы</button>
      <button className="button secondary" onClick={() => onPreview("signature")} type="button"><Eye size={16} /> PDF подписи</button>
      {(["norms", "signature"] as const).flatMap((type) => (["pdf", "docx"] as const).map((format) =>
        <button className="button ghost" key={`${type}-${format}`} onClick={() => onDownload(type, format)} type="button">
          <Download size={16} /> {type === "norms" ? "Нормы" : "Подписи"} {format.toUpperCase()}
        </button>))}</> : null}
      {canManage ? <button className="button primary" disabled={hasErrors || !isPpeIssueDocumentConfirmable(document)} onClick={onConfirm} type="button"><CheckCircle2 size={16} /> Подтвердить</button> : null}
    </div> : null}
    {previewUrl ? <iframe className="ppe-document-preview" src={previewUrl} title={`Предпросмотр: ${previewType === "norms" ? "нормы" : "подписи"}`} /> : null}
  </div>;
}
function messageOf(reason: unknown, fallback: string) { return reason instanceof Error ? reason.message : fallback; }
export function problemMessagesOf(reason: unknown) { return reason instanceof ApiError ? Object.entries(reason.errors ?? {}).flatMap(([key, messages]) => messages.map((message) => key === "normChanged" ? message : `${key}: ${message}`)) : []; }
export function validateDraftLines(lines: DraftLine[]) { const invalidManual = lines.find((line) => line.manualControlConfirmed && !line.exceptionReason?.trim()); if (invalidManual) return `Укажите причину исключения для позиции «${invalidManual.itemName}».`; return ""; }
export function toLineInput({ id, normRowId, itemId, issueDate, quantity, unitPriceMinor, sizeText = "", exceptionReason = "", manualControlConfirmed = false }: DraftLine): PpeIssueDocumentLineInputDto {
  return { id, normRowId, itemId, issueDate, quantity, unitPriceMinor, sizeText, exceptionReason, manualControlConfirmed };
}
function fingerprintOf(employeeId: string, normSetId: string, documentDate: string, responsibleName: string, basis: string, employeeDetails: InventoryPpeEmployeeDetailsDto, lines: DraftLine[], acceptNormChange: boolean) {
  return JSON.stringify({ employeeId, normSetId, documentDate, responsibleName, basis, employeeDetails, lines: lines.map(toLineInput), acceptNormChange });
}
function confirmKeyStorageKey(documentId: string) { return `patrol360.inventory.ppe.issue-document.confirm:${documentId}`; }
function alternativeKey(row: InventoryPpeNormRowDto | undefined) { return row?.alternativeGroup?.trim() || row?.id || ""; }
function createDraftLine(row: InventoryPpeNormRowDto, mapping: InventoryPpeNormRowDto["mappings"][number], issueDate: string, useNormQuantity: boolean): DraftLine {
  const factor = mapping.normUnitsPerItem ?? 0;
  const requiresManualControl = useNormQuantity && factor <= 0;
  return {
    id: createClientUuid(),
    normRowId: row.id,
    itemId: mapping.itemId,
    issueDate,
    quantity: useNormQuantity && factor > 0 ? row.quantity / factor : 1,
    unitPriceMinor: mapping.defaultUnitPriceMinor && mapping.defaultUnitPriceMinor > 0 ? mapping.defaultUnitPriceMinor : null,
    sizeText: "",
    exceptionReason: requiresManualControl ? "Не указан коэффициент пересчета нормы." : "",
    manualControlConfirmed: requiresManualControl,
    itemName: mapping.itemName,
    unitSymbol: row.unitSymbol || "ед. не подтверждена",
    normName: row.normItemName,
    approved: true,
  };
}
export function mergeServerLines(document: PpeIssueDocumentDto, current: DraftLine[], submitted: PpeIssueDocumentLineInputDto[]) {
  const savedById = new Map(document.content.lines.map((line) => [line.id, line]));
  const submittedById = new Map(submitted.map((line) => [line.id, line]));
  // A slow save must not undo edits, additions or removals made while it was in flight.
  return current.map((line) => {
    const saved = savedById.get(line.id);
    const sent = submittedById.get(line.id);
    if (!saved || !sent || saved.itemId !== line.itemId || saved.normRowId !== line.normRowId) return line;
    const changed = JSON.stringify(toLineInput(line)) !== JSON.stringify(toLineInput(sent as DraftLine));
    return {
      ...saved,
      ...(changed ? toLineInput(line) : {}),
      normName: document.content.normRows.find((row) => row.id === line.normRowId)?.normItemName ?? line.normName,
      approved: true,
      unitSymbol: saved.unitSymbol || line.unitSymbol || "ед. не подтверждена",
    };
  });
}
