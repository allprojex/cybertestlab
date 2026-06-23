import * as XLSX from "xlsx";
import type { CsvRow } from "./csv";

/** Parse the first sheet of an .xlsx/.xls file into row objects keyed by header. */
export async function parseXlsx(file: File): Promise<CsvRow[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const firstSheet = wb.SheetNames[0];
  if (!firstSheet) return [];
  const ws = wb.Sheets[firstSheet];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    defval: "",
    raw: false,
  });
  return rows.map((r) => {
    const out: CsvRow = {};
    Object.keys(r).forEach((k) => {
      out[k.trim()] = String(r[k] ?? "").trim();
    });
    return out;
  });
}
