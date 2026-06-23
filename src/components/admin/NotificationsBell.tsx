import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Bell, CheckCheck, Filter, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";

type Activity = {
  id: string;
  type: "login" | "registration" | "completion" | "approval" | "upload" | "audit";
  title: string;
  detail: string;
  created_at: string;
};

const TYPE_LABEL: Record<Activity["type"], string> = {
  login: "Logins",
  registration: "New registrations",
  completion: "Completed tests",
  approval: "Approvals",
  upload: "Uploads",
  audit: "Admin actions",
};

const LS_KEY = "admin_notifications_last_read";

export function NotificationsBell() {
  const [items, setItems] = useState<Activity[]>([]);
  const [open, setOpen] = useState(false);
  const [filters, setFilters] = useState<Record<Activity["type"], boolean>>({
    login: true, registration: true, completion: true, approval: true, upload: true, audit: true,
  });
  const [lastRead, setLastRead] = useState<number>(() => Number(localStorage.getItem(LS_KEY) ?? 0));
  const [purgeOpen, setPurgeOpen] = useState(false);
  const [purgeAge, setPurgeAge] = useState<"7" | "30" | "90" | "all">("30");
  const [purging, setPurging] = useState(false);

  const load = async () => {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const [logins, applicants, results, audit, snaps] = await Promise.all([
      supabase.from("login_activity").select("id, email, event, created_at, ip").gte("created_at", since).order("created_at", { ascending: false }).limit(40),
      supabase.from("applicants").select("id, full_name, email, status, created_at, updated_at").is("deleted_at", null).order("created_at", { ascending: false }).limit(40),
      supabase.from("test_results").select("id, applicant_name, percentage, completed_at").gte("completed_at", since).order("completed_at", { ascending: false }).limit(40),
      supabase.from("admin_audit_log").select("id, action, admin_email, created_at").gte("created_at", since).order("created_at", { ascending: false }).limit(40),
      supabase.from("proctoring_snapshots").select("id, created_at, applicant_id").gte("created_at", since).order("created_at", { ascending: false }).limit(40),
    ]);

    const feed: Activity[] = [];
    (logins.data ?? []).forEach((r: any) => feed.push({
      id: `login-${r.id}`, type: "login",
      title: r.event === "login_success" ? "User signed in" : r.event.replace(/_/g, " "),
      detail: `${r.email ?? "Unknown"} · ${r.ip ?? "unknown IP"}`,
      created_at: r.created_at,
    }));
    (applicants.data ?? []).forEach((r: any) => {
      feed.push({
        id: `reg-${r.id}`, type: "registration",
        title: "New applicant registered",
        detail: `${r.full_name}${r.email ? ` · ${r.email}` : ""}`,
        created_at: r.created_at,
      });
      if (r.status === "approved" && r.updated_at && r.updated_at !== r.created_at) {
        feed.push({
          id: `app-${r.id}`, type: "approval",
          title: "Applicant approved",
          detail: r.full_name,
          created_at: r.updated_at,
        });
      }
    });
    (results.data ?? []).forEach((r: any) => feed.push({
      id: `res-${r.id}`, type: "completion",
      title: "Test completed",
      detail: `${r.applicant_name} — ${Number(r.percentage ?? 0).toFixed(0)}%`,
      created_at: r.completed_at,
    }));
    (audit.data ?? []).forEach((r: any) => feed.push({
      id: `aud-${r.id}`, type: "audit",
      title: `Admin: ${r.action.replace(/_/g, " ")}`,
      detail: r.admin_email ?? "admin",
      created_at: r.created_at,
    }));
    (snaps.data ?? []).forEach((r: any) => feed.push({
      id: `snap-${r.id}`, type: "upload",
      title: "Proctor snapshot uploaded",
      detail: r.applicant_id?.slice(0, 8) ?? "",
      created_at: r.created_at,
    }));

    feed.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    setItems(feed.slice(0, 100));
  };

  useEffect(() => {
    load();
    const i = setInterval(load, 60_000);
    return () => clearInterval(i);
  }, []);

  const filtered = useMemo(() => items.filter((i) => filters[i.type]), [items, filters]);
  const unreadCount = useMemo(
    () => filtered.filter((i) => new Date(i.created_at).getTime() > lastRead).length,
    [filtered, lastRead],
  );

  const markAllRead = () => {
    const now = Date.now();
    localStorage.setItem(LS_KEY, String(now));
    setLastRead(now);
  };

  const runPurge = async () => {
    setPurging(true);
    const days = purgeAge === "all" ? 0 : Number(purgeAge);
    const before = purgeAge === "all"
      ? new Date().toISOString()
      : new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase.rpc("notifications_purge", { _before: before });
    setPurging(false);
    setPurgeOpen(false);
    if (error) return toast.error(error.code === "42501" ? "Admins only." : error.message);
    const d = data as { logins?: number; audit?: number } | null;
    toast.success(`Purged ${(d?.logins ?? 0) + (d?.audit ?? 0)} notification records`);
    markAllRead();
    load();
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Notifications" className="relative">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold flex items-center justify-center">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[360px] p-0" align="end">
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <div className="text-sm font-semibold">Notifications</div>
          <div className="flex items-center gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Filter">
                  <Filter className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                {(Object.keys(TYPE_LABEL) as Activity["type"][]).map((t) => (
                  <DropdownMenuCheckboxItem
                    key={t}
                    checked={filters[t]}
                    onCheckedChange={(c) => setFilters((f) => ({ ...f, [t]: !!c }))}
                  >
                    {TYPE_LABEL[t]}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={markAllRead}>
              <CheckCheck className="h-3.5 w-3.5 mr-1" /> Mark read
            </Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:text-destructive" onClick={() => setPurgeOpen(true)}>
              <Trash2 className="h-3.5 w-3.5 mr-1" /> Purge
            </Button>
          </div>
        </div>
        <ScrollArea className="max-h-[420px]">
          {filtered.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">No activity yet.</div>
          ) : (
            <ul className="divide-y">
              {filtered.map((n) => {
                const unread = new Date(n.created_at).getTime() > lastRead;
                return (
                  <li key={n.id} className={`p-3 text-sm ${unread ? "bg-primary/5" : ""}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{n.title}</p>
                        <p className="text-xs text-muted-foreground truncate">{n.detail}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <Badge variant="outline" className="text-[10px] capitalize">{n.type}</Badge>
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(n.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>

      <AlertDialog open={purgeOpen} onOpenChange={setPurgeOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Purge notification history?</AlertDialogTitle>
            <AlertDialogDescription>
              Permanently deletes login activity and admin audit records older than the chosen cutoff. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <p className="text-sm font-medium">Delete records older than</p>
            <Select value={purgeAge} onValueChange={(v) => setPurgeAge(v as typeof purgeAge)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 days</SelectItem>
                <SelectItem value="30">30 days</SelectItem>
                <SelectItem value="90">90 days</SelectItem>
                <SelectItem value="all">Everything (purge all)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={runPurge} disabled={purging} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {purging ? "Purging…" : "Purge"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Popover>
  );
}
