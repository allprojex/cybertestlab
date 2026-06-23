import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Lock } from "lucide-react";
import { z } from "zod";
import { logLoginEvent } from "@/lib/loginLog";

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Name is required")
    .max(50)
    .regex(/^[a-zA-Z0-9._-]+$/, "Use letters, numbers, dots, dashes or underscores"),
  password: z.string().min(6, "Password must be at least 6 characters").max(128),
});

// Admin "name" is mapped to a synthetic email so it works with Supabase Auth.
// Create the admin user in the backend with this same email pattern.
const nameToEmail = (name: string) => `${name.trim().toLowerCase()}@admin.local`;

const AdminLogin = () => {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) navigate("/admin");
    });
  }, [navigate]);

  const login = async () => {
    setError("");
    const parsed = schema.safeParse({ name, password });
    if (!parsed.success) {
      setError(parsed.error.errors[0].message);
      return;
    }
    setLoading(true);
    const synthEmail = nameToEmail(parsed.data.name);
    const { error } = await supabase.auth.signInWithPassword({
      email: synthEmail,
      password: parsed.data.password,
    });
    setLoading(false);
    if (error) {
      logLoginEvent("login_failed", synthEmail);
      setError("Invalid name or password");
      return;
    }
    logLoginEvent("login_success", synthEmail);
    navigate("/admin");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm border-primary/20">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10">
            <Lock className="w-6 h-6 text-primary" />
          </div>
          <CardTitle>Admin Login</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="admin-name">Admin Name</Label>
            <Input
              id="admin-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && login()}
              placeholder="admin"
              autoComplete="username"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="admin-password">Password</Label>
            <PasswordInput
              id="admin-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && login()}
              placeholder="Enter password"
              autoComplete="current-password"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button className="w-full bg-primary hover:bg-primary/90" onClick={login} disabled={loading}>
            {loading ? "Signing in..." : "Login"}
          </Button>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <button
              type="button"
              onClick={() => navigate("/admin-forgot")}
              className="text-primary underline-offset-4 hover:underline"
            >
              Forgot password?
            </button>
            <button
              type="button"
              onClick={() => navigate("/admin")}
              className="text-primary underline-offset-4 hover:underline"
            >
              Email login
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminLogin;
