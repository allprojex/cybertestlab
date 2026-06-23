import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search, ShieldCheck } from "lucide-react";

type AuditRow = {
  id: string;
  admin_email: string | null;
  admin_id: string;
  applicant_id: string | null;
  action: string;
  ip: string | null;
  user_agent: string | null;
  metadata: any;
  created_at: string;
  applicant?: { full_name: string; email: string } | null;
};

const ACTION_TONE: Record<string, string> = {
  approve: "bg-success/15 text-success border-success/30",
  approve_link: "bg-success/15 text-success border-success/30",
  regenerate_link: "bg-violet/15 text-violet border-violet/30",
  reset_attempts: "bg-info/15 text-info border-info/30",
  reject: "bg-destructive/15 text-destructive border-destructive/30",
  suspend: "bg-warning/15 text-warning border-warning/30",
  expire_link: "bg-pink/15 text-pink border-pink/30",
};

export function AuditLogSection() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("admin_audit_log" as any)
        .select("*, applicant:applicants(full_name,email)")
        .order("created_at", { ascending: false })
        .limit(500);
      setRows((data ?? []) as any);
      setLoading(false);
    })();
  }, []);

  const filtered = rows.filter((r) => {
    if (!q) return true;
    const s = q.toLowerCase();
    return (
      r.action.toLowerCase().includes(s) ||
      (r.admin_email ?? "").toLowerCase().includes(s) ||
      (r.ip ?? "").toLowerCase().includes(s) ||
      (r.applicant?.full_name ?? "").toLowerCase().includes(s) ||
      (r.applicant?.email ?? "").toLowerCase().includes(s)
    );
  });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-violet" /> Admin Audit Log
        </h2>
        <p className="text-sm text-muted-foreground">
          Every admin action — approvals, rejections, suspensions, resets and link regenerations — with timestamp and IP.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
          <CardTitle className="text-base">{filtered.length} {filtered.length === 1 ? "entry" : "entries"}</CardTitle>
          <div className="relative flex-1 sm:max-w-md">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search action, admin, applicant, IP…" className="pl-8" />
          </div>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Admin</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Applicant</TableHead>
                <TableHead>IP</TableHead>
                <TableHead className="hidden lg:table-cell">Browser</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No audit entries yet.</TableCell></TableRow>
              ) : filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</TableCell>
                  <TableCell className="text-sm">{r.admin_email ?? r.admin_id.slice(0, 8)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={ACTION_TONE[r.action] ?? ""}>
                      {r.action.replace(/_/g, " ")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    {r.applicant ? (
                      <>
                        <div className="font-medium">{r.applicant.full_name}</div>
                        <div className="text-xs text-muted-foreground">{r.applicant.email}</div>
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs font-mono">{r.ip ?? "—"}</TableCell>
                  <TableCell className="hidden lg:table-cell text-xs text-muted-foreground max-w-[280px] truncate">
                    {r.user_agent ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
