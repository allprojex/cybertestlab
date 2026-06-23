import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusPill } from "../StatCard";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

type Row = {
  id: string;
  attempt_number: number;
  started_at: string;
  submitted_at: string | null;
  score: number | null;
  total: number | null;
  percentage: number | null;
  passed: boolean | null;
  ip: string | null;
  country: string | null;
  applicant: { full_name: string; email: string } | null;
};

interface Props { scoresOnly?: boolean }

export function AttemptsSection({ scoresOnly }: Props) {
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("test_attempts")
        .select("*, applicant:applicants(full_name,email)")
        .order("started_at", { ascending: false })
        .limit(500);
      setRows((data ?? []) as any);
    })();
  }, []);

  const visible = scoresOnly ? rows.filter((r) => r.submitted_at) : rows;

  const exportCsv = () => {
    const header = ["Name", "Email", "Attempt", "Started", "Submitted", "Score", "Total", "Percentage", "Passed", "IP"];
    const lines = visible.map((r) => [
      r.applicant?.full_name ?? "",
      r.applicant?.email ?? "",
      r.attempt_number,
      r.started_at,
      r.submitted_at ?? "",
      r.score ?? "",
      r.total ?? "",
      r.percentage ?? "",
      r.passed ?? "",
      r.ip ?? "",
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "attempts.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{scoresOnly ? "Scores" : "Test Attempts"}</h2>
          <p className="text-sm text-muted-foreground">
            {scoresOnly ? "Final score history for all applicants." : "Every started and completed test, including pass/fail."}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={exportCsv}>
          <Download className="h-4 w-4 mr-1" /> CSV
        </Button>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">{visible.length} records</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Applicant</TableHead>
                <TableHead>Attempt</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Result</TableHead>
                <TableHead className="hidden md:table-cell">Started</TableHead>
                <TableHead className="hidden lg:table-cell">IP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No attempts yet.</TableCell></TableRow>
              ) : visible.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <div className="font-medium">{r.applicant?.full_name ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{r.applicant?.email}</div>
                  </TableCell>
                  <TableCell>#{r.attempt_number}</TableCell>
                  <TableCell className="font-medium">
                    {r.percentage != null ? `${Math.round(Number(r.percentage))}%` : "—"}
                    {r.score != null && <span className="text-xs text-muted-foreground ml-1">({r.score}/{r.total})</span>}
                  </TableCell>
                  <TableCell>
                    {r.submitted_at == null ? <StatusPill status="unreviewed" /> : <StatusPill status={r.passed ? "pass" : "fail"} />}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                    {new Date(r.started_at).toLocaleString()}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">{r.ip ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
