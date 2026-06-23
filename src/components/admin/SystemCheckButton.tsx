import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, Loader2, CheckCircle2, XCircle, AlertTriangle, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Status = "pass" | "warn" | "fail";
interface CheckResult {
  name: string;
  status: Status;
  detail: string;
  count?: number;
}

const STATUS_META: Record<Status, { icon: any; color: string; label: string }> = {
  pass: { icon: CheckCircle2, color: "text-success", label: "Pass" },
  warn: { icon: AlertTriangle, color: "text-warning", label: "Warn" },
  fail: { icon: XCircle, color: "text-destructive", label: "Fail" },
};

export function SystemCheckButton() {
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<CheckResult[]>([]);
  const [ranAt, setRanAt] = useState<string | null>(null);

  const run = async () => {
    setRunning(true);
    setResults([]);
    const out: CheckResult[] = [];
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const since14d = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

    // 1. Login activity reachable
    try {
      const { data, error, count } = await supabase
        .from("login_activity")
        .select("id, event, created_at", { count: "exact" })
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      const recent24h = (data ?? []).filter((r: any) => r.created_at >= since24h).length;
      out.push({
        name: "Login activity feed",
        status: "pass",
        detail: `${count ?? 0} total events · ${recent24h} in last 24h`,
        count: count ?? 0,
      });
    } catch (e: any) {
      out.push({ name: "Login activity feed", status: "fail", detail: e.message ?? "Query failed" });
    }

    // 2. Login event integrity (non-null event, valid timestamps)
    try {
      const { data, error } = await supabase
        .from("login_activity")
        .select("id, event, created_at")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      const rows = data ?? [];
      const bad = rows.filter((r: any) => !r.event || !r.created_at || isNaN(Date.parse(r.created_at)));
      out.push({
        name: "Login event integrity",
        status: bad.length === 0 ? "pass" : "warn",
        detail: bad.length === 0
          ? `All ${rows.length} sampled events have valid event + timestamp`
          : `${bad.length} of ${rows.length} rows have missing/invalid fields`,
      });
    } catch (e: any) {
      out.push({ name: "Login event integrity", status: "fail", detail: e.message ?? "Query failed" });
    }

    // 3. Test results timestamps (completed_at)
    try {
      const { data, error, count } = await supabase
        .from("test_results")
        .select("id, completed_at", { count: "exact" })
        .order("completed_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      const rows = data ?? [];
      const bad = rows.filter((r: any) => !r.completed_at || isNaN(Date.parse(r.completed_at)));
      const future = rows.filter((r: any) => Date.parse(r.completed_at) > Date.now() + 60_000);
      let status: Status = "pass";
      let detail = `${count ?? 0} results · all timestamps valid`;
      if (bad.length > 0) { status = "fail"; detail = `${bad.length} rows missing/invalid completed_at`; }
      else if (future.length > 0) { status = "warn"; detail = `${future.length} rows have future timestamps`; }
      out.push({ name: "Test result timestamps", status, detail, count: count ?? 0 });
    } catch (e: any) {
      out.push({ name: "Test result timestamps", status: "fail", detail: e.message ?? "Query failed" });
    }

    // 4. Test attempts timestamps
    try {
      const { data, error, count } = await supabase
        .from("test_attempts")
        .select("id, started_at, submitted_at", { count: "exact" })
        .order("started_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      const rows = data ?? [];
      const bad = rows.filter((r: any) => !r.started_at || isNaN(Date.parse(r.started_at)));
      const inverted = rows.filter((r: any) =>
        r.submitted_at && Date.parse(r.submitted_at) < Date.parse(r.started_at));
      let status: Status = "pass";
      let detail = `${count ?? 0} attempts · timestamps consistent`;
      if (bad.length > 0) { status = "fail"; detail = `${bad.length} attempts missing started_at`; }
      else if (inverted.length > 0) { status = "warn"; detail = `${inverted.length} attempts submitted before start`; }
      out.push({ name: "Test attempt timestamps", status, detail, count: count ?? 0 });
    } catch (e: any) {
      out.push({ name: "Test attempt timestamps", status: "fail", detail: e.message ?? "Query failed" });
    }

    // 5. Dashboard aggregation parity
    try {
      const [apps, atts, results, logins, audit, snaps] = await Promise.all([
        supabase.from("applicants").select("id", { count: "exact", head: true }),
        supabase.from("test_attempts").select("id, submitted_at, passed, percentage").limit(1000),
        supabase.from("test_results").select("id, completed_at").gte("completed_at", since14d),
        supabase.from("login_activity").select("id", { count: "exact", head: true }),
        supabase.from("admin_audit_log").select("id", { count: "exact", head: true }),
        supabase.from("proctoring_snapshots").select("id", { count: "exact", head: true }),
      ]);
      const errs = [apps, atts, results, logins, audit, snaps]
        .map((r, i) => r.error ? `${["applicants","test_attempts","test_results","login_activity","admin_audit_log","proctoring_snapshots"][i]}: ${r.error.message}` : null)
        .filter(Boolean);
      if (errs.length > 0) {
        out.push({ name: "Dashboard aggregation", status: "fail", detail: errs.join(" · ") });
      } else {
        const completed = (atts.data ?? []).filter((x: any) => x.submitted_at).length;
        out.push({
          name: "Dashboard aggregation",
          status: "pass",
          detail: `applicants=${apps.count ?? 0} · attempts=${atts.data?.length ?? 0} (completed ${completed}) · results14d=${results.data?.length ?? 0} · logins=${logins.count ?? 0} · audit=${audit.count ?? 0} · snaps=${snaps.count ?? 0}`,
        });
      }
    } catch (e: any) {
      out.push({ name: "Dashboard aggregation", status: "fail", detail: e.message ?? "Query failed" });
    }

    // 6. Login <-> attempt cross-check (approx)
    try {
      const { data: recentLogins } = await supabase
        .from("login_activity")
        .select("email, event")
        .eq("event", "login_success")
        .gte("created_at", since14d)
        .limit(500);
      const emails = new Set((recentLogins ?? []).map((r: any) => (r.email || "").toLowerCase()).filter(Boolean));
      out.push({
        name: "Successful logins (14d)",
        status: emails.size === 0 ? "warn" : "pass",
        detail: emails.size === 0
          ? "No successful logins recorded in the last 14 days"
          : `${recentLogins?.length ?? 0} success events from ${emails.size} unique emails`,
      });
    } catch (e: any) {
      out.push({ name: "Successful logins (14d)", status: "fail", detail: e.message ?? "Query failed" });
    }

    setResults(out);
    setRanAt(new Date().toLocaleString());
    setRunning(false);
  };

  const openAndRun = () => {
    setOpen(true);
    if (!running) void run();
  };

  const summary = (() => {
    const pass = results.filter((r) => r.status === "pass").length;
    const warn = results.filter((r) => r.status === "warn").length;
    const fail = results.filter((r) => r.status === "fail").length;
    return { pass, warn, fail };
  })();

  return (
    <>
      <Button size="sm" variant="outline" onClick={openAndRun}>
        <ShieldCheck className="h-3.5 w-3.5 mr-1.5" /> System Check
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" /> Full System Check
            </DialogTitle>
            <DialogDescription>
              Validates login activity, test result timestamps, and dashboard data aggregation.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            {running && results.length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Running checks...
              </div>
            ) : (
              <>
                <div className="flex flex-wrap gap-2 pb-2">
                  <Badge variant="outline" className="text-success border-success/40">
                    <CheckCircle2 className="h-3 w-3 mr-1" /> {summary.pass} pass
                  </Badge>
                  <Badge variant="outline" className="text-warning border-warning/40">
                    <AlertTriangle className="h-3 w-3 mr-1" /> {summary.warn} warn
                  </Badge>
                  <Badge variant="outline" className="text-destructive border-destructive/40">
                    <XCircle className="h-3 w-3 mr-1" /> {summary.fail} fail
                  </Badge>
                  {ranAt && <span className="text-xs text-muted-foreground self-center ml-auto">Ran {ranAt}</span>}
                </div>
                <ul className="divide-y rounded-md border">
                  {results.map((r) => {
                    const Meta = STATUS_META[r.status];
                    const Icon = Meta.icon;
                    return (
                      <li key={r.name} className="flex items-start gap-3 p-3">
                        <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${Meta.color}`} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium">{r.name}</p>
                            <Badge variant="outline" className={`text-[10px] ${Meta.color}`}>{Meta.label}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground break-words">{r.detail}</p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
            <Button onClick={run} disabled={running}>
              {running ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
              Re-run
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
