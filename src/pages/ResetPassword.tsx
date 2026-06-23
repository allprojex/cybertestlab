import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { KeyRound } from "lucide-react";
import { logLoginEvent } from "@/lib/loginLog";

const ResetPassword = () => {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [linkError, setLinkError] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  // Supabase auto-parses the recovery hash and fires PASSWORD_RECOVERY.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setReady(true);
      }
    });
    // If the hash isn't present at all, the page was opened directly.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session && !window.location.hash.includes("access_token")) {
        setLinkError(
          "This reset link is invalid or has expired. Request a new one from the Forgot password page.",
        );
      } else if (session) {
        // A valid recovery session is established.
        setReady(true);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const submit = async () => {
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    const { data: userData } = await supabase.auth.getUser();
    const userEmail = userData?.user?.email ?? null;
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    logLoginEvent("password_reset_completed", userEmail);
    await supabase.auth.signOut();
    setDone(true);
    setTimeout(() => navigate("/admin-login"), 1500);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm border-primary/20">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10">
            <KeyRound className="w-6 h-6 text-primary" />
          </div>
          <CardTitle>Set a new password</CardTitle>
          <CardDescription>Enter and confirm your new admin password.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {linkError && <p className="text-sm text-destructive">{linkError}</p>}
          {done ? (
            <p className="text-sm text-primary text-center">
              Password updated. Redirecting to login...
            </p>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="new-password">New Password</Label>
                <PasswordInput
                  id="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  disabled={!ready}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm New Password</Label>
                <PasswordInput
                  id="confirm-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  disabled={!ready}
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button
                className="w-full bg-primary hover:bg-primary/90"
                onClick={submit}
                disabled={!ready || loading}
              >
                {loading ? "Updating..." : "Update password"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ResetPassword;
