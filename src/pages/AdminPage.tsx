import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Lock, LogOut, Shield } from "lucide-react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AdminSidebar, type AdminSection } from "@/components/admin/AdminSidebar";
import { OverviewSection } from "@/components/admin/sections/OverviewSection";
import { UsersSection } from "@/components/admin/sections/UsersSection";
import { AttemptsSection } from "@/components/admin/sections/AttemptsSection";
import { ProctoringSection } from "@/components/admin/sections/ProctoringSection";
import { LoginsSection } from "@/components/admin/sections/LoginsSection";
import { SettingsSection } from "@/components/admin/sections/SettingsSection";
import { QuestionsSection } from "@/components/admin/sections/QuestionsSection";
import { AuditLogSection } from "@/components/admin/sections/AuditLogSection";
import { BrandSettingsSection } from "@/components/admin/sections/BrandSettingsSection";
import { RecycleBinSection } from "@/components/admin/sections/RecycleBinSection";
import { ThemeToggle } from "@/components/admin/ThemeToggle";
import { NotificationsBell } from "@/components/admin/NotificationsBell";
import { AdminTopNav } from "@/components/admin/AdminTopNav";
import { UserMenu } from "@/components/admin/UserMenu";
import { usePresence } from "@/hooks/usePresence";
import { useBranding } from "@/hooks/useBranding";
import { logLoginEvent } from "@/lib/loginLog";
import cyberTestLogo from "@/assets/cybertest-360-logo.jpeg.asset.json";

const adminIdentifierToEmail = (value: string) => {
  const trimmed = value.trim();
  return trimmed.includes("@") ? trimmed.toLowerCase() : `${trimmed.toLowerCase()}@admin.local`;
};

const AdminPage = () => {
  const navigate = useNavigate();
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [section, setSection] = useState<AdminSection>("overview");

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s); setLoading(false);
    });
    supabase.auth.getSession().then(({ data: { session } }) => { setSession(session); setLoading(false); });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) { setIsAdmin(false); return; }
    (async () => {
      const { data } = await supabase
        .from("user_roles").select("role").eq("user_id", session.user.id).eq("role", "admin").maybeSingle();
      setIsAdmin(!!data);
    })();
  }, [session]);

  const login = async () => {
    setLoginError("");
    const authEmail = adminIdentifierToEmail(email);
    if (!authEmail || !password) {
      setLoginError("Enter your admin name or email and password.");
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({ email: authEmail, password });
    if (error) {
      setLoginError(error.message);
      logLoginEvent("login_failed", authEmail);
    } else {
      logLoginEvent("login_success", authEmail);
    }
  };
  const logout = async () => {
    const currentEmail = session?.user?.email ?? null;
    await supabase.auth.signOut();
    logLoginEvent("logout", currentEmail);
    setSession(null);
  };

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-background"><p className="text-muted-foreground">Loading…</p></div>;
  }

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4" style={{ background: "var(--gradient-cool)" }}>
        <Card className="w-full max-w-sm shadow-2xl border-0">
          <CardHeader className="text-center">
            <div className="mx-auto mb-3 inline-flex items-center justify-center w-20 h-20 rounded-2xl overflow-hidden bg-background">
              <img src={cyberTestLogo.url} alt="CyberTest 360" className="w-full h-full object-contain" />
            </div>
            <CardTitle className="text-xl">Admin Access</CardTitle>
            <p className="text-sm text-muted-foreground">Sign in to manage the test platform</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Admin name or email</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && login()} placeholder="admin" autoComplete="username" />
            </div>
            <div className="space-y-2">
              <Label>Password</Label>
              <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && login()} placeholder="Enter password" />
            </div>
            {loginError && <p className="text-sm text-destructive">{loginError}</p>}
            <Button className="w-full" onClick={login}>
              <Lock className="w-4 h-4 mr-1" /> Sign in
            </Button>
            <button type="button" onClick={() => navigate("/admin-forgot")} className="text-xs text-primary hover:underline w-full text-center">
              Forgot password?
            </button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-sm">
          <CardHeader><CardTitle>Not authorized</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">This account does not have admin privileges.</p>
            <Button variant="outline" className="w-full" onClick={logout}><LogOut className="w-4 h-4 mr-1" /> Sign out</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const renderSection = () => {
    switch (section) {
      case "overview": return <OverviewSection />;
      case "users": return <UsersSection />;
      case "approvals": return <UsersSection initialStatus="pending" />;
      case "expired": return <UsersSection expiredOnly />;
      case "attempts": return <AttemptsSection />;
      case "scores": return <AttemptsSection scoresOnly />;
      case "proctoring": return <ProctoringSection />;
      case "logins": return <LoginsSection />;
      case "questions": return <QuestionsSection />;
      case "audit": return <AuditLogSection />;
      case "brand": return <BrandSettingsSection />;
      case "recycle": return <RecycleBinSection />;
      case "settings": return <SettingsSection />;
    }
  };

  return <AdminLayout section={section} setSection={setSection} session={session} logout={logout} renderSection={renderSection} />;
};

function AdminLayout({ section, setSection, session, logout, renderSection }: any) {
  const brand = useBranding();
  usePresence("admin", session?.user?.email);

  // Persist sidebar open/closed across reloads and sessions
  const STORAGE_KEY = "admin:sidebar:open";
  const initialOpen = (() => {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      if (v === "true") return true;
      if (v === "false") return false;
    } catch {}
    return true;
  })();
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(initialOpen);
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, String(sidebarOpen)); } catch {}
  }, [sidebarOpen]);

  return (
    <SidebarProvider open={sidebarOpen} onOpenChange={setSidebarOpen} defaultOpen={initialOpen}>
      <div className="min-h-screen flex w-full bg-background">
        <AdminSidebar active={section} onSelect={setSection} />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 border-b bg-card flex items-center px-3 sm:px-4 gap-2 sm:gap-3 sticky top-0 z-10">
            <SidebarTrigger aria-label="Toggle navigation sidebar" />
            {brand.logoUrl && (
              <img src={brand.logoUrl} alt="" aria-hidden="true" className="h-8 w-8 rounded object-contain hidden sm:block" />
            )}
            <div className="min-w-0 hidden md:block mr-2">
              <h1 className="text-sm font-semibold truncate leading-tight">{brand.name}</h1>
              <p className="text-xs text-muted-foreground truncate leading-tight">Admin Console</p>
            </div>
            <AdminTopNav active={section} onSelect={setSection} />
            <div className="ml-auto flex items-center gap-1 sm:gap-2">
              <ThemeToggle />
              <NotificationsBell />
              <UserMenu email={session.user.email} onSelect={setSection} onLogout={logout} />
            </div>
          </header>
          <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-x-hidden">
            {renderSection()}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default AdminPage;
