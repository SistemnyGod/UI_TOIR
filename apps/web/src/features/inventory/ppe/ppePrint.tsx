import { useEffect, useState } from "react";
import { Printer } from "lucide-react";
import { escapeHtml, formatDate, formatQuantity, isConsumableLine, isPpeSignatureLineStatus, sortPpeSignatureLines } from "./ppeCommon";
import { PPE_STATUS } from "./ppeStatusCatalog";
import type { PrintData, PrintLine, PrintMode } from "./ppeTypes";
import { PpeButton, PpeModalShell } from "./PpeUi";

export const PPE_NORM_TEXT =
  "Выдача предусмотрена Приказом Минтруда России от 27.12.2017 N 882н \"Об утверждении Типовых норм бесплатной выдачи специальной одежды, специальной обуви и других средств индивидуальной защиты работникам промышленности строительных материалов, стекольной и фарфоро-фаянсовой промышленности, занятым на работах с вредными и (или) опасными условиями труда, а также на работах, выполняемых в особых температурных условиях или связанных с загрязнением\" (Зарегистрировано в Минюсте России 01.03.2018 N 50193); Межотраслевыми правилами обеспечения работников специальной одеждой, специальной обувью и другими средствами индивидуальной защиты (утв. Приказом Минздравсоцразвития России от 01.06.2009 N 290н).";

export function PrintPreviewModal({
  data,
  mode,
  onClose,
  onModeChange,
  onPrint,
  printing = false,
}: {
  data: PrintData;
  mode: PrintMode;
  onClose: () => void;
  onModeChange: (mode: PrintMode) => void;
  onPrint: (data: PrintData, mode: PrintMode) => void;
  printing?: boolean;
}) {
  const [draftData, setDraftData] = useState(data);
  const [localPrinting, setLocalPrinting] = useState(false);
  const printBusy = printing || localPrinting;

  useEffect(() => {
    setDraftData(data);
  }, [data]);

  function closeModal() {
    if (!printBusy) onClose();
  }

  function handlePrint() {
    if (printBusy) return;
    setLocalPrinting(true);
    try {
      onPrint(draftData, mode);
    } finally {
      window.setTimeout(() => setLocalPrinting(false), 1200);
    }
  }
  function patchLine(index: number, patch: Partial<PrintLine>) {
    setDraftData((current) => ({
      ...current,
      lines: current.lines.map((line, lineIndex) => (lineIndex === index ? { ...line, ...patch } : line)),
    }));
  }

  return (
    <PpeModalShell
      ariaLabel="Предпросмотр печати"
      bodyClassName="inventory-ppe-print-modal-body"
      className="inventory-ppe-picker inventory-ppe-print-modal"
      closeDisabled={printBusy}
      description="Проверьте сотрудника, строки выдачи и подписи перед печатью."
      eyebrow="Печатные формы СИЗ"
      footer={
        <>
          <PpeButton disabled={printBusy} onClick={closeModal} variant="ghost">Закрыть</PpeButton>
          <PpeButton disabled={printBusy} icon={<Printer size={16} />} loading={printBusy} onClick={handlePrint} variant="primary">
            Печать
          </PpeButton>
        </>
      }
      onClose={closeModal}
      title="Предпросмотр документа"
    >
      <div className="inventory-ppe-preview-tabs">
        <button className={mode === "card" ? "is-active" : ""} disabled={printBusy} onClick={() => onModeChange("card")} type="button">
          Личная карточка
        </button>
        <button className={mode === "sheet" ? "is-active" : ""} disabled={printBusy} onClick={() => onModeChange("sheet")} type="button">
          Лист подписи
        </button>
      </div>
      <div className="inventory-ppe-print-scroll">
        <PrintPaper data={draftData} mode={mode} onPatchLine={patchLine} />
      </div>
    </PpeModalShell>
  );
}

export function PrintPaper({
  data,
  mode,
  onPatchLine,
}: {
  data: PrintData;
  mode: PrintMode;
  onPatchLine?: (index: number, patch: Partial<PrintLine>) => void;
}) {
  return (
    <div className={`inventory-ppe-print-paper ppe-print-${mode}`}>
      {mode === "card" ? (
        <PersonalCardPaper data={data} onPatchLine={onPatchLine} />
      ) : (
        <SignatureSheetPaper data={data} onPatchLine={onPatchLine} />
      )}
    </div>
  );
}

export function printDocument(data: PrintData, mode: PrintMode) {
  const popup = window.open("", "_blank", "width=1200,height=900");
  if (!popup) return;

  popup.document.open();
  popup.document.write(buildPrintHtml(data, mode));
  popup.document.close();

  const runPrint = () => {
    if (popup.closed) return;
    popup.focus();
    popup.setTimeout(() => popup.print(), 150);
  };

  if (popup.document.readyState === "complete") {
    runPrint();
  } else {
    popup.addEventListener("load", runPrint, { once: true });
  }
}

export function buildPrintHtml(data: PrintData, mode: PrintMode) {
  const title = mode === "card" ? "Личная карточка учета выдачи СИЗ" : "Лист подписи получения СИЗ";
  const body = mode === "card" ? buildCardHtml(data) : buildSheetHtml(data);

  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>${printCss(mode)}</style>
</head>
<body>
  <div class="ppe-print-toolbar">
    <button type="button" onclick="window.print()">Печать</button>
    <button type="button" onclick="window.close()">Закрыть</button>
  </div>
  <div class="inventory-ppe-print-paper ppe-print-${mode}">${body}</div>
</body>
</html>`;
}

function PersonalCardPaper({
  data,
  onPatchLine,
}: {
  data: PrintData;
  onPatchLine?: (index: number, patch: Partial<PrintLine>) => void;
}) {
  return (
    <>
      <div className="ppe-print-title">
        <h3>Личная карточка № {cardNumber(data)}</h3>
        <h4>учета выдачи СИЗ</h4>
      </div>
      <EmployeeInfoBlock data={data} />
      <p className="norm-text">{PPE_NORM_TEXT}</p>
      <PersonalCardLinesTable lines={data.lines} onPatchLine={onPatchLine} />
      <div className="ppe-card-signatures">
        <p>Ответственное лицо за ведение карточек учета выдачи СИЗ</p>
        <div className="ppe-card-signature-lines" aria-label="Подписи">
          <span><b /></span>
          <span><b /></span>
          <em>(подпись)</em>
          <em>(Ф.И.О.)</em>
        </div>
      </div>
    </>
  );
}

function SignatureSheetPaper({
  data,
  onPatchLine,
}: {
  data: PrintData;
  onPatchLine?: (index: number, patch: Partial<PrintLine>) => void;
}) {
  return <SignatureLinesTable onPatchLine={onPatchLine} rows={signatureRows(data.lines)} />;
}

function EmployeeInfoBlock({ data }: { data: PrintData }) {
  const details = data.employeeDetails ?? {};
  const left = [
    ["Фамилия", employeeLastName(data.employeeName)],
    ["Имя, отчество", employeeRestName(data.employeeName)],
    ["Табельный номер", data.employee?.personnelNo || ""],
    ["Структурное подразделение", data.employee?.department || ""],
    ["Профессия / должность", data.position || ""],
    ["Дата поступления на работу", formatOptionalDate(data.employee?.hiredAt)],
    ["Дата изменения профессии или перевода", ""],
  ];
  const right = [
    ["Пол", details.gender || ""],
    ["Рост", details.height || ""],
    ["Размер одежды", details.clothingSize || ""],
    ["Размер обуви", details.shoeSize || ""],
    ["Размер головного убора", details.headSize || ""],
    ["СИЗОД", details.respiratorSize || ""],
    ["СИЗ рук", details.handProtectionSize || ""],
  ];

  return (
    <div className="ppe-personal-info">
      <EmployeeInfoColumn rows={left} />
      <EmployeeInfoColumn rows={right} />
    </div>
  );
}

function EmployeeInfoColumn({ rows }: { rows: string[][] }) {
  return (
    <div className="ppe-personal-info-column">
      {rows.map(([label, value]) => (
        <p className={`ppe-personal-info-line${label.length > 32 ? " is-long-label" : ""}`} key={label}>
          <span>{label}</span>
          <span>{value}</span>
        </p>
      ))}
    </div>
  );
}

function PersonalCardLinesTable({
  lines,
  onPatchLine,
}: {
  lines: PrintLine[];
  onPatchLine?: (index: number, patch: Partial<PrintLine>) => void;
}) {
  return (
    <table className="ppe-print-lines ppe-personal-lines">
      <colgroup>
        <col style={{ width: "43%" }} />
        <col style={{ width: "18%" }} />
        <col style={{ width: "25%" }} />
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
            <tr className={line.isSectionTitle ? "is-section-title" : ""} key={`${line.itemName}-${index}`}>
              <td>
                <EditablePrintValue
                  ariaLabel="Наименование СИЗ"
                  onChange={onPatchLine ? (value) => onPatchLine(index, { printItemName: value }) : undefined}
                  value={printItemName(line)}
                />
              </td>
              <td>
                {line.isSectionTitle ? "" : (
                  <EditablePrintValue
                    ariaLabel="Пункт норм"
                    onChange={onPatchLine ? (value) => onPatchLine(index, { normPoint: value }) : undefined}
                    value={line.normPoint || "п. 1645"}
                  />
                )}
              </td>
              <td>
                {line.isSectionTitle ? "" : (
                  <EditablePrintValue
                    ariaLabel="Периодичность"
                    onChange={onPatchLine ? (value) => onPatchLine(index, { issuePeriodText: value }) : undefined}
                    value={periodText(line)}
                  />
                )}
              </td>
              <td>{line.isSectionTitle ? "" : quantityText(line)}</td>
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

function SignatureLinesTable({
  rows,
  onPatchLine,
}: {
  rows: Array<{ line: PrintLine; sourceIndex: number }>;
  onPatchLine?: (index: number, patch: Partial<PrintLine>) => void;
}) {
  return (
    <table className="ppe-print-lines ppe-signature-lines">
      <colgroup>
        <col style={{ width: "18%" }} />
        <col style={{ width: "16%" }} />
        <col style={{ width: "7%" }} />
        <col style={{ width: "6%" }} />
        <col style={{ width: "8%" }} />
        <col style={{ width: "14%" }} />
        <col style={{ width: "7%" }} />
        <col style={{ width: "6%" }} />
        <col style={{ width: "9%" }} />
        <col style={{ width: "9%" }} />
      </colgroup>
      <thead>
        <tr>
          <th rowSpan={2}>Наименование СИЗ</th>
          <th rowSpan={2}>Модель, марка, артикул, класс защиты</th>
          <th colSpan={4}>Выдано</th>
          <th colSpan={4}>Возвращено</th>
        </tr>
        <tr>
          <th>дата</th>
          <th>кол-во</th>
          <th>лично / дозатор</th>
          <th>подпись получившего</th>
          <th>дата</th>
          <th>кол-во</th>
          <th>подпись сдавшего</th>
          <th>акт списания</th>
        </tr>
      </thead>
      <tbody>
        {rows.length ? (
          rows.map(({ line, sourceIndex }) => (
            <tr key={`${line.itemName}-${sourceIndex}`}>
              <td>{printItemName(line)}</td>
              <td>
                <EditablePrintValue
                  ariaLabel="Модель, марка, артикул"
                  onChange={onPatchLine ? (value) => onPatchLine(sourceIndex, { brandModelArticle: value }) : undefined}
                  value={brandModelArticle(line)}
                />
              </td>
              <td>{formatSheetIssuedAt(line.issuedAt)}</td>
              <td>{signatureQuantity(line)}</td>
              <td>{issueMethodText(line)}</td>
              <td />
              <td>{returnDateText(line)}</td>
              <td>{returnQuantityText(line)}</td>
              <td />
              <td>{writeOffActText(line)}</td>
            </tr>
          ))
        ) : (
          <tr>
            <td colSpan={10}>Нет строк со статусом "Выдано". Переключите нужные строки в "Выдано", чтобы они попали в лист подписи.</td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

function EditablePrintValue({
  ariaLabel,
  onChange,
  value,
}: {
  ariaLabel: string;
  onChange?: (value: string) => void;
  value: string;
}) {
  if (!onChange) return <>{value || "-"}</>;
  return <input aria-label={ariaLabel} className="ppe-print-cell-input" onChange={(event) => onChange(event.target.value)} value={value} />;
}

function buildCardHtml(data: PrintData) {
  const rows = data.lines.length
    ? data.lines
        .map((line) =>
          line.isSectionTitle
            ? `<tr class="is-section-title"><td>${escapeHtml(printItemName(line))}</td><td></td><td></td><td></td></tr>`
            : `<tr><td>${escapeHtml(printItemName(line))}</td><td>${escapeHtml(line.normPoint || "п. 1645")}</td><td>${escapeHtml(periodText(line))}</td><td>${escapeHtml(quantityText(line))}</td></tr>`,
        )
        .join("")
    : `<tr><td colspan="4">Позиции СИЗ не добавлены</td></tr>`;

  return `
    <div class="ppe-print-title"><h3>Личная карточка № ${escapeHtml(cardNumber(data))}</h3><h4>учета выдачи СИЗ</h4></div>
    ${buildEmployeeInfoHtml(data)}
    <p class="norm-text">${escapeHtml(PPE_NORM_TEXT)}</p>
    <table class="ppe-print-lines ppe-personal-lines">
      <colgroup><col style="width:43%"><col style="width:18%"><col style="width:25%"><col style="width:14%"></colgroup>
      <thead><tr><th>Наименование СИЗ</th><th>Пункт норм</th><th>Единица измерения, периодичность выдачи</th><th>Количество на период</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="ppe-card-signatures">
      <p>Ответственное лицо за ведение карточек учета выдачи СИЗ</p>
      <div class="ppe-card-signature-lines"><span><b></b></span><span><b></b></span><em>(подпись)</em><em>(Ф.И.О.)</em></div>
    </div>`;
}

function buildEmployeeInfoHtml(data: PrintData) {
  const details = data.employeeDetails ?? {};
  const left = [
    ["Фамилия", employeeLastName(data.employeeName)],
    ["Имя, отчество", employeeRestName(data.employeeName)],
    ["Табельный номер", data.employee?.personnelNo || ""],
    ["Структурное подразделение", data.employee?.department || ""],
    ["Профессия / должность", data.position || ""],
    ["Дата поступления на работу", formatOptionalDate(data.employee?.hiredAt)],
    ["Дата изменения профессии или перевода", ""],
  ];
  const right = [
    ["Пол", details.gender || ""],
    ["Рост", details.height || ""],
    ["Размер одежды", details.clothingSize || ""],
    ["Размер обуви", details.shoeSize || ""],
    ["Размер головного убора", details.headSize || ""],
    ["СИЗОД", details.respiratorSize || ""],
    ["СИЗ рук", details.handProtectionSize || ""],
  ];
  return `<div class="ppe-personal-info">${buildEmployeeInfoColumnHtml(left)}${buildEmployeeInfoColumnHtml(right)}</div>`;
}

function buildEmployeeInfoColumnHtml(rows: string[][]) {
  return `<div class="ppe-personal-info-column">${rows
    .map(
      ([label, value]) =>
        `<p class="ppe-personal-info-line${label.length > 32 ? " is-long-label" : ""}"><span>${escapeHtml(label)}</span><span>${escapeHtml(value)}</span></p>`,
    )
    .join("")}</div>`;
}

function buildSheetHtml(data: PrintData) {
  const rows = signatureLines(data.lines).length
    ? signatureLines(data.lines)
        .map(
          (line) =>
            `<tr><td>${escapeHtml(printItemName(line))}</td><td>${escapeHtml(brandModelArticle(line) || "-")}</td><td>${escapeHtml(formatSheetIssuedAt(line.issuedAt))}</td><td>${escapeHtml(signatureQuantity(line))}</td><td>${escapeHtml(issueMethodText(line))}</td><td></td><td>${escapeHtml(returnDateText(line))}</td><td>${escapeHtml(returnQuantityText(line))}</td><td></td><td>${escapeHtml(writeOffActText(line))}</td></tr>`,
        )
        .join("")
    : `<tr><td colspan="10">Нет строк со статусом &quot;Выдано&quot;. Переключите нужные строки в &quot;Выдано&quot;, чтобы они попали в лист подписи.</td></tr>`;

  return `
    <table class="ppe-print-lines ppe-signature-lines">
      <colgroup><col style="width:18%"><col style="width:16%"><col style="width:7%"><col style="width:6%"><col style="width:8%"><col style="width:14%"><col style="width:7%"><col style="width:6%"><col style="width:9%"><col style="width:9%"></colgroup>
      <thead>
        <tr><th rowspan="2">Наименование СИЗ</th><th rowspan="2">Модель, марка, артикул, класс защиты</th><th colspan="4">Выдано</th><th colspan="4">Возвращено</th></tr>
        <tr><th>дата</th><th>кол-во</th><th>лично / дозатор</th><th>подпись получившего</th><th>дата</th><th>кол-во</th><th>подпись сдавшего</th><th>акт списания</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function signatureLines(lines: PrintLine[]) {
  return sortPpeSignatureLines(
    lines.filter((line) => !line.isSectionTitle && isPpeSignatureLineStatus(line.status)),
  );
}

function signatureRows(lines: PrintLine[]) {
  return lines
    .map((line, sourceIndex) => ({ line, sourceIndex }))
    .filter(({ line }) => !line.isSectionTitle && isPpeSignatureLineStatus(line.status))
    .sort((left, right) => {
      const leftTime = parsePrintDate(left.line.issuedAt);
      const rightTime = parsePrintDate(right.line.issuedAt);
      if (leftTime !== rightTime) return leftTime - rightTime;
      return left.sourceIndex - right.sourceIndex;
    });
}

function cardNumber(data: PrintData) {
  return data.cardId ? `СИЗ-${data.cardId.slice(0, 8)}` : "___";
}

function employeeLastName(value: string) {
  return value.trim().split(/\s+/)[0] || "";
}

function employeeRestName(value: string) {
  return value.trim().split(/\s+/).slice(1).join(" ");
}

function formatOptionalDate(value?: string | null) {
  return value ? formatDate(value, "date") : "";
}

function periodText(line: PrintLine) {
  const explicitText = line.issuePeriodText?.trim();
  if (explicitText) return explicitText;

  const unit = line.unit || "шт.";
  if (line.dueAt) return `${unit}, до ${formatDate(line.dueAt, "date")}`;
  return `${unit}, на год`;
}

function signatureQuantity(line: PrintLine) {
  return `${formatQuantity(line.quantity)} ${line.unit || "шт."}`;
}

function quantityText(line: PrintLine) {
  return line.quantityText?.trim() || signatureQuantity(line);
}

function printItemName(line: PrintLine) {
  return line.printItemName?.trim() || line.itemName;
}

function brandModelArticle(line: PrintLine) {
  return line.brandModelArticle?.trim() || line.model?.trim() || "";
}

function issueMethodText(line: PrintLine) {
  if (line.issueMethod === "dispenser") return "дозатор";
  if (line.issueMethod === "personal") return "лично";
  return isConsumableLine(line) ? "дозатор" : "лично";
}

function isReturnLine(line: PrintLine) {
  return line.status === PPE_STATUS.returned || line.status === PPE_STATUS.writtenOff;
}

function returnDateText(line: PrintLine) {
  return isReturnLine(line) ? formatSheetIssuedAt(line.dueAt) : "";
}

function returnQuantityText(line: PrintLine) {
  return isReturnLine(line) ? signatureQuantity(line) : "";
}

function writeOffActText(line: PrintLine) {
  return line.status === PPE_STATUS.writtenOff ? "Требуется акт" : "";
}

function formatSheetIssuedAt(value?: string | null) {
  return value ? formatDate(value, "date") : "";
}

function parsePrintDate(value?: string | null) {
  if (!value) return Number.MAX_SAFE_INTEGER;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed;
}

function printCss(mode: PrintMode) {
  return `
    @page { size: A4 ${mode === "sheet" ? "landscape" : "portrait"}; margin: ${mode === "sheet" ? "9mm" : "12mm"}; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #000; background: #fff; font-family: "Times New Roman", Times, serif; font-weight: 400; }
    .ppe-print-toolbar { position: sticky; top: 0; z-index: 10; display: flex; gap: 8px; justify-content: flex-end; padding: 8px 0; margin-bottom: 8px; background: #fff; border-bottom: 1px solid #d7e3f5; font-family: Arial, sans-serif; }
    .ppe-print-toolbar button { border: 1px solid #b8cbea; border-radius: 8px; background: #fff; color: #0b4fb3; font: 700 13px Arial, sans-serif; padding: 8px 14px; cursor: pointer; }
    .ppe-print-toolbar button:first-child { border-color: #0b63f6; background: #0b63f6; color: #fff; }
    @media print { .ppe-print-toolbar { display: none; } }
    .inventory-ppe-print-paper { display: grid; align-content: start; gap: ${mode === "sheet" ? "0" : "8px"}; width: 100%; color: #000; font-weight: 400; }
    .inventory-ppe-print-paper * { color: #000; font-family: "Times New Roman", Times, serif; }
    h3, h4, p { margin: 0; }
    h3 { font-size: 16pt; font-weight: 700; text-align: center; text-transform: uppercase; }
    h4 { font-size: 10pt; font-weight: 700; text-align: center; text-transform: uppercase; }
    .ppe-print-title { display: grid; gap: 4px; margin-top: ${mode === "card" ? "10mm" : "0"}; }
    .norm-text { margin-top: 3px; font-size: 8pt; line-height: 1.08; text-align: left; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    td, th { border: 1px solid #111; padding: 2px 3px; vertical-align: top; font-size: 10pt; line-height: 1.08; overflow-wrap: anywhere; }
    th { font-weight: 700; text-align: center; }
    .ppe-personal-info { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; align-items: start; margin-top: 12px; }
    .ppe-personal-info-column { display: grid; gap: 1px; min-width: 0; }
    .ppe-personal-info-line { display: grid; grid-template-columns: auto minmax(52px, 1fr); gap: 6px; align-items: end; min-height: 13px; font-size: 10pt; line-height: 1.05; }
    .ppe-personal-info-line span:first-child { font-weight: 400; white-space: nowrap; }
    .ppe-personal-info-line span:last-child { min-height: 11px; border-bottom: 1px solid #111; overflow-wrap: anywhere; }
    .ppe-personal-info-line.is-long-label { grid-template-columns: minmax(190px, 1.25fr) minmax(70px, .75fr); }
    .ppe-personal-info-line.is-long-label span:first-child { white-space: normal; }
    .ppe-personal-lines th, .ppe-personal-lines td { padding: 2px 3px; font-size: 8pt; line-height: 1.05; }
    .ppe-personal-lines tr.is-section-title td:first-child { font-weight: 700; }
    .ppe-signature-lines { border: 1px solid #111; border-collapse: separate; border-spacing: 0; }
    .ppe-signature-lines th, .ppe-signature-lines td { border: 0; border-right: 1px solid #111; border-bottom: 1px solid #111; padding: 1px 2px; font-family: "Times New Roman", Times, serif; font-size: 10pt; font-weight: 400; line-height: 1.04; vertical-align: middle; }
    .ppe-signature-lines th { font-weight: 700; }
    .ppe-signature-lines p, .ppe-signature-lines span, .ppe-signature-lines input { margin: 0; font-family: "Times New Roman", Times, serif; font-size: 10pt; line-height: 1.04; }
    .ppe-print-cell-input { width: 100%; min-height: 14px; padding: 0 1px; border: 0; background: transparent; font: inherit; color: inherit; }
    .ppe-signature-lines th:last-child, .ppe-signature-lines td:last-child { border-right: 0; }
    .ppe-signature-lines tbody tr:last-child td { border-bottom: 0; }
    .ppe-card-signatures { display: grid; grid-template-columns: auto 260px; gap: 16px; align-items: end; margin-top: 8px; font-size: 9.2px; }
    .ppe-card-signatures p { white-space: nowrap; }
    .ppe-card-signature-lines { display: grid; grid-template-columns: 1fr 1fr; column-gap: 14px; row-gap: 2px; text-align: center; font-size: 8px; }
    .ppe-card-signature-lines span { height: 12px; border-bottom: 1px solid #111; }
    .ppe-card-signature-lines em { font-style: normal; }
  `;
}
