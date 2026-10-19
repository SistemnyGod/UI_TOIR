import { useEffect, useRef, useState } from "react";
import { Download, Printer } from "lucide-react";
import { Button } from "../../../shared/ui";

type Props = { url: string; downloadName: string; label: string };
export function PreparedPdf(props: Props) { return <PdfViewer key={props.url} {...props} />; }
function PdfViewer({ url, downloadName, label }: Props) {
  const frame = useRef<HTMLIFrameElement>(null), loaded = useRef(false);
  const [ready, setReady] = useState(false), [error, setError] = useState("");
  useEffect(() => {
    const node = frame.current;
    const failed = () => { loaded.current = false; setReady(false); setError("Не удалось открыть PDF в браузере. Подготовленный файл можно скачать."); };
    node?.addEventListener("error", failed);
    const timer = window.setTimeout(() => { if (!loaded.current) setError("Просмотрщик PDF не ответил. Скачайте подготовленный файл и откройте его на устройстве."); }, 20000);
    return () => { window.clearTimeout(timer); node?.removeEventListener("error", failed); };
  }, []);
  function print() {
    try {
      if (!ready || !frame.current?.contentWindow) throw new Error();
      frame.current.contentWindow.focus(); frame.current.contentWindow.print(); setError("");
    } catch { setError("Браузер не открыл печать PDF. Скачайте подготовленный файл и распечатайте его на устройстве."); }
  }
  return <section className="ppe-prepared-pdf" aria-label="Подготовленный PDF">
    <div className="ppe-prepared-pdf-head"><div><strong>{label}</strong><p>{ready ? "PDF подготовлен. Печать не меняет статус выдачи." : "Файл готов. Открываем PDF в браузере…"}</p></div><div className="ppe-prepared-pdf-actions"><Button disabled={!ready} onClick={print}><Printer size={16} aria-hidden="true" />Печать подготовленного PDF</Button><a className="ui-button is-secondary is-md" href={url} download={downloadName || "ppe.pdf"}><Download size={16} aria-hidden="true" />Скачать подготовленный PDF</a></div></div>
    {error ? <p className="field-error" role="alert">{error}</p> : null}
    {!ready && !error ? <p className="ppe-document-file-state" role="status">Загружаем просмотр PDF… Если браузер не поддерживает просмотр, скачайте файл.</p> : null}
    <iframe ref={frame} title="Печатный PDF" className="ppe-document-preview" src={url} onLoad={() => { loaded.current = true; setReady(true); setError(""); }} />
  </section>;
}
