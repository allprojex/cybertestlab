import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusPill } from "../StatCard";
import { toast } from "@/components/ui/sonner";
import { Check, X, ImageOff } from "lucide-react";

type Snap = {
  id: string;
  applicant_id: string;
  snapshot_path: string;
  auto_verdict: string;
  admin_verdict: string;
  face_match_score: number | null;
  created_at: string;
  applicant: { full_name: string; email: string } | null;
};

export function ProctoringSection() {
  const [rows, setRows] = useState<Snap[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});

  const load = async () => {
    const { data } = await supabase
      .from("proctoring_snapshots")
      .select("*, applicant:applicants(full_name,email)")
      .order("created_at", { ascending: false })
      .limit(200);
    const list = (data ?? []) as any as Snap[];
    setRows(list);
    const next: Record<string, string> = {};
    await Promise.all(list.map(async (s) => {
      const { data: signed } = await supabase.storage.from("proctoring").createSignedUrl(s.snapshot_path, 600);
      if (signed?.signedUrl) next[s.id] = signed.signedUrl;
    }));
    setUrls(next);
  };
  useEffect(() => { load(); }, []);

  const verdict = async (id: string, verdict: "match" | "no_match") => {
    const { error } = await supabase
      .from("proctoring_snapshots")
      .update({ admin_verdict: verdict, reviewed_at: new Date().toISOString() })
      .eq("id", id);
    if (error) toast.error(error.message); else toast.success(`Marked ${verdict.replace("_", " ")}`);
    load();
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">AI Proctoring Records</h2>
        <p className="text-sm text-muted-foreground">Snapshots captured during face verification. Confirm identity matches.</p>
      </div>

      {rows.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No proctoring snapshots yet.</CardContent></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {rows.map((s) => (
            <Card key={s.id} className="overflow-hidden">
              <div className="aspect-square bg-muted relative">
                {urls[s.id] ? (
                  <img src={urls[s.id]} alt={s.applicant?.full_name ?? "snapshot"} className="absolute inset-0 w-full h-full object-cover" />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                    <ImageOff className="h-8 w-8" />
                  </div>
                )}
                <div className="absolute top-2 right-2"><StatusPill status={s.auto_verdict} /></div>
              </div>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm truncate">{s.applicant?.full_name ?? "Unknown"}</CardTitle>
                <p className="text-xs text-muted-foreground truncate">{s.applicant?.email}</p>
              </CardHeader>
              <CardContent className="pt-0 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{new Date(s.created_at).toLocaleString()}</span>
                  <StatusPill status={s.admin_verdict} />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => verdict(s.id, "match")}>
                    <Check className="h-3.5 w-3.5 mr-1 text-success" /> Match
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => verdict(s.id, "no_match")}>
                    <X className="h-3.5 w-3.5 mr-1 text-destructive" /> No Match
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
