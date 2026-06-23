import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Copy, ExternalLink, Link2, RefreshCw, Power, Loader2, Ban } from "lucide-react";
import { toast } from "@/components/ui/sonner";

type ShareLink = {
  id: string;
  set_id: string;
  token: string;
  enabled: boolean;
  max_uses: number | null;
  uses_count: number;
  expires_at: string | null;
};

export function ShareLinkTab({ setId, setActive }: { setId: string; setActive: boolean }) {
  const [link, setLink] = useState<ShareLink | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [maxUses, setMaxUses] = useState<string>("");
  const [expiresAt, setExpiresAt] = useState<string>("");
  const [attemptStats, setAttemptStats] = useState({ started: 0, completed: 0 });
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("question_set_share_links")
      .select("*")
      .eq("set_id", setId)
      .maybeSingle();
    setLink((data as ShareLink) ?? null);
    if (data) {
      setMaxUses(data.max_uses?.toString() ?? "");
      setExpiresAt(data.expires_at ? new Date(data.expires_at).toISOString().slice(0, 16) : "");
      // attempt counts via applicants joined to test_attempts/results
      const { data: apps } = await supabase
        .from("applicants").select("id").eq("share_link_id", data.id);
      const ids = (apps ?? []).map((a: any) => a.id);
      if (ids.length) {
        const { count: started } = await supabase
          .from("test_attempts").select("id", { count: "exact", head: true }).in("applicant_id", ids);
        const { count: completed } = await supabase
          .from("test_attempts").select("id", { count: "exact", head: true })
          .in("applicant_id", ids).not("submitted_at", "is", null);
        setAttemptStats({ started: started ?? 0, completed: completed ?? 0 });
      } else setAttemptStats({ started: 0, completed: 0 });
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, [setId]);

  const url = link ? `${window.location.origin}/t/${link.token}` : "";

  const generate = async () => {
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("question_set_share_links").insert({
      set_id: setId, created_by: u.user?.id ?? null,
    });
    setBusy(false);
    if (error) return toast.error("Couldn't create link", { description: error.message });
    toast.success("Public link generated");
    load();
  };

  const regenerate = async () => {
    if (!link) return;
    setBusy(true);
    const { error } = await supabase.rpc("share_link_regenerate", { _link_id: link.id });
    setBusy(false);
    setConfirmRegenerate(false);
    if (error) {
      return toast.error(
        error.code === "42501" ? "Only admins can regenerate this link." : (error.message ?? "Couldn't regenerate link"),
      );
    }
    toast.success("New link generated. The previous URL no longer works.");
    load();
  };

  const revoke = async () => {
    if (!link) return;
    setBusy(true);
    const { error } = await supabase.rpc("share_link_revoke", { _link_id: link.id });
    setBusy(false);
    setConfirmRevoke(false);
    if (error) {
      return toast.error(
        error.code === "42501" ? "Only admins can revoke this link." : (error.message ?? "Couldn't revoke link"),
      );
    }
    toast.success("Public link revoked.");
    setLink(null);
    load();
  };

  const toggle = async (next: boolean) => {
    if (!link) return;
    const { error } = await supabase
      .from("question_set_share_links")
      .update({ enabled: next })
      .eq("id", link.id);
    if (error) return toast.error(error.message);
    toast.success(next ? "Link enabled" : "Link disabled");
    load();
  };

  const saveLimits = async () => {
    if (!link) return;
    setBusy(true);
    const payload: Partial<ShareLink> = {
      max_uses: maxUses.trim() === "" ? null : Math.max(1, parseInt(maxUses, 10) || 1),
      expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
    };
    const { error } = await supabase
      .from("question_set_share_links")
      .update(payload)
      .eq("id", link.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Limits saved");
    load();
  };

  const copy = async () => {
    await navigator.clipboard.writeText(url);
    toast.success("Link copied to clipboard");
  };

  if (loading) return <div className="flex items-center justify-center py-8 text-muted-foreground"><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Loading…</div>;

  if (!link) {
    return (
      <div className="space-y-3">
        <div className="rounded-md border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground">
          No public link yet. Generate one to share this question set with any user — they can take the test without admin approval.
        </div>
        {!setActive && (
          <p className="text-xs text-warning">Note: the set must be marked Active for the link to serve questions to applicants.</p>
        )}
        <Button onClick={generate} disabled={busy}>
          <Link2 className="h-4 w-4 mr-1" /> Generate public link
        </Button>
      </div>
    );
  }

  const exhausted = link.max_uses != null && link.uses_count >= link.max_uses;
  const expired = link.expires_at && new Date(link.expires_at).getTime() < Date.now();
  const live = link.enabled && setActive && !exhausted && !expired;

  return (
    <div className="space-y-4">
      <div className="rounded-md border bg-card p-3 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          {live ? (
            <Badge className="bg-success/15 text-success border border-success/30">Live</Badge>
          ) : (
            <Badge variant="outline">Inactive</Badge>
          )}
          {!setActive && <Badge variant="outline" className="border-warning/40 text-warning">Set is inactive</Badge>}
          {exhausted && <Badge variant="outline" className="border-warning/40 text-warning">Max uses reached</Badge>}
          {expired && <Badge variant="outline" className="border-warning/40 text-warning">Expired</Badge>}
          <span className="ml-auto flex items-center gap-2 text-sm">
            <Power className="h-4 w-4 text-muted-foreground" />
            <Switch checked={link.enabled} onCheckedChange={toggle} />
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Input readOnly value={url} className="font-mono text-xs" />
          <Button variant="outline" size="icon" onClick={copy} aria-label="Copy"><Copy className="h-4 w-4" /></Button>
          <Button variant="outline" size="icon" asChild aria-label="Open">
            <a href={url} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /></a>
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Share this link with any user. They register on the landing page and take the test — results appear live on your dashboard.
        </p>
      </div>

      <div className="grid sm:grid-cols-3 gap-3 rounded-md border p-3 bg-muted/20">
        <div>
          <p className="text-xs text-muted-foreground">Uses</p>
          <p className="text-lg font-semibold">{link.uses_count}{link.max_uses != null ? ` / ${link.max_uses}` : ""}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Attempts started</p>
          <p className="text-lg font-semibold">{attemptStats.started}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Completed</p>
          <p className="text-lg font-semibold">{attemptStats.completed}</p>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Max uses (optional)</Label>
          <Input type="number" min={1} value={maxUses} onChange={(e) => setMaxUses(e.target.value)} placeholder="Unlimited" />
        </div>
        <div className="space-y-1.5">
          <Label>Expires at (optional)</Label>
          <Input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={saveLimits} disabled={busy}>Save limits</Button>
        <Button variant="outline" onClick={() => setConfirmRegenerate(true)} disabled={busy}>
          <RefreshCw className="h-4 w-4 mr-1" /> Regenerate link
        </Button>
        <Button variant="destructive" onClick={() => setConfirmRevoke(true)} disabled={busy}>
          <Ban className="h-4 w-4 mr-1" /> Revoke link
        </Button>
      </div>

      <AlertDialog open={confirmRegenerate} onOpenChange={setConfirmRegenerate}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Regenerate this public link?</AlertDialogTitle>
            <AlertDialogDescription>
              A new token will be issued and the use counter reset to zero. Anyone using the old URL will see a "link unavailable" message.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={regenerate}>Regenerate</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmRevoke} onOpenChange={setConfirmRevoke}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke this public link?</AlertDialogTitle>
            <AlertDialogDescription>
              The link will be permanently deleted and the URL will stop working immediately. Existing applicants and their results are not affected. You can generate a fresh link afterwards.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={revoke} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
