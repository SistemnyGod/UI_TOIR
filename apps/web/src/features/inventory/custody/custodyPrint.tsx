import type { InventoryCustodyDocumentDto } from "../../../api/contracts";
import { documentStatusLabel } from "./custodyCommon";

export function CustodyPrintPreview({ document }: { document: InventoryCustodyDocumentDto }) {
  return (
    <section className="inventory-custody-print-preview" aria-label="Мини-предпросмотр печати">
      <div>
        <strong>Акт материальной ответственности</strong>
        <span>{document.number}</span>
      </div>
      <p>{document.employeeName}</p>
      <table>
        <tbody>
          <tr><td>Строк</td><td>{document.recordsCount}</td></tr>
          <tr><td>Статус</td><td>{documentStatusLabel(document.status)}</td></tr>
        </tbody>
      </table>
    </section>
  );
}
