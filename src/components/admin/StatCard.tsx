import { Card, CardContent } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  tone?: "primary" | "info" | "warning" | "violet" | "teal" | "pink" | "destructive" | "success";
  hint?: string;
}

const toneMap: Record<NonNullable<StatCardProps["tone"]>, string> = {
  primary: "bg-primary/10 text-primary",
  info: "bg-info/10 text-info",
  warning: "bg-warning/10 text-warning",
  violet: "bg-violet/10 text-violet",
  teal: "bg-teal/10 text-teal",
  pink: "bg-pink/10 text-pink",
  destructive: "bg-destructive/10 text-destructive",
  success: "bg-success/10 text-success",
};

export function StatCard({ label, value, icon: Icon, tone = "primary", hint }: StatCardProps) {
  return (
    <Card className="overflow-hidden border-border/60 shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">{label}</p>
            <p className="mt-2 text-3xl font-bold tracking-tight">{value}</p>
            {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
          </div>
          <div className={`h-11 w-11 rounded-xl flex items-center justify-center ${toneMap[tone]}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "bg-warning/15 text-warning border-warning/30",
    approved: "bg-success/15 text-success border-success/30",
    rejected: "bg-destructive/15 text-destructive border-destructive/30",
    suspended: "bg-muted text-muted-foreground border-border",
    match: "bg-success/15 text-success border-success/30",
    no_match: "bg-destructive/15 text-destructive border-destructive/30",
    unreviewed: "bg-info/15 text-info border-info/30",
    pass: "bg-success/15 text-success border-success/30",
    fail: "bg-destructive/15 text-destructive border-destructive/30",
  };
  const cls = map[status] ?? "bg-muted text-muted-foreground border-border";
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${cls}`}>
      {status.replace("_", " ")}
    </span>
  );
}
