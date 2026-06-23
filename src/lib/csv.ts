// CSV helpers used across the app for imports, exports, and reports.
export type CsvRow = Record<string, string>;

// RFC 4180-ish parser. Handles quotes, commas, escaped quotes, CRLF.
export function parseCsv(text: string): CsvRow[] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else { field += c; }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { cur.push(field); field = ""; }
      else if (c === "\n") { cur.push(field); rows.push(cur); cur = []; field = ""; }
      else if (c === "\r") { /* ignore */ }
      else field += c;
    }
  }
  if (field.length > 0 || cur.length > 0) { cur.push(field); rows.push(cur); }
  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1)
    .filter((r) => r.some((v) => v.trim() !== ""))
    .map((r) => {
      const obj: CsvRow = {};
      headers.forEach((h, i) => { obj[h] = (r[i] ?? "").trim(); });
      return obj;
    });
}

const escapeCell = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  const s = v instanceof Date ? v.toISOString() : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// Object-row CSV (used by exports/templates).
export function toCsv(rows: Array<Record<string, unknown>>, headers: string[]): string {
  const head = headers.join(",");
  const body = rows.map((r) => headers.map((h) => escapeCell(r[h])).join(",")).join("\n");
  return rows.length ? `${head}\n${body}` : head;
}

// Alternate spelling kept for clarity in newer callers.
export const toCSV = toCsv;

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Convenience: build CSV from object rows and download in one shot.
export function downloadCSV(filename: string, rows: Array<Record<string, unknown>>, columns?: string[]) {
  const cols = columns ?? Array.from(
    rows.reduce<Set<string>>((acc, r) => { Object.keys(r).forEach((k) => acc.add(k)); return acc; }, new Set())
  );
  downloadCsv(filename, toCsv(rows, cols));
}
