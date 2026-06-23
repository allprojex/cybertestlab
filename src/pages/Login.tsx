import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Lock, UserRound } from "lucide-react";
import { z } from "zod";
import { logLoginEvent } from "@/lib/loginLog";
import { useBranding } from "@/hooks/useBranding";

const applicantSchema = z.object({
  name: z.string().trim().min(2, "Name is required").max(100),
});

const adminSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Name is required")
    .max(50)
    .regex(/^[a-zA-Z0-9._-]+$/, "Use letters, numbers, dots, dashes or underscores"),
  password: z.string().min(6, "Password must be at least 6 characters").max(128),
});

const nameToEmail = (name: string) => `${name.trim().toLowerCase()}@admin.local`;

const Login = () => {
  const navigate = useNavigate();
  const brand = useBranding();

  // Applicant state
  const [applicantName, setApplicantName] = useState("");
  const [applicantError, setApplicantError] = useState("");

  // Admin state
  const [adminName, setAdminName] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminError, setAdminError] = useState("");
  const [adminLoading, setAdminLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) navigate("/admin");
    });
  }, [navigate]);

  const handleApplicant = () => {
    setApplicantError("");
    const parsed = applicantSchema.safeParse({ name: applicantName });
    if (!parsed.success) {
      setApplicantError(parsed.error.errors[0].message);
      return;
    }
    navigate("/", { state: { name: parsed.data.name } });
  };

  const handleAdmin = async () => {
    setAdminError("");
    const parsed = adminSchema.safeParse({ name: adminName, password: adminPassword });
    if (!parsed.success) {
      setAdminError(parsed.error.errors[0].message);
      return;
    }
    setAdminLoading(true);
    const synthEmail = nameToEmail(parsed.data.name);
    const { error } = await supabase.auth.signInWithPassword({
      email: synthEmail,
      password: parsed.data.password,
    });
    setAdminLoading(false);
    if (error) {
      logLoginEvent("login_failed", synthEmail);
      setAdminError("Invalid name or password");
      return;
    }
    logLoginEvent("login_success", synthEmail);
    navigate("/admin");
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-5xl space-y-8">
        <div className="text-center space-y-3">
          {brand.logoUrl && (
            <img src={brand.logoUrl} alt={brand.name} className="mx-auto h-16 w-16 object-contain" />
          )}
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{brand.name}</h1>
          <p className="text-sm text-muted-foreground">Choose how you want to sign in</p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Applicant card */}
          <Card className="border-primary/20">
            <CardHeader className="text-center">
              <div className="mx-auto mb-2 inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10">
                <UserRound className="w-6 h-6 text-primary" />
              </div>
              <CardTitle>Applicant Login</CardTitle>
              <CardDescription>
                Enter your full name to continue to the test
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="applicant-name">Full Name</Label>
                <Input
                  id="applicant-name"
                  placeholder="Kwame Asante"
                  value={applicantName}
                  onChange={(e) => setApplicantName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleApplicant()}
                  autoComplete="name"
                />
              </div>
              {applicantError && (
                <p className="text-sm text-destructive">{applicantError}</p>
              )}
              <Button className="w-full" size="lg" onClick={handleApplicant}>
                Continue
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                You will be asked for your contact details and access link on the
                next step.
              </p>
            </CardContent>
          </Card>

          {/* Admin card */}
          <Card className="border-primary/20">
            <CardHeader className="text-center">
              <div className="mx-auto mb-2 inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10">
                <Lock className="w-6 h-6 text-primary" />
              </div>
              <CardTitle>Admin Login</CardTitle>
              <CardDescription>
                Sign in with your admin credentials
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="admin-name">Admin Name</Label>
                <Input
                  id="admin-name"
                  value={adminName}
                  onChange={(e) => setAdminName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAdmin()}
                  placeholder="admin"
                  autoComplete="username"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin-password">Password</Label>
                <PasswordInput
                  id="admin-password"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAdmin()}
                  placeholder="Enter password"
                  autoComplete="current-password"
                />
              </div>
              {adminError && (
                <p className="text-sm text-destructive">{adminError}</p>
              )}
              <Button
                className="w-full bg-primary hover:bg-primary/90"
                size="lg"
                onClick={handleAdmin}
                disabled={adminLoading}
              >
                {adminLoading ? "Signing in..." : "Login"}
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
      </div>
    </main>
  );
};

export default Login;
