import ExcelJS from "exceljs";

export interface ReportTable {
  name: string;
  columns: { key: string; header: string; width?: number }[];
  rows: Record<string, string | number | null>[];
}

export function toCsv(table: ReportTable): string {
  const escape = (value: string | number | null): string => {
    if (value === null || value === undefined) return "";
    const str = String(value);
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  const header = table.columns.map((c) => escape(c.header)).join(",");
  const body = table.rows.map((row) => table.columns.map((c) => escape(row[c.key] ?? "")).join(","));
  return [header, ...body].join("\r\n");
}

export async function toXlsx(tables: ReportTable[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "PIEMR Project Platform";
  workbook.created = new Date();

  for (const table of tables) {
    const sheet = workbook.addWorksheet(table.name.slice(0, 31));
    sheet.columns = table.columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 22 }));
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFEEF2F8" },
    };
    for (const row of table.rows) sheet.addRow(row);
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: table.columns.length },
    };
  }
  const out = await workbook.xlsx.writeBuffer();
  return Buffer.from(out);
}

export function fileNameFor(base: string, extension: string): string {
  const stamp = new Date().toISOString().slice(0, 10);
  return `${base.replace(/[^a-zA-Z0-9-]+/g, "-").toLowerCase()}-${stamp}.${extension}`;
}
