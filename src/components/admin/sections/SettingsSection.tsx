import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { PasswordInput } from "@/components/ui/password-input";
import { BackupRecoverySection } from "./BackupRecoverySection";

export function SettingsSection() {
  const [passMark, setPassMark] = useState(65);
  const [maxAttempts, setMaxAttempts] = useState(3);
  const [cooldown, setCooldown] = useState(24);
  const [proctoring, setProctoring] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newPwd, setNewPwd] = useState("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("app_settings").select("*").eq("id", 1).maybeSingle();
      if (data) {
        setPassMark(data.pass_mark); setMaxAttempts(data.max_attempts);
        setCooldown(data.cooldown_hours); setProctoring(data.proctoring_enabled);
      }
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from("app_settings").update({
      pass_mark: passMark, max_attempts: maxAttempts,
      cooldown_hours: cooldown, proctoring_enabled: proctoring,
    }).eq("id", 1);
    setSaving(false);
    if (error) toast.error(error.message); else toast.success("Settings saved");
  };

  const changePwd = async () => {
    if (newPwd.length < 8) return toast.error("Password must be at least 8 characters");
    const { error } = await supabase.auth.updateUser({ password: newPwd });
    if (error) toast.error(error.message); else { toast.success("Password updated"); setNewPwd(""); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
        <p className="text-sm text-muted-foreground">Configure exam rules and your admin profile.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Exam Rules</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Pass mark (%)</Label>
                <Input type="number" min={1} max={100} value={passMark} onChange={(e) => setPassMark(Number(e.target.value))} />
              </div>
              <div className="space-y-1.5">
                <Label>Max attempts</Label>
                <Input type="number" min={1} max={10} value={maxAttempts} onChange={(e) => setMaxAttempts(Number(e.target.value))} />
              </div>
              <div className="space-y-1.5">
                <Label>Cooldown (hours)</Label>
                <Input type="number" min={0} max={168} value={cooldown} onChange={(e) => setCooldown(Number(e.target.value))} />
              </div>
              <div className="flex items-center justify-between rounded-lg border px-3 py-2">
                <Label className="text-sm">AI Proctoring</Label>
                <Switch checked={proctoring} onCheckedChange={setProctoring} />
              </div>
            </div>
            <Button onClick={save} disabled={saving} className="w-full">{saving ? "Saving…" : "Save settings"}</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Change Admin Password</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Label>New password</Label>
            <PasswordInput value={newPwd} onChange={(e) => setNewPwd(e.target.value)} placeholder="At least 8 characters" />
            <Button onClick={changePwd} className="w-full">Update password</Button>
          </CardContent>
        </Card>
      </div>

      <BackupRecoverySection />
    </div>
  );
}
