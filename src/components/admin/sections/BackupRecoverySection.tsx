import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/components/ui/sonner";
import {
  Database, Download, Upload, RefreshCw, Trash2, ShieldCheck, AlertTriangle,
  ArrowUp, ArrowDown, Search,
} from "lucide-react";

/** Tables included in a full backup. */
const BACKUP_TABLES = [
  "organizations",
  "departments",
  "question_categories",
  "questions",
  "question_sets",
  "question_set_items",
  "question_set_assignments",
  "question_assignments",
  "applicants",
  "test_attempts",
  "test_results",
  "app_settings",
] as const;
type BackupTable = (typeof BACKUP_TABLES)[number];

const RESTORE_ORDER: BackupTable[] = [...BACKUP_TABLES];

const SCHEMA_VERSION = 1;
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

type BackupEnvelope = {
  schema_version: number;
  generated_at: string;
  app: string;
  tables: Partial<Record<BackupTable, Record<string, unknown>[]>>;
};

type BackupFormat = "json" | "xlsx" | "csv" | "other";
type BackupSource = "generated" | "uploaded";

type BackupMeta = {
  id: string;
  version: number;
  filename: string;
  format: BackupFormat;
  source: BackupSource;
  tables: string[];
  row_count: number;
  size_bytes: number;
  created_by: string | null;
  created_by_email: string | null;
  notes: string | null;
  created_at: string;
};

const FORMATS = [
  { value: "json", label: "JSON (full, restorable)" },
  { value: "xlsx", label: "Excel workbook (.xlsx)" },
  { value: "csv", label: "CSV (single table)" },
] as const;
type Format = (typeof FORMATS)[number]["value"];

const FORMAT_TONE: Record<BackupFormat, string> = {
  json: "bg-blue-500/10 text-blue-600 border-blue-500/30",
  xlsx: "bg-green-500/10 text-green-600 border-green-500/30",
  csv:  "bg-amber-500/10 text-amber-700 border-amber-500/30",
  other: "bg-muted text-muted-foreground",
};

function escapeCsv(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function tableToCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const cols = Array.from(rows.reduce((s, r) => {
    Object.keys(r).forEach((k) => s.add(k));
    return s;
  }, new Set<string>()));
  const header = cols.map(escapeCsv).join(",");
  const body = rows.map((r) => cols.map((c) => escapeCsv(r[c])).join(",")).join("\n");
  return `${header}\n${body}\n`;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function isValidEnvelope(obj: unknown): obj is BackupEnvelope {
  if (!obj || typeof obj !== "object") return false;
  const e = obj as Record<string, unknown>;
  if (typeof e.schema_version !== "number") return false;
  if (typeof e.generated_at !== "string") return false;
  if (!e.tables || typeof e.tables !== "object") return false;
  for (const [k, v] of Object.entries(e.tables as Record<string, unknown>)) {
    if (!BACKUP_TABLES.includes(k as BackupTable)) return false;
    if (!Array.isArray(v)) return false;
  }
  return true;
}

function detectFormatFromName(name: string): BackupFormat {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "json") return "json";
  if (ext === "xlsx" || ext === "xls") return "xlsx";
  if (ext === "csv") return "csv";
  return "other";
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

async function logAudit(action: string, metadata: Record<string, unknown> = {}) {
  try {
    await supabase.rpc("log_admin_action", { _action: action, _metadata: metadata as never });
  } catch { /* non-fatal */ }
}

async function recordMeta(row: {
  filename: string; format: BackupFormat; source: BackupSource;
  tables: string[]; row_count: number; size_bytes: number;
}) {
  const { data: u } = await supabase.auth.getUser();
  const userId = u?.user?.id ?? null;
  const email = u?.user?.email ?? null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase.from("backup_files" as any) as any).insert({
    ...row,
    created_by: userId,
    created_by_email: email,
  });
}

type SortKey = "version" | "created_at" | "size_bytes" | "row_count" | "filename";
type SortDir = "asc" | "desc";

export function BackupRecoverySection() {
  const [format, setFormat] = useState<Format>("json");
  const [csvTable, setCsvTable] = useState<BackupTable>("applicants");
  const [generating, setGenerating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [files, setFiles] = useState<BackupMeta[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [filterFormat, setFilterFormat] = useState<"all" | BackupFormat>("all");
  const [filterSource, setFilterSource] = useState<"all" | BackupSource>("all");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Restore dialog state
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [pendingEnvelope, setPendingEnvelope] = useState<BackupEnvelope | null>(null);
  const [pendingSource, setPendingSource] = useState<string>("");
  const [confirmText, setConfirmText] = useState("");
  const [restoring, setRestoring] = useState(false);
  const [restoreErr, setRestoreErr] = useState<string>("");

  const refresh = async () => {
    setLoadingFiles(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.from("backup_files" as any) as any)
      .select("*")
      .order("created_at", { ascending: false });
    setLoadingFiles(false);
    if (error) { toast.error(`Could not load backups: ${error.message}`); return; }
    setFiles((data ?? []) as BackupMeta[]);
  };
  useEffect(() => { refresh(); }, []);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = files.filter((f) => {
      if (filterFormat !== "all" && f.format !== filterFormat) return false;
      if (filterSource !== "all" && f.source !== filterSource) return false;
      if (q) {
        const hay = `${f.filename} ${f.created_by_email ?? ""} ${(f.tables ?? []).join(" ")}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const dir = sortDir === "asc" ? 1 : -1;
    filtered.sort((a, b) => {
      const av = a[sortKey] as unknown; const bv = b[sortKey] as unknown;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av ?? "").localeCompare(String(bv ?? "")) * dir;
    });
    return filtered;
  }, [files, search, filterFormat, filterSource, sortKey, sortDir]);

  const stats = useMemo(() => ({
    count: files.length,
    bytes: files.reduce((s, f) => s + (f.size_bytes ?? 0), 0),
  }), [files]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir(k === "filename" ? "asc" : "desc"); }
  };
  const SortIcon = ({ k }: { k: SortKey }) =>
    sortKey !== k ? null : sortDir === "asc"
      ? <ArrowUp className="inline h-3 w-3 ml-1" />
      : <ArrowDown className="inline h-3 w-3 ml-1" />;

  // ---------------------------------------------------------------- generate

  const fetchAll = async (): Promise<BackupEnvelope> => {
    const tables: BackupEnvelope["tables"] = {};
    for (const t of BACKUP_TABLES) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from(t as any) as any).select("*");
      if (error) throw new Error(`${t}: ${error.message}`);
      tables[t] = (data ?? []) as Record<string, unknown>[];
    }
    return { schema_version: SCHEMA_VERSION, generated_at: new Date().toISOString(), app: "admin-backup", tables };
  };

  const generate = async () => {
    setGenerating(true);
    try {
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      if (format === "csv") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase.from(csvTable as any) as any).select("*");
        if (error) throw new Error(error.message);
        const rows = (data ?? []) as Record<string, unknown>[];
        const csv = tableToCsv(rows);
        const filename = `backup-${csvTable}-${stamp}.csv`;
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        downloadBlob(blob, filename);
        await supabase.storage.from("backups").upload(filename, blob, { upsert: false, contentType: "text/csv" });
        await recordMeta({ filename, format: "csv", source: "generated", tables: [csvTable], row_count: rows.length, size_bytes: blob.size });
        await logAudit("backup_created", { format, table: csvTable, filename, rows: rows.length });
        toast.success(`Backup created (${rows.length} rows)`);
      } else {
        const env = await fetchAll();
        const totalRows = Object.values(env.tables).reduce((s, r) => s + (r?.length ?? 0), 0);
        const tableList = Object.keys(env.tables);
        let filename = "", blob: Blob;
        if (format === "json") {
          filename = `backup-full-${stamp}.json`;
          blob = new Blob([JSON.stringify(env, null, 2)], { type: "application/json" });
        } else {
          const wb = XLSX.utils.book_new();
          for (const [name, rows] of Object.entries(env.tables)) {
            const sheet = XLSX.utils.json_to_sheet(rows ?? []);
            XLSX.utils.book_append_sheet(wb, sheet, name.slice(0, 31));
          }
          const meta = XLSX.utils.json_to_sheet([
            { schema_version: env.schema_version, generated_at: env.generated_at, app: env.app },
          ]);
          XLSX.utils.book_append_sheet(wb, meta, "_meta");
          filename = `backup-full-${stamp}.xlsx`;
          const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
          blob = new Blob([wbout], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
        }
        downloadBlob(blob, filename);
        await supabase.storage.from("backups").upload(filename, blob, { upsert: false, contentType: blob.type });
        await recordMeta({ filename, format: format as BackupFormat, source: "generated", tables: tableList, row_count: totalRows, size_bytes: blob.size });
        await logAudit("backup_created", { format, filename, rows: totalRows, tables: tableList.length });
        toast.success("Full backup created and downloaded");
      }
      refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Backup failed";
      toast.error(msg);
      await logAudit("backup_failed", { format, error: msg });
    } finally {
      setGenerating(false);
    }
  };

  // ----------------------------------------------------------------- storage

  const downloadStored = async (name: string) => {
    const { data, error } = await supabase.storage.from("backups").download(name);
    if (error || !data) { toast.error(error?.message || "Download failed"); return; }
    downloadBlob(data, name);
    await logAudit("backup_downloaded", { filename: name });
  };

  const deleteStored = async (meta: BackupMeta) => {
    if (!confirm(`Permanently delete "${meta.filename}" (v${meta.version})? This cannot be undone.`)) return;
    const { error } = await supabase.storage.from("backups").remove([meta.filename]);
    if (error) { toast.error(error.message); return; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from("backup_files" as any) as any).delete().eq("id", meta.id);
    await logAudit("backup_deleted", { filename: meta.filename, version: meta.version });
    toast.success("Backup deleted");
    refresh();
  };

  const uploadFile = async (file: File) => {
    if (file.size > MAX_UPLOAD_BYTES) { toast.error("File exceeds 50 MB limit"); return; }
    setUploading(true);
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const stored = `uploaded-${Date.now()}-${safeName}`;
    const { error } = await supabase.storage.from("backups").upload(stored, file, { upsert: false });
    if (error) { setUploading(false); toast.error(error.message); return; }

    // Best-effort metadata extraction
    let tables: string[] = [];
    let row_count = 0;
    try {
      const fmt = detectFormatFromName(file.name);
      if (fmt === "json") {
        const text = await file.text();
        const parsed = JSON.parse(text);
        if (isValidEnvelope(parsed)) {
          tables = Object.keys(parsed.tables);
          row_count = Object.values(parsed.tables).reduce((s, r) => s + (r?.length ?? 0), 0);
        }
      } else if (fmt === "xlsx") {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        tables = wb.SheetNames.filter((n) => n !== "_meta");
        row_count = tables.reduce((s, n) => s + ((XLSX.utils.sheet_to_json(wb.Sheets[n]) as unknown[]).length), 0);
      }
    } catch { /* ignore parse errors here */ }

    await recordMeta({
      filename: stored,
      format: detectFormatFromName(file.name),
      source: "uploaded",
      tables,
      row_count,
      size_bytes: file.size,
    });
    await logAudit("backup_uploaded", { filename: stored, size: file.size, tables: tables.length, rows: row_count });
    setUploading(false);
    toast.success("File uploaded");
    refresh();
  };

  // ----------------------------------------------------------------- restore

  const parseEnvelopeFromBlob = async (blob: Blob, filename: string): Promise<BackupEnvelope> => {
    const lower = filename.toLowerCase();
    if (lower.endsWith(".json")) {
      const text = await blob.text();
      let parsed: unknown;
      try { parsed = JSON.parse(text); } catch { throw new Error("File is not valid JSON"); }
      if (!isValidEnvelope(parsed)) throw new Error("JSON does not match backup format");
      if (parsed.schema_version !== SCHEMA_VERSION) {
        throw new Error(`Unsupported schema_version ${parsed.schema_version}; expected ${SCHEMA_VERSION}`);
      }
      return parsed;
    }
    if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
      const buf = await blob.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const tables: BackupEnvelope["tables"] = {};
      for (const sheet of wb.SheetNames) {
        if (sheet === "_meta") continue;
        if (!BACKUP_TABLES.includes(sheet as BackupTable)) {
          throw new Error(`Workbook contains unsupported sheet "${sheet}"`);
        }
        tables[sheet as BackupTable] = XLSX.utils.sheet_to_json(wb.Sheets[sheet]) as Record<string, unknown>[];
      }
      if (Object.keys(tables).length === 0) throw new Error("Workbook has no restorable sheets");
      return { schema_version: SCHEMA_VERSION, generated_at: new Date().toISOString(), app: "admin-backup", tables };
    }
    throw new Error("Only JSON or XLSX backups can be restored");
  };

  const onUploadInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; e.target.value = "";
    if (file) await uploadFile(file);
  };

  const beginRestoreFromStored = async (meta: BackupMeta) => {
    setRestoreErr("");
    if (!(meta.format === "json" || meta.format === "xlsx")) {
      toast.error("Only JSON or XLSX backups can be restored"); return;
    }
    const { data, error } = await supabase.storage.from("backups").download(meta.filename);
    if (error || !data) { toast.error(error?.message || "Download failed"); return; }
    try {
      const env = await parseEnvelopeFromBlob(data, meta.filename);
      setPendingEnvelope(env);
      setPendingSource(`v${meta.version} · ${meta.filename}`);
      setConfirmText(""); setRestoreOpen(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Invalid backup file";
      toast.error(msg);
      await logAudit("backup_restore_validation_failed", { filename: meta.filename, error: msg });
    }
  };

  const beginRestoreFromLocal = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setRestoreErr("");
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) { toast.error("File exceeds 50 MB limit"); return; }
    try {
      const env = await parseEnvelopeFromBlob(file, file.name);
      setPendingEnvelope(env); setPendingSource(file.name);
      setConfirmText(""); setRestoreOpen(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Invalid backup file";
      toast.error(msg);
      await logAudit("backup_restore_validation_failed", { filename: file.name, error: msg });
    }
  };

  const runRestore = async () => {
    if (!pendingEnvelope) return;
    setRestoring(true); setRestoreErr("");
    const env = pendingEnvelope;
    const results: { table: BackupTable; rows: number; ok: boolean; error?: string }[] = [];
    try {
      for (const t of RESTORE_ORDER) {
        const rows = env.tables[t];
        if (!rows || rows.length === 0) continue;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase.from(t as any) as any).upsert(rows, { onConflict: "id" });
        if (error) { results.push({ table: t, rows: rows.length, ok: false, error: error.message }); throw new Error(`${t}: ${error.message}`); }
        results.push({ table: t, rows: rows.length, ok: true });
      }
      await logAudit("backup_restored", { source: pendingSource, results });
      toast.success(`Restore complete (${results.reduce((s, r) => s + r.rows, 0)} rows merged)`);
      setRestoreOpen(false); setPendingEnvelope(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Restore failed";
      setRestoreErr(msg);
      await logAudit("backup_restore_failed", { source: pendingSource, error: msg, results });
      toast.error(msg);
    } finally { setRestoring(false); }
  };

  const envelopeStats = pendingEnvelope
    ? Object.entries(pendingEnvelope.tables).map(([t, rows]) => ({ table: t, rows: rows?.length ?? 0 }))
    : [];
  const envelopeTotal = envelopeStats.reduce((s, r) => s + r.rows, 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Database className="h-5 w-5 text-primary" />
          <CardTitle>Backup &amp; Recovery</CardTitle>
        </div>
        <CardDescription>
          Generate, download, upload and restore versioned system backups. All actions and metadata
          are recorded in the audit log.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* generate */}
        <div className="rounded-lg border p-4 space-y-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <h3 className="font-medium">Create a new backup</h3>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Format</Label>
              <Select value={format} onValueChange={(v) => setFormat(v as Format)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FORMATS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {format === "csv" && (
              <div className="space-y-1.5">
                <Label>Table</Label>
                <Select value={csvTable} onValueChange={(v) => setCsvTable(v as BackupTable)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BACKUP_TABLES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            JSON and Excel produce a full, restorable backup of all core tables. CSV exports a single
            table for analysis (download only — cannot be restored).
          </p>
          <Button onClick={generate} disabled={generating}>
            <Download className="h-4 w-4 mr-2" />
            {generating ? "Generating…" : "Generate backup"}
          </Button>
        </div>

        {/* upload */}
        <div className="rounded-lg border p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Upload className="h-4 w-4 text-primary" />
            <h3 className="font-medium">Upload a backup file</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            Upload a previously generated <code>.json</code> or <code>.xlsx</code> backup. Max 50 MB.
            Uploads are validated and never overwrite existing data without explicit confirmation.
          </p>
          <div className="flex flex-wrap gap-2">
            <Input
              ref={fileRef}
              type="file"
              accept=".json,application/json,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={onUploadInput}
              disabled={uploading}
              className="max-w-sm"
            />
            <Button variant="secondary" onClick={() => document.getElementById("restore-local-input")?.click()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Validate &amp; Restore from device
            </Button>
            <input
              id="restore-local-input" type="file" accept=".json,.xlsx,.xls"
              className="hidden" onChange={beginRestoreFromLocal}
            />
          </div>
        </div>

        {/* stored versions */}
        <div className="rounded-lg border">
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b">
            <div>
              <h3 className="font-medium">Backup versions</h3>
              <p className="text-xs text-muted-foreground">
                {visible.length} of {stats.count} · {formatBytes(stats.bytes)} total
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={refresh} disabled={loadingFiles}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loadingFiles ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>

          {/* filters */}
          <div className="flex flex-wrap items-end gap-3 p-3 border-b bg-muted/20">
            <div className="space-y-1 flex-1 min-w-[200px]">
              <Label className="text-xs">Search</Label>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="filename, admin, table…"
                  className="pl-8 h-9"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Format</Label>
              <Select value={filterFormat} onValueChange={(v) => setFilterFormat(v as typeof filterFormat)}>
                <SelectTrigger className="h-9 w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All formats</SelectItem>
                  <SelectItem value="json">JSON</SelectItem>
                  <SelectItem value="xlsx">Excel</SelectItem>
                  <SelectItem value="csv">CSV</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Source</Label>
              <Select value={filterSource} onValueChange={(v) => setFilterSource(v as typeof filterSource)}>
                <SelectTrigger className="h-9 w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All sources</SelectItem>
                  <SelectItem value="generated">Generated</SelectItem>
                  <SelectItem value="uploaded">Uploaded</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(search || filterFormat !== "all" || filterSource !== "all") && (
              <Button
                variant="ghost" size="sm"
                onClick={() => { setSearch(""); setFilterFormat("all"); setFilterSource("all"); }}
              >Clear</Button>
            )}
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("version")}>v<SortIcon k="version" /></TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("filename")}>Name<SortIcon k="filename" /></TableHead>
                  <TableHead>Format</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Tables</TableHead>
                  <TableHead className="cursor-pointer select-none text-right" onClick={() => toggleSort("row_count")}>Rows<SortIcon k="row_count" /></TableHead>
                  <TableHead className="cursor-pointer select-none text-right" onClick={() => toggleSort("size_bytes")}>Size<SortIcon k="size_bytes" /></TableHead>
                  <TableHead>Admin</TableHead>
                  <TableHead className="cursor-pointer select-none whitespace-nowrap" onClick={() => toggleSort("created_at")}>Created<SortIcon k="created_at" /></TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingFiles ? (
                  <TableRow><TableCell colSpan={10} className="text-center py-6 text-muted-foreground">Loading…</TableCell></TableRow>
                ) : visible.length === 0 ? (
                  <TableRow><TableCell colSpan={10} className="text-center py-6 text-muted-foreground">No backup versions match the current filters.</TableCell></TableRow>
                ) : visible.map((f) => {
                  const restorable = f.format === "json" || f.format === "xlsx";
                  return (
                    <TableRow key={f.id}>
                      <TableCell className="font-mono text-xs">v{f.version}</TableCell>
                      <TableCell className="font-mono text-xs max-w-[18rem] truncate" title={f.filename}>{f.filename}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`uppercase ${FORMAT_TONE[f.format]}`}>{f.format}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={f.source === "generated" ? "default" : "secondary"} className="capitalize">{f.source}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[14rem] truncate" title={(f.tables ?? []).join(", ") || "—"}>
                        {(f.tables ?? []).length > 0 ? `${f.tables.length} · ${f.tables.slice(0, 2).join(", ")}${f.tables.length > 2 ? "…" : ""}` : "—"}
                      </TableCell>
                      <TableCell className="text-right text-xs">{f.row_count.toLocaleString()}</TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">{formatBytes(f.size_bytes)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground truncate max-w-[12rem]" title={f.created_by_email ?? ""}>
                        {f.created_by_email ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(f.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button variant="ghost" size="sm" onClick={() => downloadStored(f.filename)} title="Download">
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost" size="sm"
                          disabled={!restorable}
                          title={restorable ? "Validate & restore" : "Only JSON or XLSX can be restored"}
                          onClick={() => beginRestoreFromStored(f)}
                        >
                          <RefreshCw className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" className="text-destructive" onClick={() => deleteStored(f)} title="Delete">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      </CardContent>

      {/* restore dialog */}
      <AlertDialog open={restoreOpen} onOpenChange={(o) => !restoring && setRestoreOpen(o)}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Restore from backup
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <p>
                  This will merge <strong>{envelopeTotal}</strong> rows from{" "}
                  <code className="text-xs">{pendingSource}</code> into the live database.
                  Existing rows with the same ID will be <strong>overwritten</strong>.
                  Rows that exist only in the database (but not in the backup) are kept.
                </p>
                {pendingEnvelope && (
                  <div className="rounded-md border bg-muted/40 max-h-48 overflow-y-auto text-xs">
                    <table className="w-full">
                      <tbody>
                        {envelopeStats.map((r) => (
                          <tr key={r.table} className="border-b last:border-0">
                            <td className="px-2 py-1 font-mono">{r.table}</td>
                            <td className="px-2 py-1 text-right text-muted-foreground">{r.rows} rows</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label className="text-xs">Type <code>RESTORE</code> to confirm:</Label>
                  <Input
                    value={confirmText} onChange={(e) => setConfirmText(e.target.value)}
                    placeholder="RESTORE" autoFocus
                  />
                </div>
                {restoreErr && <p className="text-destructive text-xs">{restoreErr}</p>}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={restoring}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={restoring || confirmText !== "RESTORE"}
              onClick={(e) => { e.preventDefault(); runRestore(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {restoring ? "Restoring…" : "Confirm restore"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
