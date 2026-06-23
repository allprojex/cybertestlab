import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { KeyRound } from "lucide-react";
import { z } from "zod";
import { logLoginEvent } from "@/lib/loginLog";

const nameToEmail = (name: string) => `${name.trim().toLowerCase()}@admin.local`;

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Name is required")
    .max(50)
    .regex(/^[a-zA-Z0-9._-]+$/, "Use letters, numbers, dots, dashes or underscores"),
  new_password: z.string().min(8, "Password must be at least 8 characters").max(128),
  secret: z.string().min(8, "Recovery secret is required").max(512),
});

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

const AdminReset = () => {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [secret, setSecret] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError("");
    setSuccess("");
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    const parsed = schema.safeParse({ name, new_password: newPassword, secret });
    if (!parsed.success) {
      setError(parsed.error.errors[0].message);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-reset`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-seed-secret": parsed.data.secret,
          // Anon key still required by the gateway even on public functions.
          apikey: SUPABASE_ANON,
          Authorization: `Bearer ${SUPABASE_ANON}`,
        },
        body: JSON.stringify({
          name: parsed.data.name,
          new_password: parsed.data.new_password,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Reset failed");
        return;
      }
      logLoginEvent("recovery_secret_used", nameToEmail(parsed.data.name));
      logLoginEvent("password_reset_completed", nameToEmail(parsed.data.name));
      setSuccess("Password reset. Redirecting to login...");
      setTimeout(() => navigate("/admin-login"), 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm border-primary/20">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10">
            <KeyRound className="w-6 h-6 text-primary" />
          </div>
          <CardTitle>Admin Password Reset</CardTitle>
          <CardDescription>Reset an existing admin's password using the recovery secret.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="reset-name">Admin Name</Label>
            <Input
              id="reset-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="admin"
              autoComplete="username"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="reset-password">New Password</Label>
            <PasswordInput
              id="reset-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="reset-confirm">Confirm New Password</Label>
            <PasswordInput
              id="reset-confirm"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="reset-secret">Recovery Secret</Label>
            <PasswordInput
              id="reset-secret"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="SEED_ADMIN_SECRET value"
            />
            <p className="text-xs text-muted-foreground">
              Find this in Project Settings → Secrets as <code>SEED_ADMIN_SECRET</code>.
            </p>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {success && <p className="text-sm text-primary">{success}</p>}
          <Button className="w-full bg-primary hover:bg-primary/90" onClick={submit} disabled={loading}>
            {loading ? "Resetting..." : "Reset Password"}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            <button
              type="button"
              onClick={() => navigate("/admin-login")}
              className="text-primary underline-offset-4 hover:underline"
            >
              Back to admin login
            </button>
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminReset;
