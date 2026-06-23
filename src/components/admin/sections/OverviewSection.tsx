import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { StatCard } from "../StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Users, UserCheck, ClipboardList, Trophy, Camera, AlertTriangle, Activity, Clock,
  Building2, Network, ListChecks, CheckCircle2, Radio, Download, ArrowUpRight, RefreshCw,
} from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { downloadCSV } from "@/lib/csv";
import { usePresenceWatcher } from "@/hooks/usePresence";
import { SystemCheckButton } from "../SystemCheckButton";

type Gender = "male" | "female" | "other" | "prefer_not_to_say";
const GENDER_LABEL: Record<Gender, string> = {
  male: "Male", female: "Female", other: "Other", prefer_not_to_say: "Prefer not to say",
};
const GENDER_COLORS: Record<Gender, string> = {
  male: "hsl(var(--info))",
  female: "hsl(var(--pink))",
  other: "hsl(var(--violet))",
  prefer_not_to_say: "hsl(var(--muted-foreground))",
};

interface KpiSpec {
  label: string; value: string | number; icon: any; tone: any; hint?: string; drill?: string;
}

export function OverviewSection() {
  const [stats, setStats] = useState({
    total: 0, pending: 0, approved: 0, suspended: 0,
    attempts: 0, attemptsToday: 0, avgScore: 0, passRate: 0,
    proctorFail: 0, expired: 0,
    orgs: 0, depts: 0, questions: 0, completed: 0, pendingQs: 0,
  });
  const [statusBreak, setStatusBreak] = useState<{ status: string; count: number }[]>([]);
  const [recent, setRecent] = useState<any[]>([]);
  const [trend, setTrend] = useState<{ day: string; attempts: number; completed: number }[]>([]);
  const [genderCounts, setGenderCounts] = useState<Record<Gender, number>>({
    male: 0, female: 0, other: 0, prefer_not_to_say: 0,
  });
  const online = usePresenceWatcher();
  const reloadTimer = useRef<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const loadAll = useCallback(async () => {
    const since14 = new Date(Date.now() - 13 * 24 * 60 * 60 * 1000); since14.setHours(0, 0, 0, 0);

    const [apps, atts, snaps, logins, orgs, depts, qs, results] = await Promise.all([
      supabase.from("applicants").select("status, link_expires_at"),
      supabase.from("test_attempts").select("percentage, passed, submitted_at, started_at"),
      supabase.from("proctoring_snapshots").select("auto_verdict, admin_verdict"),
      supabase.from("login_activity").select("*").order("created_at", { ascending: false }).limit(8),
      supabase.from("organizations").select("id", { count: "exact", head: true }),
      supabase.from("departments").select("id", { count: "exact", head: true }),
      supabase.from("questions").select("approval_status"),
      supabase.from("test_results").select("completed_at, applicant_gender").gte("completed_at", since14.toISOString()),
    ]);

    const a = apps.data ?? [];
    const t = atts.data ?? [];
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const completedAtt = t.filter((x: any) => x.submitted_at);
    const passed = completedAtt.filter((x: any) => x.passed).length;
    const sumPct = completedAtt.reduce((acc: number, x: any) => acc + Number(x.percentage || 0), 0);
    const qrows = qs.data ?? [];

    setStats({
      total: a.length,
      pending: a.filter((x: any) => x.status === "pending").length,
      approved: a.filter((x: any) => x.status === "approved").length,
      suspended: a.filter((x: any) => x.status === "suspended" || x.status === "rejected").length,
      attempts: t.length,
      attemptsToday: t.filter((x: any) => new Date(x.started_at) >= today).length,
      avgScore: completedAtt.length ? Math.round(sumPct / completedAtt.length) : 0,
      passRate: completedAtt.length ? Math.round((passed / completedAtt.length) * 100) : 0,
      proctorFail: (snaps.data ?? []).filter((s: any) => s.auto_verdict === "fail" || s.admin_verdict === "no_match").length,
      expired: a.filter((x: any) => x.link_expires_at && new Date(x.link_expires_at) > new Date()).length,
      orgs: orgs.count ?? 0,
      depts: depts.count ?? 0,
      questions: qrows.length,
      pendingQs: qrows.filter((q: any) => q.approval_status === "pending").length,
      completed: completedAtt.length,
    });

    setStatusBreak(["pending", "approved", "rejected", "suspended"].map((s) => ({
      status: s, count: a.filter((x: any) => x.status === s).length,
    })));
    setRecent(logins.data ?? []);

    const days: { day: string; key: string; attempts: number; completed: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
      days.push({
        day: d.toLocaleDateString([], { month: "short", day: "numeric" }),
        key: d.toISOString().slice(0, 10),
        attempts: 0, completed: 0,
      });
    }
    const byDay = new Map(days.map((d) => [d.key, d]));
    (results.data ?? []).forEach((r: any) => {
      const row = byDay.get(String(r.completed_at).slice(0, 10));
      if (row) row.completed += 1;
    });
    (t ?? []).forEach((r: any) => {
      const row = byDay.get(String(r.started_at).slice(0, 10));
      if (row) row.attempts += 1;
    });
    setTrend(days.map(({ day, attempts, completed }) => ({ day, attempts, completed })));

    const g: Record<Gender, number> = { male: 0, female: 0, other: 0, prefer_not_to_say: 0 };
    (results.data ?? []).forEach((r: any) => {
      const k = r.applicant_gender as Gender | null;
      if (k && k in g) g[k] += 1;
    });
    setGenderCounts(g);
    setLastRefresh(new Date());
  }, []);

  const handleManualRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await loadAll(); } finally { setRefreshing(false); }
  }, [loadAll]);


  // Realtime: debounce reloads triggered by any change to dashboard-relevant tables.
  const scheduleReload = useCallback(() => {
    if (reloadTimer.current) window.clearTimeout(reloadTimer.current);
    reloadTimer.current = window.setTimeout(() => { void loadAll(); }, 600);
  }, [loadAll]);

  useEffect(() => {
    void loadAll();
    const tables = [
      "login_activity", "test_attempts", "test_results", "applicants",
      "proctoring_snapshots", "questions", "admin_audit_log",
    ];
    const channel = supabase.channel("admin-overview-feed");
    tables.forEach((tbl) => {
      channel.on("postgres_changes", { event: "*", schema: "public", table: tbl }, scheduleReload);
    });
    channel.subscribe();
    return () => {
      if (reloadTimer.current) window.clearTimeout(reloadTimer.current);
      supabase.removeChannel(channel);
    };
  }, [loadAll, scheduleReload]);

  const genderTotal = useMemo(
    () => Object.values(genderCounts).reduce((a, b) => a + b, 0),
    [genderCounts],
  );
  const genderData = useMemo(
    () => (Object.keys(genderCounts) as Gender[])
      .map((k) => ({ name: GENDER_LABEL[k], key: k, value: genderCounts[k] }))
      .filter((d) => d.value > 0),
    [genderCounts],
  );

  const maxBucket = Math.max(1, ...statusBreak.map((s) => s.count));
  const statusBg: Record<string, string> = {
    pending: "bg-warning", approved: "bg-success", rejected: "bg-destructive", suspended: "bg-muted-foreground",
  };

  const kpis: KpiSpec[] = [
    { label: "Total Users", value: stats.total, icon: Users, tone: "primary", drill: "users" },
    { label: "Organizations", value: stats.orgs, icon: Building2, tone: "info", drill: "organizations" },
    { label: "Departments", value: stats.depts, icon: Network, tone: "teal", drill: "departments" },
    { label: "Questions", value: stats.questions, icon: ListChecks, tone: "violet", hint: `${stats.pendingQs} pending approval`, drill: "questions" },
    { label: "Pending Approvals", value: stats.pending, icon: UserCheck, tone: "warning", drill: "users?status=pending" },
    { label: "Attempts Today", value: stats.attemptsToday, icon: ClipboardList, tone: "info", hint: `${stats.attempts} all-time`, drill: "attempts?range=today" },
    { label: "Completed Tests", value: stats.completed, icon: CheckCircle2, tone: "success", hint: `Pass rate ${stats.passRate}%`, drill: "attempts?status=completed" },
    { label: "Avg Score", value: `${stats.avgScore}%`, icon: Trophy, tone: "teal", drill: "attempts?status=completed" },
    { label: "Proctor Flags", value: stats.proctorFail, icon: Camera, tone: "violet", drill: "proctor?verdict=fail" },
    { label: "Expired Links", value: stats.expired, icon: AlertTriangle, tone: "pink", drill: "users?lock=expired" },
    { label: "Approved", value: stats.approved, icon: UserCheck, tone: "success", drill: "users?status=approved" },
    { label: "Suspended / Rejected", value: stats.suspended, icon: AlertTriangle, tone: "destructive", drill: "users?status=suspended" },
  ];

  const exportKpis = () => {
    downloadCSV(`kpis-${new Date().toISOString().slice(0, 10)}`, kpis.map((k) => ({
      metric: k.label, value: k.value, hint: k.hint ?? "",
    })));
  };
  const exportTrend = () => {
    downloadCSV(`usage-trend-${new Date().toISOString().slice(0, 10)}`, trend);
  };
  const exportRecent = () => {
    downloadCSV(`recent-activity-${new Date().toISOString().slice(0, 10)}`, recent.map((r) => ({
      time: r.created_at, event: r.event, email: r.email ?? "", ip: r.ip ?? "", user_agent: r.user_agent ?? "",
    })));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Analytics Dashboard</h2>
          <p className="text-sm text-muted-foreground">Live overview of platform activity, users, and tests.</p>
        </div>
        <div className="flex items-center gap-2">
          <SystemCheckButton />
          <Button
            size="sm"
            variant="outline"
            onClick={handleManualRefresh}
            disabled={refreshing}
            title={`Last updated ${lastRefresh.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`}
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Refreshing…" : "Refresh"}
          </Button>
          <Button size="sm" variant="outline" onClick={exportKpis}>
            <Download className="h-3.5 w-3.5 mr-1.5" /> Export KPIs
          </Button>
          <div className="flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-sm shadow-sm">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-success opacity-75 animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
            </span>
            <Radio className="h-3.5 w-3.5 text-success" />
            <span className="font-semibold">{online.total}</span>
            <span className="text-muted-foreground">online now</span>
            <Badge variant="outline" className="text-[10px]">{online.admins} admin · {online.applicants} applicant</Badge>
          </div>
        </div>
      </div>

      {/* KPI grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => {
          const card = <StatCard label={k.label} value={k.value} icon={k.icon} tone={k.tone} hint={k.hint} />;
          return k.drill ? (
            <Link key={k.label} to={`/admin/drilldown/${k.drill}`} className="block focus:outline-none focus:ring-2 focus:ring-ring rounded-xl">
              {card}
            </Link>
          ) : <div key={k.label}>{card}</div>;
        })}
      </div>

      {/* Trend + Gender */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Usage trend · last 14 days</CardTitle>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={exportTrend}>
                <Download className="h-3.5 w-3.5 mr-1.5" /> CSV
              </Button>
              <Button size="sm" variant="ghost" asChild>
                <Link to="/admin/drilldown/attempts">
                  Drilldown <ArrowUpRight className="h-3.5 w-3.5 ml-1" />
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="gAtt" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gDone" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--teal))" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="hsl(var(--teal))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, color: "hsl(var(--foreground))" }} />
                <Area type="monotone" dataKey="attempts" name="Attempts" stroke="hsl(var(--primary))" fill="url(#gAtt)" strokeWidth={2} />
                <Area type="monotone" dataKey="completed" name="Completed" stroke="hsl(var(--teal))" fill="url(#gDone)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Gender distribution</CardTitle>
              <p className="text-xs text-muted-foreground">From completed tests in the last 14 days</p>
            </div>
            <Button size="sm" variant="ghost" asChild>
              <Link to="/admin/drilldown/results"><ArrowUpRight className="h-3.5 w-3.5" /></Link>
            </Button>
          </CardHeader>
          <CardContent className="h-72">
            {genderTotal === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                No gender data yet.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={genderData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                    {genderData.map((d) => (
                      <Cell key={d.key} fill={GENDER_COLORS[d.key as Gender]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v: any, n: any) => [`${v} (${Math.round((Number(v) / genderTotal) * 100)}%)`, n]}
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, color: "hsl(var(--foreground))" }}
                  />
                  <Legend verticalAlign="bottom" height={28} iconSize={10} formatter={(v) => <span className="text-xs text-muted-foreground">{v}</span>} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Status + Recent logins */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Applicant status breakdown</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {statusBreak.map((b) => (
              <Link key={b.status} to={`/admin/drilldown/users?status=${b.status}`} className="block group">
                <div className="flex justify-between text-sm mb-1">
                  <span className="capitalize group-hover:text-primary transition-colors">{b.status}</span>
                  <span className="font-medium">{b.count}</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div className={`h-full ${statusBg[b.status]}`} style={{ width: `${(b.count / maxBucket) * 100}%` }} />
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4 text-info" /> Recent login activity
            </CardTitle>
            <Button size="sm" variant="ghost" onClick={exportRecent}>
              <Download className="h-3.5 w-3.5 mr-1.5" /> CSV
            </Button>
          </CardHeader>
          <CardContent>
            {recent.length === 0 ? (
              <p className="text-sm text-muted-foreground">No login events recorded yet.</p>
            ) : (
              <ul className="space-y-2.5">
                {recent.map((r) => (
                  <li key={r.id} className="flex items-start justify-between gap-2 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{r.email ?? "—"}</p>
                      <p className="text-xs text-muted-foreground capitalize">{r.event.replace(/_/g, " ")} · {r.ip ?? "unknown IP"}</p>
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(r.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
