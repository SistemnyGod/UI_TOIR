import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const files = process.argv.slice(2);

for (const file of files) {
  const input = await FileBlob.load(file);
  const workbook = await SpreadsheetFile.importXlsx(input);
  const overview = await workbook.inspect({
    kind: "workbook,sheet,table",
    maxChars: 12000,
    tableMaxRows: 12,
    tableMaxCols: 14,
    tableMaxCellChars: 160,
  });
  console.log(JSON.stringify({ file, overview: overview.ndjson }));
}
