import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Download, Search } from "lucide-react";
import { downloadCSV } from "@/lib/csv";

type DrilldownType =
  | "users" | "attempts" | "results" | "questions"
  | "organizations" | "departments" | "proctor" | "logins" | "audit";

interface Column { key: string; label: string; render?: (row: any) => React.ReactNode }

interface Spec {
  title: string;
  table: string;
  select: string;
  order: { column: string; ascending: boolean };
  columns: Column[];
  searchFields?: string[];
  applyFilters?: (q: any, params: URLSearchParams) => any;
  postFilter?: (rows: any[], params: URLSearchParams) => any[];
}

const fmt = (d?: string | null) => (d ? new Date(d).toLocaleString() : "—");

const SPECS: Record<DrilldownType, Spec> = {
  users: {
    title: "Users / Applicants",
    table: "applicants",
    select: "id, name, email, status, attempts_used, link_expires_at, gender, organization_id, department_id, created_at",
    order: { column: "created_at", ascending: false },
    columns: [
      { key: "name", label: "Name" },
      { key: "email", label: "Email" },
      { key: "status", label: "Status", render: (r) => <Badge variant="outline" className="capitalize">{r.status}</Badge> },
      { key: "attempts_used", label: "Attempts" },
      { key: "gender", label: "Gender" },
      { key: "link_expires_at", label: "Link expires", render: (r) => fmt(r.link_expires_at) },
      { key: "created_at", label: "Created", render: (r) => fmt(r.created_at) },
    ],
    searchFields: ["name", "email"],
    applyFilters: (q, p) => {
      const status = p.get("status");
      if (status) q = q.eq("status", status);
      return q;
    },
    postFilter: (rows, p) => {
      if (p.get("lock") === "expired") {
        const now = Date.now();
        return rows.filter((r) => r.link_expires_at && new Date(r.link_expires_at).getTime() > now);
      }
      return rows;
    },
  },
  attempts: {
    title: "Test Attempts",
    table: "test_attempts",
    select: "id, applicant_id, started_at, submitted_at, percentage, passed, score, total_questions",
    order: { column: "started_at", ascending: false },
    columns: [
      { key: "applicant_id", label: "Applicant" },
      { key: "started_at", label: "Started", render: (r) => fmt(r.started_at) },
      { key: "submitted_at", label: "Submitted", render: (r) => fmt(r.submitted_at) },
      { key: "score", label: "Score" },
      { key: "total_questions", label: "Total" },
      { key: "percentage", label: "%" },
      { key: "passed", label: "Passed", render: (r) => r.passed ? "✅" : (r.submitted_at ? "❌" : "—") },
    ],
    applyFilters: (q, p) => {
      const status = p.get("status");
      if (status === "completed") q = q.not("submitted_at", "is", null);
      if (status === "in_progress") q = q.is("submitted_at", null);
      const range = p.get("range");
      if (range === "today") {
        const d = new Date(); d.setHours(0, 0, 0, 0);
        q = q.gte("started_at", d.toISOString());
      }
      return q;
    },
  },
  results: {
    title: "Test Results",
    table: "test_results",
    select: "id, applicant_email, applicant_name, percentage, passed, applicant_gender, created_at",
    order: { column: "created_at", ascending: false },
    columns: [
      { key: "applicant_name", label: "Name" },
      { key: "applicant_email", label: "Email" },
      { key: "applicant_gender", label: "Gender" },
      { key: "percentage", label: "%" },
      { key: "passed", label: "Passed", render: (r) => r.passed ? "✅" : "❌" },
      { key: "created_at", label: "Completed", render: (r) => fmt(r.created_at) },
    ],
    searchFields: ["applicant_name", "applicant_email"],
    applyFilters: (q, p) => {
      const g = p.get("gender");
      if (g) q = q.eq("applicant_gender", g);
      return q;
    },
  },
  questions: {
    title: "Questions",
    table: "questions",
    select: "id, question_text, question_type, approval_status, category_id, created_at",
    order: { column: "created_at", ascending: false },
    columns: [
      { key: "question_text", label: "Question" },
      { key: "question_type", label: "Type" },
      { key: "approval_status", label: "Status", render: (r) => <Badge variant="outline" className="capitalize">{r.approval_status}</Badge> },
      { key: "created_at", label: "Created", render: (r) => fmt(r.created_at) },
    ],
    searchFields: ["question_text"],
    applyFilters: (q, p) => {
      const s = p.get("status");
      if (s) q = q.eq("approval_status", s);
      return q;
    },
  },
  organizations: {
    title: "Organizations",
    table: "organizations",
    select: "id, name, code, created_at",
    order: { column: "created_at", ascending: false },
    columns: [
      { key: "name", label: "Name" },
      { key: "code", label: "Code" },
      { key: "created_at", label: "Created", render: (r) => fmt(r.created_at) },
    ],
    searchFields: ["name", "code"],
  },
  departments: {
    title: "Departments",
    table: "departments",
    select: "id, name, code, organization_id, created_at",
    order: { column: "created_at", ascending: false },
    columns: [
      { key: "name", label: "Name" },
      { key: "code", label: "Code" },
      { key: "organization_id", label: "Organization" },
      { key: "created_at", label: "Created", render: (r) => fmt(r.created_at) },
    ],
    searchFields: ["name", "code"],
  },
  proctor: {
    title: "Proctor Events",
    table: "proctoring_snapshots",
    select: "id, applicant_id, auto_verdict, admin_verdict, confidence, created_at",
    order: { column: "created_at", ascending: false },
    columns: [
      { key: "applicant_id", label: "Applicant" },
      { key: "auto_verdict", label: "Auto", render: (r) => <Badge variant="outline">{r.auto_verdict ?? "—"}</Badge> },
      { key: "admin_verdict", label: "Admin", render: (r) => <Badge variant="outline">{r.admin_verdict ?? "—"}</Badge> },
      { key: "confidence", label: "Confidence" },
      { key: "created_at", label: "When", render: (r) => fmt(r.created_at) },
    ],
    applyFilters: (q, p) => {
      const v = p.get("verdict");
      if (v === "fail") q = q.or("auto_verdict.eq.fail,admin_verdict.eq.no_match");
      return q;
    },
  },
  logins: {
    title: "Login Activity",
    table: "login_activity",
    select: "id, email, event, ip, user_agent, created_at",
    order: { column: "created_at", ascending: false },
    columns: [
      { key: "email", label: "Email" },
      { key: "event", label: "Event" },
      { key: "ip", label: "IP" },
      { key: "user_agent", label: "User agent" },
      { key: "created_at", label: "When", render: (r) => fmt(r.created_at) },
    ],
    searchFields: ["email", "ip"],
  },
  audit: {
    title: "Admin Audit Log",
    table: "admin_audit_log",
    select: "id, admin_email, action, applicant_id, ip, created_at",
    order: { column: "created_at", ascending: false },
    columns: [
      { key: "admin_email", label: "Admin" },
      { key: "action", label: "Action" },
      { key: "applicant_id", label: "Applicant" },
      { key: "ip", label: "IP" },
      { key: "created_at", label: "When", render: (r) => fmt(r.created_at) },
    ],
    searchFields: ["admin_email", "action"],
  },
};

const AdminDrilldown = () => {
  const { type } = useParams<{ type: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [authOk, setAuthOk] = useState<boolean | null>(null);
  const [query, setQuery] = useState("");

  const spec = (type && (SPECS as any)[type]) as Spec | undefined;

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setAuthOk(false); return; }
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", session.user.id).eq("role", "admin").maybeSingle();
      setAuthOk(!!data);
    })();
  }, []);

  useEffect(() => {
    if (!spec || !authOk) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      let q: any = (supabase.from as any)(spec.table).select(spec.select).order(spec.order.column, { ascending: spec.order.ascending }).limit(1000);
      if (spec.applyFilters) q = spec.applyFilters(q, params);
      const { data } = await q;
      if (cancelled) return;
      let result = (data ?? []) as any[];
      if (spec.postFilter) result = spec.postFilter(result, params);
      setRows(result);
      setLoading(false);
    };
    void load();
    // Realtime: refresh when the underlying table changes.
    const channel = supabase
      .channel(`drilldown-${spec.table}`)
      .on("postgres_changes", { event: "*", schema: "public", table: spec.table }, () => { void load(); })
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [spec, params, authOk]);

  const filtered = useMemo(() => {
    if (!query.trim() || !spec?.searchFields) return rows;
    const needle = query.trim().toLowerCase();
    return rows.filter((r) => spec.searchFields!.some((f) => String(r[f] ?? "").toLowerCase().includes(needle)));
  }, [rows, query, spec]);

  if (authOk === false) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="max-w-md w-full">
          <CardHeader><CardTitle>Admin sign-in required</CardTitle></CardHeader>
          <CardContent>
            <Button onClick={() => navigate("/admin")}>Go to admin</Button>
          </CardContent>
        </Card>
      </div>
    );
  }
  if (!spec) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="max-w-md w-full">
          <CardHeader><CardTitle>Unknown drilldown</CardTitle></CardHeader>
          <CardContent>
            <Button asChild><Link to="/admin">Back to dashboard</Link></Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const exportRows = () => {
    const data = filtered.map((r) => {
      const o: Record<string, unknown> = {};
      spec.columns.forEach((c) => { o[c.label] = r[c.key]; });
      return o;
    });
    downloadCSV(`${spec.table}-${new Date().toISOString().slice(0, 10)}`, data, spec.columns.map((c) => c.label));
  };

  const activeFilters = Array.from(params.entries());

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/admin"><ArrowLeft className="h-4 w-4 mr-1" /> Back</Link>
            </Button>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{spec.title}</h1>
              <p className="text-xs text-muted-foreground">
                {loading ? "Loading…" : `${filtered.length} row${filtered.length === 1 ? "" : "s"}`}
                {activeFilters.length > 0 && " · "}
                {activeFilters.map(([k, v]) => (
                  <span key={k} className="ml-1 inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px]">
                    {k}={v}
                  </span>
                ))}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {spec.searchFields && (
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  className="pl-8 h-9 w-56"
                  placeholder={`Search ${spec.searchFields.join(", ")}`}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
            )}
            <Button size="sm" onClick={exportRows}>
              <Download className="h-3.5 w-3.5 mr-1.5" /> Export CSV
            </Button>
          </div>
        </div>

        <Card>
          <CardContent className="p-0 overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  {spec.columns.map((c) => (
                    <th key={c.key} className="text-left px-4 py-2 font-medium">{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && !loading ? (
                  <tr><td colSpan={spec.columns.length} className="text-center py-12 text-muted-foreground">No rows match these filters.</td></tr>
                ) : filtered.map((r) => (
                  <tr key={r.id} className="border-t hover:bg-muted/20">
                    {spec.columns.map((c) => (
                      <td key={c.key} className="px-4 py-2 max-w-xs truncate">
                        {c.render ? c.render(r) : String(r[c.key] ?? "—")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminDrilldown;
