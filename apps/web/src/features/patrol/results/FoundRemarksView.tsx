import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, RefreshCw, Search } from "lucide-react";
import type { EmuShiftRemarkDto } from "../../../api/contracts";
import { createEmuRepository } from "../../../repositories/emuRepository";
import type { DataSourceMode } from "../../../types";

interface Props { dataSourceMode: DataSourceMode; onNotify?: (message: string) => void; }
type LoadState = "idle" | "loading" | "ready" | "error";

export function FoundRemarksView({ dataSourceMode, onNotify }: Props) {
  const repository = useMemo(() => createEmuRepository(), []);
  const [remarks, setRemarks] = useState<EmuShiftRemarkDto[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState("");
  const [state, setState] = useState<LoadState>("idle");
  const [error, setError] = useState("");
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (dataSourceMode !== "api") { setState("ready"); return; }
    let active = true;
    setState("loading");
    setError("");
    void repository.getShiftRemarks({ page: 1, pageSize: 100 }).then((result) => {
      if (!active) return;
      setRemarks(result.rows);
      setTotal(result.total);
      setState("ready");
    }).catch((cause: unknown) => {
      if (!active) return;
      const message = cause instanceof Error ? cause.message : "\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044c \u0437\u0430\u043c\u0435\u0447\u0430\u043d\u0438\u044f.";
      setError(message);
      setState("error");
      onNotify?.(message);
    });
    return () => { active = false; };
  }, [dataSourceMode, onNotify, reloadToken, repository]);

  const visible = useMemo(() => {
    const value = query.trim().toLowerCase();
    return value ? remarks.filter((item) => [item.title, item.comment, item.employeeName, item.sectionName].join(" ").toLowerCase().includes(value)) : remarks;
  }, [query, remarks]);

  return <section className="results-found-remarks">
    <header className="results-found-remarks-head">
      <div><span>{"\u041e\u0431\u0445\u043e\u0434\u044b \u0442\u0435\u0440\u0440\u0438\u0442\u043e\u0440\u0438\u0438"}</span><h2>{"\u041d\u0430\u0439\u0434\u0435\u043d\u043d\u044b\u0435 \u0437\u0430\u043c\u0435\u0447\u0430\u043d\u0438\u044f"}</h2><p>{"\u0421\u043f\u0438\u0441\u043e\u043a \u0437\u0430\u043c\u0435\u0447\u0430\u043d\u0438\u0439, \u043e\u0444\u043e\u0440\u043c\u043b\u0435\u043d\u043d\u044b\u0445 \u0441\u043e\u0442\u0440\u0443\u0434\u043d\u0438\u043a\u0430\u043c\u0438 \u0432\u043e \u0432\u0440\u0435\u043c\u044f \u043e\u0431\u0445\u043e\u0434\u043e\u0432."}</p></div>
      <div className="results-found-remarks-actions"><strong>{total}</strong><button className="secondary-action" disabled={state === "loading"} onClick={() => setReloadToken((value) => value + 1)} type="button"><RefreshCw size={16} />{state === "loading" ? "\u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430..." : "\u041e\u0431\u043d\u043e\u0432\u0438\u0442\u044c"}</button></div>
    </header>
    <label className="results-found-remarks-search"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={"\u041f\u043e\u0438\u0441\u043a \u043f\u043e \u0441\u043e\u0442\u0440\u0443\u0434\u043d\u0438\u043a\u0443, \u0443\u0447\u0430\u0441\u0442\u043a\u0443 \u0438\u043b\u0438 \u0442\u0435\u043a\u0441\u0442\u0443..."} /></label>
    {state === "error" ? <div className="results-found-remarks-state is-error"><AlertTriangle size={24} /><strong>{error}</strong></div> : state === "loading" && remarks.length === 0 ? <div className="results-found-remarks-state">{"\u0417\u0430\u0433\u0440\u0443\u0436\u0430\u0435\u043c \u0437\u0430\u043c\u0435\u0447\u0430\u043d\u0438\u044f..."}</div> : visible.length === 0 ? <div className="results-found-remarks-state">{"\u041d\u0430\u0439\u0434\u0435\u043d\u043d\u044b\u0445 \u0437\u0430\u043c\u0435\u0447\u0430\u043d\u0438\u0439 \u043f\u043e\u043a\u0430 \u043d\u0435\u0442."}</div> : <div className="results-found-remarks-grid">{visible.map((remark) => <article className="results-found-remark-card" key={remark.id}>
      <header><div><strong>{remark.title || remark.sectionName}</strong><span>{remark.sectionName}</span></div><em data-status={remark.status}>{statusText(remark.status)}</em></header>
      <p>{remark.comment || "\u041a\u043e\u043c\u043c\u0435\u043d\u0442\u0430\u0440\u0438\u0439 \u043d\u0435 \u0443\u043a\u0430\u0437\u0430\u043d"}</p>
      <dl><div><dt>{"\u0421\u043e\u0442\u0440\u0443\u0434\u043d\u0438\u043a"}</dt><dd>{remark.employeeName}</dd></div><div><dt>{"\u0421\u043e\u0437\u0434\u0430\u043d\u043e"}</dt><dd>{formatDate(remark.createdAtLocal)}</dd></div><div><dt>{"\u0414\u043e\u0441\u0442\u0430\u0432\u043b\u0435\u043d\u043e"}</dt><dd>{formatDate(remark.createdAtServer)}</dd></div></dl>
      <div className="results-found-remark-files">{remark.attachments.length === 0 ? <span>{"\u0412\u043b\u043e\u0436\u0435\u043d\u0438\u0439 \u043d\u0435\u0442"}</span> : remark.attachments.map((file) => <a href={file.downloadUrl} key={file.fileId} rel="noreferrer" target="_blank">{file.contentType.toLowerCase().startsWith("video/") ? "\u0412\u0438\u0434\u0435\u043e" : "\u0424\u043e\u0442\u043e"} {"\u00b7"} {formatSize(file.sizeBytes)}</a>)}</div>
    </article>)}</div>}
  </section>;
}

function statusText(status: string) { return status === "accepted" ? "\u041f\u0440\u0438\u043d\u044f\u0442\u043e" : status === "pending" ? "\u041e\u0436\u0438\u0434\u0430\u0435\u0442 \u043e\u0442\u043f\u0440\u0430\u0432\u043a\u0438" : status === "rejected" ? "\u041e\u0442\u043a\u043b\u043e\u043d\u0435\u043d\u043e" : status === "conflict" ? "\u041a\u043e\u043d\u0444\u043b\u0438\u043a\u0442" : status || "-"; }
function formatDate(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("ru-RU", { day: "2-digit", hour: "2-digit", minute: "2-digit", month: "2-digit", year: "numeric" }); }
function formatSize(value: number) { return !Number.isFinite(value) || value <= 0 ? "0 \u041c\u0411" : value < 1048576 ? `${Math.max(1, Math.round(value / 1024))} \u041a\u0411` : `${(value / 1048576).toFixed(1)} \u041c\u0411`; }
