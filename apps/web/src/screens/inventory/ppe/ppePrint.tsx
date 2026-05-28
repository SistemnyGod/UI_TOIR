import { createPortal } from "react-dom";
import { Printer, X } from "lucide-react";
import { INVENTORY_PPE_DEFAULT_NORM_TEXT } from "./inventoryPpeConfig";
import { escapeHtml, formatDate, formatMoney, formatQuantity, isConsumableLine } from "./ppeCommon";
import type { PrintData, PrintLine, PrintMode } from "./ppeTypes";

export function PrintPreviewModal({
  data,
  mode,
  onClose,
  onModeChange,
  onPrint,
}: {
  data: PrintData;
  mode: PrintMode;
  onClose: () => void;
  onModeChange: (mode: PrintMode) => void;
  onPrint: () => void;
}) {
  return createPortal(
    <div className="inventory-ppe-picker-backdrop" role="presentation">
      <section className="inventory-ppe-picker inventory-ppe-print-modal" aria-label="Предпросмотр печати">
        <header className="inventory-ppe-picker-head">
          <div>
            <h2>Предпросмотр печати</h2>
            <p>Карточка и роспись формируются из выбранных СИЗ.</p>
          </div>
          <button className="inventory-ppe-icon-button" onClick={onClose} type="button" aria-label="Закрыть">
            <X size={20} />
          </button>
        </header>
        <div className="inventory-ppe-preview-tabs">
          <button className={mode === "card" ? "is-active" : ""} onClick={() => onModeChange("card")} type="button">
            Личная карточка
          </button>
          <button className={mode === "sheet" ? "is-active" : ""} onClick={() => onModeChange("sheet")} type="button">
            Роспись получения
          </button>
          <button className="button primary" onClick={onPrint} type="button">
            <Printer size={16} /> Печатать
          </button>
        </div>
        <div className="inventory-ppe-print-scroll">
          <PrintPaper data={data} mode={mode} />
        </div>
      </section>
    </div>,
    document.body,
  );
}

export function PrintPaper({ data, mode }: { data: PrintData; mode: PrintMode }) {
  return (
    <div className={`inventory-ppe-print-paper ppe-print-${mode}`}>
      {mode === "card" ? <PersonalCardPaper data={data} /> : <SignatureSheetPaper data={data} />}
    </div>
  );
}

export function printDocument(data: PrintData, mode: PrintMode) {
  const popup = window.open("", "_blank", "noopener,noreferrer,width=1200,height=900");
  if (!popup) return;

  popup.document.write(buildPrintHtml(data, mode));
  popup.document.close();
  popup.focus();
  popup.print();
}

export function buildPrintHtml(data: PrintData, mode: PrintMode) {
  const body = mode === "card" ? buildCardHtml(data) : buildSheetHtml(data);
  const title = mode === "card" ? "Личная карточка учета выдачи СИЗ" : "Роспись получения СИЗ";
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: A4 ${mode === "sheet" ? "landscape" : "portrait"}; margin: 11mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #111; background: #fff; font-family: "Times New Roman", Times, serif; }
    .inventory-ppe-print-paper { display: grid; gap: 10px; width: 100%; }
    h3, h4, p { margin: 0; }
    h3 { font-size: 15px; font-weight: 700; text-align: center; text-transform: uppercase; }
    h4 { font-size: 13px; font-weight: 700; text-align: center; text-transform: uppercase; }
    .ppe-print-subtitle { margin-top: 3px; font-size: 11px; text-align: center; }
    .norm-text { margin-top: 6px; text-align: left; font-size: 10.5px; line-height: 1.3; }
    .note { color: #333; font-size: 10px; text-align: center; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    td, th { border: 1px solid #111; padding: 4px 5px; vertical-align: top; font-size: 10.5px; line-height: 1.22; }
    th { font-weight: 700; text-align: center; }
    td { text-align: left; }
    .ppe-personal-info td:nth-child(odd) { width: 24%; font-weight: 700; }
    .ppe-personal-info td:nth-child(even) { width: 26%; }
    .ppe-print-lines th, .ppe-print-lines td { overflow-wrap: anywhere; }
    .ppe-print-total { margin-top: 2px; padding: 7px 9px; border: 1px solid #111; font-size: 11px; font-weight: 700; text-align: right; }
    .ppe-print-signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-top: 12px; font-size: 10.5px; }
    .ppe-print-signatures p { text-align: left; }
    .ppe-sheet-meta { margin: 4px 0 7px; font-size: 11px; text-align: center; }
    .ppe-signature-lines td, .ppe-signature-lines th { font-size: 9.2px; padding: 3px 4px; }
  </style>
</head>
<body><div class="inventory-ppe-print-paper ppe-print-${mode}">${body}</div></body>
</html>`;
}

function PersonalCardPaper({ data }: { data: PrintData }) {
  return (
    <>
      <h3>Личная карточка № {cardNumber(data)}</h3>
      <h4>учета выдачи СИЗ</h4>
      <p className="ppe-print-subtitle">Дата оформления: {formatDate(data.createdAt ?? new Date().toISOString(), "date")}</p>
      <EmployeeInfoTable data={data} />
      <p className="norm-text">{INVENTORY_PPE_DEFAULT_NORM_TEXT}</p>
      <p className="note">(наименование типовых (типовых отраслевых) норм)</p>
      <PersonalCardLinesTable lines={data.lines} />
      <PrintTotal data={data} />
      <div className="ppe-print-signatures">
        <p>Ответственное лицо за ведение карточек учета СИЗ ____________________</p>
        <p>Ф.И.О. ____________________</p>
      </div>
    </>
  );
}

function EmployeeInfoTable({ data }: { data: PrintData }) {
  return (
    <table className="ppe-personal-info">
      <tbody>
        <tr>
          <td>Фамилия</td>
          <td>{employeeLastName(data.employeeName)}</td>
          <td>Пол</td>
          <td>____</td>
        </tr>
        <tr>
          <td>Имя, отчество</td>
          <td>{employeeRestName(data.employeeName)}</td>
          <td>Рост</td>
          <td>____</td>
        </tr>
        <tr>
          <td>Табельный номер</td>
          <td>{data.employee?.personnelNo || "____"}</td>
          <td>Размер одежды</td>
          <td>____</td>
        </tr>
        <tr>
          <td>Структурное подразделение</td>
          <td>{data.employee?.department || "____"}</td>
          <td>Размер обуви</td>
          <td>____</td>
        </tr>
        <tr>
          <td>Профессия (должность)</td>
          <td>{data.position || "____"}</td>
          <td>Размер головного убора</td>
          <td>____</td>
        </tr>
        <tr>
          <td>Дата поступления на работу</td>
          <td>____</td>
          <td>СИЗОД</td>
          <td>____</td>
        </tr>
        <tr>
          <td>Дата изменения профессии (должности) или перевода в другое структурное подразделение</td>
          <td>____</td>
          <td>СИЗ рук</td>
          <td>____</td>
        </tr>
      </tbody>
    </table>
  );
}

function PersonalCardLinesTable({ lines }: { lines: PrintLine[] }) {
  return (
    <table className="ppe-print-lines ppe-personal-lines">
      <colgroup>
        <col style={{ width: "44%" }} />
        <col style={{ width: "20%" }} />
        <col style={{ width: "22%" }} />
        <col style={{ width: "14%" }} />
      </colgroup>
      <thead>
        <tr>
          <th>Наименование СИЗ</th>
          <th>Пункт норм</th>
          <th>Единица измерения, периодичность выдачи</th>
          <th>Количество на период</th>
        </tr>
      </thead>
      <tbody>
        {lines.length ? (
          lines.map((line, index) => (
            <tr key={`${line.itemName}-${index}`}>
              <td>{line.itemName}</td>
              <td>{line.normPoint || "по нормам должности"}</td>
              <td>{periodText(line)}</td>
              <td>
                {formatQuantity(line.quantity)} {line.unit || "шт."}
              </td>
            </tr>
          ))
        ) : (
          <tr>
            <td colSpan={4}>Позиции СИЗ не добавлены</td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

function SignatureSheetPaper({ data }: { data: PrintData }) {
  return (
    <>
      <h3>Лист росписи по получению СИЗ</h3>
      <p className="ppe-sheet-meta">
        Сотрудник: {data.employeeName}. Табельный номер: {data.employee?.personnelNo || "____"}. Должность:{" "}
        {data.position || "не указана"}.
      </p>
      <SignatureLinesTable lines={data.lines} />
      <PrintTotal data={data} />
      <div className="ppe-print-signatures">
        <p>СИЗ выдал ____________________ / ____________________</p>
        <p>СИЗ получил ____________________ / ____________________</p>
      </div>
    </>
  );
}

function SignatureLinesTable({ lines }: { lines: PrintLine[] }) {
  return (
    <table className="ppe-print-lines ppe-signature-lines">
      <colgroup>
        <col style={{ width: "20%" }} />
        <col style={{ width: "18%" }} />
        <col style={{ width: "7%" }} />
        <col style={{ width: "7%" }} />
        <col style={{ width: "8%" }} />
        <col style={{ width: "12%" }} />
        <col style={{ width: "7%" }} />
        <col style={{ width: "7%" }} />
        <col style={{ width: "7%" }} />
        <col style={{ width: "7%" }} />
      </colgroup>
      <thead>
        <tr>
          <th rowSpan={2}>Наименование СИЗ</th>
          <th rowSpan={2}>Модель, марка, артикул, класс защиты СИЗ, дерматологических СИЗ</th>
          <th colSpan={4}>Выдано</th>
          <th colSpan={4}>Возвращено</th>
        </tr>
        <tr>
          <th>дата</th>
          <th>количество</th>
          <th>Лично/дозатор</th>
          <th>Подпись получившего СИЗ</th>
          <th>дата</th>
          <th>Количество</th>
          <th>Подпись сдавшего СИЗ</th>
          <th>Акт списания (дата, номер)</th>
        </tr>
        <tr>
          {Array.from({ length: 10 }, (_, index) => (
            <th key={index}>{index + 1}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {lines.length ? (
          lines.map((line, index) => (
            <tr key={`${line.itemName}-${index}`}>
              <td>{line.itemName}</td>
              <td>{line.model || "-"}</td>
              <td>{formatDate(line.issuedAt ?? new Date().toISOString(), "date")}</td>
              <td>{formatQuantity(line.quantity)}</td>
              <td>{isConsumableLine(line) ? "Дозатор" : "-"}</td>
              <td />
              <td />
              <td />
              <td />
              <td />
            </tr>
          ))
        ) : (
          <tr>
            <td colSpan={10}>Позиции СИЗ не добавлены</td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

function PrintTotal({ data }: { data: PrintData }) {
  return (
    <p className="ppe-print-total">
      Итого к выдаче: {data.lines.length} поз.; количество {formatQuantity(totalQuantity(data.lines))}; сумма{" "}
      {formatMoney(documentTotal(data))}
    </p>
  );
}

function buildCardHtml(data: PrintData) {
  const rows = data.lines.length
    ? data.lines
        .map(
          (line) =>
            `<tr><td>${escapeHtml(line.itemName)}</td><td>${escapeHtml(line.normPoint || "по нормам должности")}</td><td>${escapeHtml(periodText(line))}</td><td>${escapeHtml(`${formatQuantity(line.quantity)} ${line.unit || "шт."}`)}</td></tr>`,
        )
        .join("")
    : `<tr><td colspan="4">Позиции СИЗ не добавлены</td></tr>`;

  return `
    <h3>Личная карточка № ${escapeHtml(cardNumber(data))}</h3>
    <h4>учета выдачи СИЗ</h4>
    <p class="ppe-print-subtitle">Дата оформления: ${escapeHtml(formatDate(data.createdAt ?? new Date().toISOString(), "date"))}</p>
    ${buildEmployeeInfoHtml(data)}
    <p class="norm-text">${escapeHtml(INVENTORY_PPE_DEFAULT_NORM_TEXT)}</p>
    <p class="note">(наименование типовых (типовых отраслевых) норм)</p>
    <table class="ppe-print-lines ppe-personal-lines">
      <colgroup><col style="width:44%"><col style="width:20%"><col style="width:22%"><col style="width:14%"></colgroup>
      <thead><tr><th>Наименование СИЗ</th><th>Пункт норм</th><th>Единица измерения, периодичность выдачи</th><th>Количество на период</th></tr></thead><tbody>${rows}</tbody>
    </table>
    ${buildTotalHtml(data)}
    <div class="ppe-print-signatures"><p>Ответственное лицо за ведение карточек учета СИЗ ____________________</p><p>Ф.И.О. ____________________</p></div>`;
}

function buildEmployeeInfoHtml(data: PrintData) {
  return `<table class="ppe-personal-info"><tbody>
    <tr><td>Фамилия</td><td>${escapeHtml(employeeLastName(data.employeeName))}</td><td>Пол</td><td>____</td></tr>
    <tr><td>Имя, отчество</td><td>${escapeHtml(employeeRestName(data.employeeName))}</td><td>Рост</td><td>____</td></tr>
    <tr><td>Табельный номер</td><td>${escapeHtml(data.employee?.personnelNo || "____")}</td><td>Размер одежды</td><td>____</td></tr>
    <tr><td>Структурное подразделение</td><td>${escapeHtml(data.employee?.department || "____")}</td><td>Размер обуви</td><td>____</td></tr>
    <tr><td>Профессия (должность)</td><td>${escapeHtml(data.position || "____")}</td><td>Размер головного убора</td><td>____</td></tr>
    <tr><td>Дата поступления на работу</td><td>____</td><td>СИЗОД</td><td>____</td></tr>
    <tr><td>Дата изменения профессии (должности) или перевода в другое структурное подразделение</td><td>____</td><td>СИЗ рук</td><td>____</td></tr>
  </tbody></table>`;
}

function buildSheetHtml(data: PrintData) {
  const rows = data.lines.length
    ? data.lines
        .map(
          (line) =>
            `<tr><td>${escapeHtml(line.itemName)}</td><td>${escapeHtml(line.model || "-")}</td><td>${escapeHtml(
              formatDate(line.issuedAt ?? new Date().toISOString(), "date"),
            )}</td><td>${escapeHtml(formatQuantity(line.quantity))}</td><td>${escapeHtml(
              isConsumableLine(line) ? "Дозатор" : "-",
            )}</td><td></td><td></td><td></td><td></td><td></td></tr>`,
        )
        .join("")
    : `<tr><td colspan="10">Позиции СИЗ не добавлены</td></tr>`;

  return `
    <h3>Лист росписи по получению СИЗ</h3>
    <p class="ppe-sheet-meta">Сотрудник: ${escapeHtml(data.employeeName)}. Табельный номер: ${escapeHtml(data.employee?.personnelNo || "____")}. Должность: ${escapeHtml(data.position || "не указана")}.</p>
    <table class="ppe-print-lines ppe-signature-lines">
      <colgroup><col style="width:20%"><col style="width:18%"><col style="width:7%"><col style="width:7%"><col style="width:8%"><col style="width:12%"><col style="width:7%"><col style="width:7%"><col style="width:7%"><col style="width:7%"></colgroup>
      <thead>
        <tr><th rowspan="2">Наименование СИЗ</th><th rowspan="2">Модель, марка, артикул, класс защиты СИЗ, дерматологических СИЗ</th><th colspan="4">Выдано</th><th colspan="4">Возвращено</th></tr>
        <tr><th>дата</th><th>количество</th><th>Лично/дозатор</th><th>Подпись получившего СИЗ</th><th>дата</th><th>Количество</th><th>Подпись сдавшего СИЗ</th><th>Акт списания (дата, номер)</th></tr>
        <tr>${Array.from({ length: 10 }, (_, index) => `<th>${index + 1}</th>`).join("")}</tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    ${buildTotalHtml(data)}
    <div class="ppe-print-signatures"><p>СИЗ выдал ____________________ / ____________________</p><p>СИЗ получил ____________________ / ____________________</p></div>`;
}

function buildTotalHtml(data: PrintData) {
  return `<p class="ppe-print-total">Итого к выдаче: ${data.lines.length} поз.; количество ${escapeHtml(formatQuantity(totalQuantity(data.lines)))}; сумма ${escapeHtml(formatMoney(documentTotal(data)))}</p>`;
}

function cardNumber(data: PrintData) {
  return data.cardId ? `СИЗ-${data.cardId.slice(0, 8)}` : "___";
}

function documentTotal(data: PrintData) {
  return data.lines.reduce((sum, line) => sum + (line.amount || line.unitPrice * line.quantity || 0), 0);
}

function totalQuantity(lines: PrintLine[]) {
  return lines.reduce((sum, line) => sum + line.quantity, 0);
}

function employeeLastName(value: string) {
  return value.trim().split(/\s+/)[0] || "____";
}

function employeeRestName(value: string) {
  const parts = value.trim().split(/\s+/).slice(1);
  return parts.length ? parts.join(" ") : "____";
}

function periodText(line: PrintLine) {
  const unit = line.unit || "шт.";
  return line.dueAt ? `${unit}, до ${formatDate(line.dueAt, "date")}` : `${unit}, по сроку носки`;
}
