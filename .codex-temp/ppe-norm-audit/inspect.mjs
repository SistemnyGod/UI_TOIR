import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const files = [
  "C:/Users/AI_server/Documents/Нормы выдачи СИЗ АТОМ (актуальная) 01.04.26.xlsx",
  "C:/Users/AI_server/Documents/спецодежда номенклатура.xlsx",
];

for (const file of files) {
  const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(file));
  const sheets = await workbook.inspect({ kind: "sheet", include: "id,name", maxChars: 4000 });
  const footwear = await workbook.inspect({
    kind: "match",
    searchTerm: "обув|ботин|сапог|зимн",
    options: { useRegex: true, maxResults: 120 },
    maxChars: 20000,
  });
  console.log(JSON.stringify({ file, sheets: sheets.ndjson, matches: footwear.ndjson }));
}
