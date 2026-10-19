export interface LocalDraft {
  id: string;
  title: string;
  employeeId: string;
  employeeName: string;
  routeId: string;
  routeName: string;
  plannedDate: string;
  plannedStart: string;
  priority: 'high' | 'medium' | 'low';
  comment: string;
  requestId?: string;
  changedAt: string;
}
export const ASSIGNMENT_DRAFTS_STORAGE_KEY = 'patrol360.assignment-drafts.v1';
export interface DraftReadResult { drafts: LocalDraft[]; raw: string | null; rejected: number; error?: string }
export class AssignmentDraftConflictError extends Error {}
const text = (value: unknown) => typeof value === 'string' ? value : '';

export function readAssignmentDrafts(key: string): DraftReadResult {
  let raw: string | null;
  try { raw = localStorage.getItem(key); }
  catch { return { drafts: [], raw: null, rejected: 0, error: 'Браузер не разрешил прочитать черновики. Разрешите локальное хранение и повторите.' }; }
  if (raw === null) return { drafts: [], raw, rejected: 0 };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('format');
    const drafts: LocalDraft[] = [], ids = new Set<string>();
    for (const value of parsed) {
      if (!value || typeof value !== 'object') continue;
      const row = value as Record<string, unknown>;
      if (!text(row.id) || ids.has(text(row.id)) || !text(row.employeeId) || !text(row.routeId) || !['high', 'medium', 'low'].includes(text(row.priority))) continue;
      if (['title', 'employeeName', 'routeName', 'plannedDate', 'plannedStart', 'comment', 'changedAt'].some(field => row[field] !== undefined && typeof row[field] !== 'string')) continue;
      ids.add(text(row.id));
      drafts.push({ ...row, id: text(row.id), title: text(row.title), employeeId: text(row.employeeId), employeeName: text(row.employeeName), routeId: text(row.routeId), routeName: text(row.routeName), plannedDate: text(row.plannedDate), plannedStart: text(row.plannedStart), priority: row.priority as LocalDraft['priority'], comment: text(row.comment), changedAt: text(row.changedAt), requestId: text(row.requestId) || undefined });
    }
    return { drafts, raw, rejected: parsed.length - drafts.length };
  } catch { return { drafts: [], raw, rejected: 0, error: 'Формат черновиков не распознан. Скачайте исходный файл для восстановления; исходные данные сохранены.' }; }
}

export function loadAssignmentDrafts(key = ASSIGNMENT_DRAFTS_STORAGE_KEY) { return readAssignmentDrafts(key).drafts; }

export function writeAssignmentDrafts(key: string, expectedRaw: string | null, drafts: LocalDraft[]): DraftReadResult {
  const current = readAssignmentDrafts(key);
  if (current.error || current.rejected) throw new Error(current.error || 'В сохранённых данных есть повреждённые строки. Скачайте исходный файл перед восстановлением.');
  if (current.raw !== expectedRaw) throw new AssignmentDraftConflictError('Черновики изменились в другой вкладке. Список перечитан; проверьте данные и повторите сохранение. Ввод в форме сохранён.');
  const raw = JSON.stringify(drafts);
  try { localStorage.setItem(key, raw); }
  catch { throw new Error('Браузер не разрешил сохранить черновик. Введённые данные остаются в форме.'); }
  return { drafts, raw, rejected: 0 };
}

export function createLocalDraftId() {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID() : `draft-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
