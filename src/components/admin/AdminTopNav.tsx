import { useEffect, useState } from "react";
import {
  Search, Users, ClipboardList, Trophy, UserCheck, Camera, Activity,
  ShieldCheck, ListChecks, Settings, Palette, LayoutDashboard, LinkIcon,
  FileText, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput,
  CommandItem, CommandList, CommandSeparator,
} from "@/components/ui/command";
import { supabase } from "@/integrations/supabase/client";
import type { AdminSection } from "./AdminSidebar";

type QuickLink = { key: AdminSection; label: string; icon: any };

const quickLinks: QuickLink[] = [
  { key: "users", label: "Users", icon: Users },
  { key: "questions", label: "Assessments", icon: ListChecks },
  { key: "scores", label: "Reports", icon: Trophy },
];

const allEntries: { key: AdminSection; label: string; group: string; icon: any; keywords?: string }[] = [
  { key: "overview", label: "Dashboard", group: "Overview", icon: LayoutDashboard, keywords: "home stats kpi" },
  { key: "users", label: "Users", group: "Identity & Access", icon: Users, keywords: "applicants accounts people" },
  { key: "approvals", label: "Pending Approvals", group: "Identity & Access", icon: UserCheck, keywords: "review verify" },
  { key: "expired", label: "Expired Links", group: "Identity & Access", icon: LinkIcon },
  { key: "questions", label: "Question Bank", group: "Assessments", icon: ListChecks, keywords: "questions sets tests exam" },
  { key: "attempts", label: "Test Attempts", group: "Assessments", icon: ClipboardList },
  { key: "scores", label: "Results & Scores", group: "Assessments", icon: Trophy, keywords: "reports results grades" },
  { key: "proctoring", label: "AI Proctoring", group: "Security & Compliance", icon: Camera, keywords: "monitor cheating webcam" },
  { key: "logins", label: "Login Activity", group: "Security & Compliance", icon: Activity },
  { key: "audit", label: "Audit Log", group: "Security & Compliance", icon: ShieldCheck },
  { key: "brand", label: "Brand Settings", group: "Configuration", icon: Palette },
  { key: "settings", label: "System Settings", group: "Configuration", icon: Settings },
];

type SearchHit =
  | { kind: "user"; id: string; name: string; email: string | null }
  | { kind: "assessment"; id: string; name: string }
  | { kind: "report"; id: string; name: string; percentage: number | null };

export function AdminTopNav({
  active, onSelect,
}: { active: AdminSection; onSelect: (s: AdminSection) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);

  // ⌘K / Ctrl+K
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Debounced live search across Users, Assessments, Reports
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 2) { setHits([]); setLoading(false); return; }
    setLoading(true);
    const handle = setTimeout(async () => {
      const like = `%${q}%`;
      const [usersRes, setsRes, attemptsRes] = await Promise.all([
        supabase.from("applicants")
          .select("id,full_name,email")
          .or(`full_name.ilike.${like},email.ilike.${like}`)
          .limit(5),
        supabase.from("question_sets")
          .select("id,name")
          .ilike("name", like)
          .limit(5),
        supabase.from("test_attempts")
          .select("id,percentage,applicants(full_name,email)")
          .order("submitted_at", { ascending: false })
          .limit(20),
      ]);
      const users: SearchHit[] = (usersRes.data || []).map((u: any) => ({
        kind: "user", id: u.id, name: u.full_name || "Unnamed", email: u.email,
      }));
      const sets: SearchHit[] = (setsRes.data || []).map((s: any) => ({
        kind: "assessment", id: s.id, name: s.name,
      }));
      const reports: SearchHit[] = (attemptsRes.data || [])
        .filter((a: any) => {
          const n = a.applicants?.full_name?.toLowerCase() || "";
          const e = a.applicants?.email?.toLowerCase() || "";
          const needle = q.toLowerCase();
          return n.includes(needle) || e.includes(needle);
        })
        .slice(0, 5)
        .map((a: any) => ({
          kind: "report", id: a.id,
          name: a.applicants?.full_name || a.applicants?.email || "Attempt",
          percentage: a.percentage,
        }));
      setHits([...users, ...sets, ...reports]);
      setLoading(false);
    }, 250);
    return () => clearTimeout(handle);
  }, [query, open]);

  const run = (s: AdminSection) => { onSelect(s); setOpen(false); setQuery(""); };

  const grouped = allEntries.reduce<Record<string, typeof allEntries>>((acc, e) => {
    (acc[e.group] ||= []).push(e);
    return acc;
  }, {});

  const userHits = hits.filter((h) => h.kind === "user");
  const assessmentHits = hits.filter((h) => h.kind === "assessment");
  const reportHits = hits.filter((h) => h.kind === "report");

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 h-9 px-3 rounded-md border bg-background/50 hover:bg-accent transition-colors text-sm text-muted-foreground min-w-0 flex-1 max-w-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Open global search (Ctrl+K)"
        aria-keyshortcuts="Control+K Meta+K"
      >
        <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="truncate hidden sm:inline">Search users, tests, reports…</span>
        <span className="truncate sm:hidden">Search…</span>
        <kbd className="ml-auto hidden md:inline-flex h-5 items-center gap-1 rounded border bg-muted px-1.5 text-[10px] font-mono text-muted-foreground" aria-hidden="true">
          ⌘K
        </kbd>
      </button>

      <nav className="hidden lg:flex items-center gap-1" aria-label="Quick links">
        {quickLinks.map((q) => {
          const Icon = q.icon;
          const isActive = active === q.key;
          return (
            <Button
              key={q.key}
              variant={isActive ? "secondary" : "ghost"}
              size="sm"
              onClick={() => onSelect(q.key)}
              className="h-9"
              aria-current={isActive ? "page" : undefined}
            >
              <Icon className="h-4 w-4 mr-1.5" aria-hidden="true" />
              {q.label}
            </Button>
          );
        })}
      </nav>

      <CommandDialog
        open={open}
        onOpenChange={(v) => { setOpen(v); if (!v) setQuery(""); }}
        title="Global search"
        description="Search across users, assessments, reports, and admin sections. Use arrow keys to navigate, Enter to select, Esc to close."
      >
        <CommandInput
          placeholder="Search users, assessments, reports, or sections…"
          value={query}
          onValueChange={setQuery}
          aria-label="Search query"
        />
        <CommandList aria-busy={loading}>
          <CommandEmpty>
            {query.trim().length < 2
              ? "Type at least 2 characters to search."
              : loading ? "Searching…" : "No results found."}
          </CommandEmpty>

          {userHits.length > 0 && (
            <CommandGroup heading="Users">
              {userHits.map((h) => h.kind === "user" && (
                <CommandItem
                  key={`u-${h.id}`}
                  value={`user ${h.name} ${h.email ?? ""}`}
                  onSelect={() => run("users")}
                >
                  <UserCheck className="h-4 w-4 mr-2" aria-hidden="true" />
                  <span className="truncate">{h.name}</span>
                  {h.email && <span className="ml-2 text-xs text-muted-foreground truncate">{h.email}</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {assessmentHits.length > 0 && (
            <CommandGroup heading="Assessments">
              {assessmentHits.map((h) => h.kind === "assessment" && (
                <CommandItem
                  key={`a-${h.id}`}
                  value={`assessment ${h.name}`}
                  onSelect={() => run("questions")}
                >
                  <ListChecks className="h-4 w-4 mr-2" aria-hidden="true" />
                  <span className="truncate">{h.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {reportHits.length > 0 && (
            <CommandGroup heading="Reports">
              {reportHits.map((h) => h.kind === "report" && (
                <CommandItem
                  key={`r-${h.id}`}
                  value={`report ${h.name}`}
                  onSelect={() => run("scores")}
                >
                  <FileText className="h-4 w-4 mr-2" aria-hidden="true" />
                  <span className="truncate">{h.name}</span>
                  {h.percentage != null && (
                    <span className="ml-2 text-xs text-muted-foreground">{Math.round(h.percentage)}%</span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {(userHits.length > 0 || assessmentHits.length > 0 || reportHits.length > 0) && <CommandSeparator />}

          <CommandGroup heading="Quick links">
            {quickLinks.map((q) => {
              const Icon = q.icon;
              return (
                <CommandItem key={q.key} value={`quick ${q.label}`} onSelect={() => run(q.key)}>
                  <Icon className="h-4 w-4 mr-2" aria-hidden="true" />
                  {q.label}
                </CommandItem>
              );
            })}
          </CommandGroup>
          <CommandSeparator />
          {Object.entries(grouped).map(([group, items]) => (
            <CommandGroup key={group} heading={group}>
              {items.map((e) => {
                const Icon = e.icon;
                return (
                  <CommandItem
                    key={e.key}
                    value={`${e.label} ${e.group} ${e.keywords ?? ""}`}
                    onSelect={() => run(e.key)}
                  >
                    <Icon className="h-4 w-4 mr-2" aria-hidden="true" />
                    {e.label}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          ))}

          {loading && (
            <div className="flex items-center justify-center py-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 mr-2 animate-spin" aria-hidden="true" /> Searching…
            </div>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
