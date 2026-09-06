import { describe, expect, it } from "vitest";
import { fileNameFor, toCsv, toXlsx, type ReportTable } from "@/lib/services/reports";

const table: ReportTable = {
  name: "Sample",
  columns: [
    { key: "a", header: "Team ID" },
    { key: "b", header: "Discussion" },
  ],
  rows: [
    { a: "PIEMR-CSE-001", b: "Simple text" },
    { a: "PIEMR-CSE-002", b: 'Contains, a comma and a "quote"' },
    { a: "PIEMR-CSE-003", b: "Contains\na newline" },
    { a: "PIEMR-CSE-004", b: null },
  ],
};

describe("toCsv", () => {
  const csv = toCsv(table);
  const lines = csv.split("\r\n");

  it("writes the header row from column definitions", () => {
    expect(lines[0]).toBe("Team ID,Discussion");
  });

  it("passes plain values through unquoted", () => {
    expect(lines[1]).toBe("PIEMR-CSE-001,Simple text");
  });

  it("quotes and escapes a value containing a comma and a double quote", () => {
    expect(lines[2]).toBe('PIEMR-CSE-002,"Contains, a comma and a ""quote"""');
  });

  it("quotes a value containing a newline so it stays on one CSV record", () => {
    expect(lines[3]).toBe('PIEMR-CSE-003,"Contains\na newline"');
  });

  it("renders null as an empty field, never the literal string 'null'", () => {
    expect(lines[4]).toBe("PIEMR-CSE-004,");
  });

  it("produces exactly one line per row plus the header", () => {
    // The embedded newline inside a quoted field must not create an extra
    // logical CSV row — a naive `split("\n")` would over-count here.
    expect(lines.length).toBe(1 + table.rows.length);
  });
});

describe("toXlsx", () => {
  it("produces a non-empty workbook buffer with one sheet per table", async () => {
    const buffer = await toXlsx([table, { ...table, name: "Second" }]);
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.byteLength).toBeGreaterThan(0);
    // XLSX files are zip archives — check the local file header magic bytes.
    expect(buffer.subarray(0, 2).toString("hex")).toBe("504b");
  });

  it("truncates a sheet name over Excel's 31-character limit instead of throwing", async () => {
    const longName: ReportTable = { ...table, name: "A".repeat(50) };
    await expect(toXlsx([longName])).resolves.toBeInstanceOf(Buffer);
  });
});

describe("fileNameFor", () => {
  it("slugifies the base name and appends today's date and extension", () => {
    const name = fileNameFor("PIEMR Attendance Report", "csv");
    expect(name).toMatch(/^piemr-attendance-report-\d{4}-\d{2}-\d{2}\.csv$/);
  });

  it("strips characters that are unsafe in a filename", () => {
    const name = fileNameFor('weird/name:with*chars?"<>|', "xlsx");
    expect(name).not.toMatch(/[/:*?"<>|]/);
    expect(name.endsWith(".xlsx")).toBe(true);
  });
});
