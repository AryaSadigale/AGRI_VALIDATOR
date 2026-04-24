import fs from "node:fs/promises";
import path from "node:path";
import { Workbook, SpreadsheetFile } from "@oai/artifact-tool";

const root = "C:/Users/Dell/Downloads/agri-recommendation-validator (2)/agri-recommendation-validator";
const outputDir = path.join(root, "outputs", "batch_validation_pack_20260425");
const uploadCsvPath = path.join(outputDir, "batch_upload_ready.csv");
const referenceCsvPath = path.join(outputDir, "batch_reference_outputs.csv");
const workbookPath = path.join(outputDir, "AgriValidator_Batch_Validation_Pack.xlsx");

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        value += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(value);
      value = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        i += 1;
      }
      row.push(value);
      if (row.length > 1 || row[0] !== "") {
        rows.push(row);
      }
      row = [];
      value = "";
      continue;
    }

    value += char;
  }

  if (value.length > 0 || row.length > 0) {
    row.push(value);
    rows.push(row);
  }

  return rows;
}

function toMatrix(rows, numericColumns = new Set()) {
  const [header, ...body] = rows;
  return {
    header,
    body: body.map((row) =>
      row.map((value, index) => {
        if (numericColumns.has(index)) {
          return value === "" ? null : Number(value);
        }
        return value;
      }),
    ),
  };
}

function colLetter(index) {
  let value = index + 1;
  let output = "";
  while (value > 0) {
    const rem = (value - 1) % 26;
    output = String.fromCharCode(65 + rem) + output;
    value = Math.floor((value - 1) / 26);
  }
  return output;
}

function setColumnWidth(sheet, column, width) {
  sheet.getRange(`${column}:${column}`).format.columnWidth = width;
}

const uploadText = await fs.readFile(uploadCsvPath, "utf8");
const referenceText = await fs.readFile(referenceCsvPath, "utf8");

const uploadRows = parseCsv(uploadText);
const referenceRows = parseCsv(referenceText);

const upload = toMatrix(uploadRows, new Set([4, 5, 6]));
const reference = toMatrix(referenceRows, new Set([1, 6, 7, 8, 12, 13, 14, 15, 19, 20]));
const referenceDataEndRow = reference.body.length + 12;
const stateCounts = {
  Maharashtra: reference.body.filter((row) => row[2] === "Maharashtra").length,
  Karnataka: reference.body.filter((row) => row[2] === "Karnataka").length,
  "Andhra Pradesh": reference.body.filter((row) => row[2] === "Andhra Pradesh").length,
  Telangana: reference.body.filter((row) => row[2] === "Telangana").length,
};

const workbook = Workbook.create();

const uploadSheet = workbook.worksheets.add("Upload_Ready");
const referenceSheet = workbook.worksheets.add("Expected_Outputs");

const uploadEndRow = upload.body.length + 1;
const uploadEndCol = colLetter(upload.header.length - 1);
uploadSheet.getRange(`A1:${uploadEndCol}${uploadEndRow}`).values = [upload.header, ...upload.body];
uploadSheet.freezePanes.freezeRows(1);
uploadSheet.getRange(`A1:${uploadEndCol}1`).format = {
  fill: { type: "solid", color: { type: "theme", value: "accent1", transform: { darken: 8 } } },
  font: { name: "Calibri", size: 11, color: "lt1", bold: true },
  horizontalAlignment: "center",
  verticalAlignment: "center",
  wrapText: true,
  borders: { preset: "outside", style: "thin", color: "#D1D5DB" },
};
uploadSheet.getRange(`A2:${uploadEndCol}${uploadEndRow}`).format = {
  font: { name: "Calibri", size: 11, color: "tx1" },
  borders: { preset: "outside", style: "thin", color: "#E5E7EB" },
};
uploadSheet.getRange(`E2:G${uploadEndRow}`).format.numberFormat = "0.00";
uploadSheet.getRange(`A1:${uploadEndCol}${uploadEndRow}`).format.autofitColumns();
uploadSheet.getRange(`A1:${uploadEndCol}${uploadEndRow}`).format.autofitRows();
uploadSheet.tables.add(`A1:${uploadEndCol}${uploadEndRow}`, true);

setColumnWidth(uploadSheet, "A", 120);
setColumnWidth(uploadSheet, "B", 140);
setColumnWidth(uploadSheet, "C", 120);
setColumnWidth(uploadSheet, "D", 90);
setColumnWidth(uploadSheet, "E", 85);
setColumnWidth(uploadSheet, "F", 100);
setColumnWidth(uploadSheet, "G", 85);

referenceSheet.getRange("A1").values = [["Agri Validator Batch Validation Reference Pack"]];
referenceSheet.getRange("A1:V1").format = {
  fill: { type: "solid", color: { type: "theme", value: "accent1", transform: { darken: 6 } } },
  font: { name: "Calibri", size: 15, color: "lt1", bold: true },
  horizontalAlignment: "left",
  verticalAlignment: "center",
};
referenceSheet.getRange("A2").values = [[
  "This workbook contains 300 balanced project-ready cases. Use the Upload_Ready sheet as your source for CSV export and use this sheet to compare the app output against expected AI, expert, and final decision values.",
]];
referenceSheet.getRange("A2:V2").format = {
  font: { name: "Calibri", size: 11, color: "tx1" },
  wrapText: true,
};

referenceSheet.getRange("A4:B9").values = [
  ["Summary KPI", "Value"],
  ["Total Cases", null],
  ["Average PCS", null],
  ["Average EAS", null],
  ["Average RDI", null],
  ["Average TRI", null],
];
referenceSheet.getRange("B5:B9").formulas = [
  [`=COUNTA(A13:A${referenceDataEndRow})`],
  [`=AVERAGE(M13:M${referenceDataEndRow})`],
  [`=AVERAGE(N13:N${referenceDataEndRow})`],
  [`=AVERAGE(O13:O${referenceDataEndRow})`],
  [`=AVERAGE(P13:P${referenceDataEndRow})`],
];
referenceSheet.getRange("D4:E8").values = [
  ["State Mix", "Cases"],
  ["Maharashtra", null],
  ["Karnataka", null],
  ["Andhra Pradesh", null],
  ["Telangana", null],
];
referenceSheet.getRange("E5:E8").formulas = [
  [`=COUNTIF(C13:C${referenceDataEndRow},"Maharashtra")`],
  [`=COUNTIF(C13:C${referenceDataEndRow},"Karnataka")`],
  [`=COUNTIF(C13:C${referenceDataEndRow},"Andhra Pradesh")`],
  [`=COUNTIF(C13:C${referenceDataEndRow},"Telangana")`],
];
referenceSheet.getRange("G4:H8").values = [
  ["Risk Mix", "Cases"],
  ["Low", null],
  ["Medium", null],
  ["High", null],
  ["Review Required", null],
];
referenceSheet.getRange("H5:H8").formulas = [
  [`=COUNTIF(L13:L${referenceDataEndRow},"Low")`],
  [`=COUNTIF(L13:L${referenceDataEndRow},"Medium")`],
  [`=COUNTIF(L13:L${referenceDataEndRow},"High")`],
  [`=COUNTIF(Q13:Q${referenceDataEndRow},"REVIEW REQUIRED")`],
];

referenceSheet.getRange("A4:H9").format = {
  borders: { preset: "outside", style: "thin", color: "#D1D5DB" },
  font: { name: "Calibri", size: 11, color: "tx1" },
};
referenceSheet.getRange("A4:H4").format = {
  fill: { type: "solid", color: { type: "theme", value: "accent2", transform: { darken: 12 } } },
  font: { name: "Calibri", size: 11, color: "lt1", bold: true },
};
referenceSheet.getRange("A5:B9").format.numberFormat = [["General", "0.00"], ["General", "0.000"], ["General", "0.000"], ["General", "0.000"], ["General", "0.00"]];

const refEndRow = referenceDataEndRow;
const refEndCol = colLetter(reference.header.length - 1);
referenceSheet.getRange(`A12:${refEndCol}${refEndRow}`).values = [reference.header, ...reference.body];
referenceSheet.freezePanes.freezeRows(12);
referenceSheet.getRange(`A12:${refEndCol}12`).format = {
  fill: { type: "solid", color: { type: "theme", value: "accent1", transform: { darken: 8 } } },
  font: { name: "Calibri", size: 11, color: "lt1", bold: true },
  horizontalAlignment: "center",
  verticalAlignment: "center",
  wrapText: true,
  borders: { preset: "outside", style: "thin", color: "#D1D5DB" },
};
referenceSheet.getRange(`A13:${refEndCol}${refEndRow}`).format = {
  font: { name: "Calibri", size: 10, color: "tx1" },
  borders: { preset: "outside", style: "thin", color: "#E5E7EB" },
};
referenceSheet.getRange(`G13:I${refEndRow}`).format.numberFormat = "0.00";
referenceSheet.getRange(`M13:O${refEndRow}`).format.numberFormat = "0.000";
referenceSheet.getRange(`P13:P${refEndRow}`).format.numberFormat = "0.00";
referenceSheet.getRange(`T13:U${refEndRow}`).format.numberFormat = "0.000";
referenceSheet.getRange(`A12:${refEndCol}${refEndRow}`).format.autofitColumns();
referenceSheet.getRange(`A12:${refEndCol}${refEndRow}`).format.autofitRows();
referenceSheet.tables.add(`A12:${refEndCol}${refEndRow}`, true);

[
  ["A", 90],
  ["B", 80],
  ["C", 120],
  ["D", 140],
  ["E", 120],
  ["F", 90],
  ["G", 75],
  ["H", 90],
  ["I", 75],
  ["J", 105],
  ["K", 115],
  ["L", 105],
  ["M", 70],
  ["N", 70],
  ["O", 70],
  ["P", 70],
  ["Q", 120],
  ["R", 160],
  ["S", 125],
  ["T", 130],
  ["U", 120],
  ["V", 130],
].forEach(([col, width]) => setColumnWidth(referenceSheet, col, width));

referenceSheet.charts.add("bar", {
  title: "Cases by State",
  titleTextStyle: { fontSize: 16, bold: true },
  categories: ["Maharashtra", "Karnataka", "Andhra Pradesh", "Telangana"],
  series: [
    {
      name: "Cases",
      values: [
        stateCounts.Maharashtra,
        stateCounts.Karnataka,
        stateCounts["Andhra Pradesh"],
        stateCounts.Telangana,
      ],
    },
  ],
  hasLegend: false,
  barOptions: { direction: "column", grouping: "clustered", gapWidth: 70 },
  dataLabels: { showValue: true },
  from: { row: 1, col: 9 },
  extent: { widthPx: 520, heightPx: 260 },
});

const compact = await workbook.inspect({
  kind: "table",
  range: "Expected_Outputs!A1:V18",
  include: "values,formulas",
  tableMaxRows: 18,
  tableMaxCols: 22,
});
console.log(compact.ndjson);

await workbook.render({ sheetName: "Upload_Ready", range: `A1:G20`, scale: 1.6 });
await workbook.render({ sheetName: "Expected_Outputs", range: "A1:V20", scale: 1.4 });

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(workbookPath);

console.log(`Saved workbook to ${workbookPath}`);
