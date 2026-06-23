import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Radio } from "lucide-react";

type Row = {
  id: string; email: string | null; event: string;
  ip: string | null; country: string | null; city: string | null;
  user_agent: string | null; created_at: string;
};

export function LoginsSection() {
  const [rows, setRows] = useState<Row[]>([]);
  const [live, setLive] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("login_activity")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (!cancelled) setRows((data ?? []) as Row[]);
    })();

    const channel = supabase
      .channel("login_activity_feed")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "login_activity" },
        (payload) => {
          const r = payload.new as Row;
          setRows((prev) => {
            if (prev.some((x) => x.id === r.id)) return prev;
            return [r, ...prev].slice(0, 500);
          });
        },
      )
      .subscribe((status) => {
        setLive(status === "SUBSCRIBED");
      });

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  const tone = (ev: string) =>
    ev.includes("fail") ? "destructive" : ev.includes("reset") ? "secondary" : "default";

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Login Activity</h2>
          <p className="text-sm text-muted-foreground">Every login attempt, password reset, and session event.</p>
        </div>
        <div className="flex items-center gap-2 text-xs" aria-live="polite">
          <Radio className={`w-3.5 h-3.5 ${live ? "text-green-500" : "text-muted-foreground"}`} />
          <span className={live ? "text-green-600 font-medium" : "text-muted-foreground"}>
            {live ? "Live" : "Connecting…"}
          </span>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">{rows.length} events</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Event</TableHead>
                <TableHead>IP</TableHead>
                <TableHead className="hidden md:table-cell">Location</TableHead>
                <TableHead className="hidden lg:table-cell">Device</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No login activity yet.</TableCell></TableRow>
              ) : rows.map((r) => (
                <TableRow key={r.id} data-testid="login-row">
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(r.created_at).toLocaleString()}
                  </TableCell>
                  <TableCell className="font-medium">{r.email ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={tone(r.event) as any} className="capitalize">{r.event.replace(/_/g, " ")}</Badge>
                  </TableCell>
                  <TableCell className="text-sm">{r.ip ?? "—"}</TableCell>
                  <TableCell className="hidden md:table-cell text-sm">
                    {[r.city, r.country].filter(Boolean).join(", ") || "—"}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-xs text-muted-foreground truncate max-w-[16rem]">
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
