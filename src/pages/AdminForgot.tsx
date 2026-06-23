import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Mail } from "lucide-react";
import { z } from "zod";
import { logLoginEvent } from "@/lib/loginLog";

const nameToEmail = (name: string) => `${name.trim().toLowerCase()}@admin.local`;

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Admin name is required")
    .max(50)
    .regex(/^[a-zA-Z0-9._-]+$/, "Use letters, numbers, dots, dashes or underscores"),
});

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

const AdminForgot = () => {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError("");
    const parsed = schema.safeParse({ name });
    if (!parsed.success) {
      setError(parsed.error.errors[0].message);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-request-reset`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON,
          Authorization: `Bearer ${SUPABASE_ANON}`,
        },
        body: JSON.stringify({
          name: parsed.data.name,
          redirect_to: `${window.location.origin}/reset-password`,
        }),
      });
      // Always treat well-formed responses as success to avoid leaking info.
      if (!res.ok && res.status !== 200) {
        const data = await res.json().catch(() => ({}));
        setError(typeof data.error === "string" ? data.error : "Could not send reset link");
        return;
      }
      logLoginEvent("password_reset_requested", nameToEmail(parsed.data.name));
      setSent(true);
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
            <Mail className="w-6 h-6 text-primary" />
          </div>
          <CardTitle>Forgot Password</CardTitle>
          <CardDescription>
            We'll email a reset link to the recovery address on file for this admin.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {sent ? (
            <div className="space-y-3 text-center">
              <p className="text-sm text-foreground">
                If an admin with that name has a recovery email on file, a reset link has
                been sent. Check your inbox (and spam folder).
              </p>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => navigate("/admin-login")}
              >
                Back to login
              </Button>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="forgot-name">Admin Name</Label>
                <Input
                  id="forgot-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submit()}
                  placeholder="admin"
                  autoComplete="username"
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button
                className="w-full bg-primary hover:bg-primary/90"
                onClick={submit}
                disabled={loading}
              >
                {loading ? "Sending..." : "Send reset link"}
              </Button>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <button
                  type="button"
                  onClick={() => navigate("/admin-login")}
                  className="text-primary underline-offset-4 hover:underline"
                >
                  Back to login
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/admin-reset")}
                  className="text-primary underline-offset-4 hover:underline"
                >
                  Use recovery secret
                </button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminForgot;
