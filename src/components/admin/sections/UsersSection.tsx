import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusPill } from "../StatCard";
import { toast } from "@/components/ui/sonner";
import { Search, Check, X, Ban, RotateCcw, LinkIcon, RefreshCw, Copy, Plus, UserPlus, Pencil, Trash2, Users as UsersIcon } from "lucide-react";
import { runAdminAction } from "@/lib/adminAction";
import { permissionsFor, APPLICANT_STATUSES, type ApplicantStatus } from "@/lib/permissions";

type Applicant = {
  id: string; full_name: string; email: string; phone: string | null;
  status: string; attempts_used: number; link_expires_at: string | null;
  link_token: string | null;
  created_at: string; notes: string | null;
  organization_id: string | null; department_id: string | null;
};
type Org = { id: string; name: string };
type Dept = { id: string; organization_id: string; name: string };

interface Props { initialStatus?: string; expiredOnly?: boolean }

export function UsersSection({ initialStatus, expiredOnly }: Props) {
  const [rows, setRows] = useState<Applicant[]>([]);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [depts, setDepts] = useState<Dept[]>([]);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>(initialStatus ?? "all");
  const [loading, setLoading] = useState(true);

  // Add-user dialog state
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    full_name: "", email: "", phone: "",
    gender: "" as "" | "male" | "female" | "other" | "prefer_not_to_say",
    organization_id: "" as string,
    department_id: "" as string,
    status: "approved" as "pending" | "approved" | "rejected" | "suspended",
  });

  // Bulk selection state
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkStatusOpen, setBulkStatusOpen] = useState(false);
  const [bulkDeptOpen, setBulkDeptOpen] = useState(false);
  const [bulkStatus, setBulkStatus] = useState<ApplicantStatus>("approved");
  const [bulkOrgId, setBulkOrgId] = useState<string>("");
  const [bulkDeptId, setBulkDeptId] = useState<string>("");
  const [bulkBusy, setBulkBusy] = useState(false);

  const toggleOne = (id: string) =>
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const clearSelection = () => setSelected(new Set());

  const applyBulkStatus = async () => {
    const ids = Array.from(selected);
    if (!ids.length) return;
    setBulkBusy(true);
    const { error } = await supabase.from("applicants").update({ status: bulkStatus } as any).in("id", ids);
    setBulkBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`Updated ${ids.length} user${ids.length === 1 ? "" : "s"} to ${permissionsFor(bulkStatus).label}`);
    setBulkStatusOpen(false);
    clearSelection();
    load();
  };

  const applyBulkDept = async () => {
    const ids = Array.from(selected);
    if (!ids.length) return;
    setBulkBusy(true);
    const { error } = await supabase
      .from("applicants")
      .update({
        organization_id: bulkOrgId || null,
        department_id: bulkDeptId || null,
      } as any)
      .in("id", ids);
    setBulkBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`Reassigned ${ids.length} user${ids.length === 1 ? "" : "s"}`);
    setBulkDeptOpen(false);
    clearSelection();
    load();
  };

  // Bulk delete state
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkAttemptCounts, setBulkAttemptCounts] = useState<{ submitted: number; users: number } | null>(null);
  const [bulkDeleteForce, setBulkDeleteForce] = useState(false);

  const openBulkDelete = async () => {
    const ids = Array.from(selected);
    if (!ids.length) return;
    setBulkDeleteForce(false);
    setBulkAttemptCounts(null);
    setBulkDeleteOpen(true);
    // Safety check: count submitted attempts across the selection
    const { data, error } = await supabase
      .from("test_attempts")
      .select("applicant_id, submitted_at")
      .in("applicant_id", ids)
      .not("submitted_at", "is", null);
    if (error) { toast.error(error.message); return; }
    const userSet = new Set((data ?? []).map((r: any) => r.applicant_id));
    setBulkAttemptCounts({ submitted: (data ?? []).length, users: userSet.size });
  };

  const applyBulkDelete = async () => {
    const ids = Array.from(selected);
    if (!ids.length) return;
    // Status-safe check: refuse to delete approved users mid-attempt (locked link = active attempt window)
    const now = new Date();
    const activeLocked = rows.filter(
      (r) => ids.includes(r.id) && r.link_expires_at && new Date(r.link_expires_at) > now && r.status === "approved",
    );
    if (activeLocked.length && !bulkDeleteForce) {
      toast.error(
        `${activeLocked.length} user${activeLocked.length === 1 ? " is" : "s are"} currently in a locked attempt window. Tick "force" to proceed.`,
      );
      return;
    }
    if ((bulkAttemptCounts?.submitted ?? 0) > 0 && !bulkDeleteForce) {
      toast.error(`This will erase ${bulkAttemptCounts!.submitted} submitted test result${bulkAttemptCounts!.submitted === 1 ? "" : "s"}. Tick "force" to proceed.`);
      return;
    }
    setBulkBusy(true);
    let firstError: string | null = null;
    for (const id of ids) {
      const { error } = await supabase.rpc("recycle_soft_delete", { _table: "applicants", _id: id });
      if (error && !firstError) firstError = error.message;
    }
    setBulkBusy(false);
    if (firstError) return toast.error(firstError);
    toast.success(`Moved ${ids.length} user${ids.length === 1 ? "" : "s"} to Recycle Bin`);
    setBulkDeleteOpen(false);
    clearSelection();
    load();
  };

  // Edit-user dialog state
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<Applicant | null>(null);
  const [editForm, setEditForm] = useState({
    full_name: "", phone: "",
    organization_id: "" as string,
    department_id: "" as string,
    status: "approved" as ApplicantStatus,
  });

  // Delete confirm state
  const [toDelete, setToDelete] = useState<Applicant | null>(null);
  const [deleting, setDeleting] = useState(false);

  const openEdit = (r: Applicant) => {
    setEditing(r);
    setEditForm({
      full_name: r.full_name,
      phone: r.phone ?? "",
      organization_id: r.organization_id ?? "",
      department_id: r.department_id ?? "",
      status: (r.status as ApplicantStatus) ?? "pending",
    });
    setEditOpen(true);
  };

  const submitEdit = async () => {
    if (!editing) return;
    const name = editForm.full_name.trim();
    if (!name) return toast.error("Full name is required");
    setSaving(true);
    const { error } = await supabase
      .from("applicants")
      .update({
        full_name: name,
        phone: editForm.phone.trim() || null,
        organization_id: editForm.organization_id || null,
        department_id: editForm.department_id || null,
        status: editForm.status,
      } as any)
      .eq("id", editing.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("User updated", { description: permissionsFor(editForm.status).description });
    setEditOpen(false);
    setEditing(null);
    load();
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    const { error } = await supabase.rpc("recycle_soft_delete", { _table: "applicants", _id: toDelete.id });
    setDeleting(false);
    if (error) return toast.error(error.message);
    toast.success(`Moved ${toDelete.full_name} to Recycle Bin`);
    setToDelete(null);
    load();
  };

  const load = async () => {
    setLoading(true);
    const [a, o, d] = await Promise.all([
      supabase.from("applicants").select("*").is("deleted_at", null).order("created_at", { ascending: false }),
      supabase.from("organizations").select("id,name").eq("active", true).order("name"),
      supabase.from("departments").select("id,organization_id,name").order("name"),
    ]);
    setRows((a.data ?? []) as Applicant[]);
    setOrgs((o.data ?? []) as Org[]);
    setDepts((d.data ?? []) as Dept[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const act = async (id: string, action: string) => {
    const { data, error } = await runAdminAction(id, action);
    if (error) { toast.error(error.message); return; }
    if (action === "regenerate_link") {
      const token = (data as any)?.metadata?.new_link_token;
      if (token) {
        const url = `${window.location.origin}/test?token=${token}`;
        try { await navigator.clipboard.writeText(url); } catch {}
        toast.success("Fresh test URL generated & copied", { description: url });
      } else {
        toast.success("Link regenerated");
      }
    } else {
      toast.success(`Action "${action.replace(/_/g, " ")}" applied`);
    }
    load();
  };

  const copyLink = async (token: string | null) => {
    if (!token) { toast.error("No link token"); return; }
    const url = `${window.location.origin}/test?token=${token}`;
    try { await navigator.clipboard.writeText(url); toast.success("Test URL copied"); }
    catch { toast.error("Copy failed"); }
  };

  const resetForm = () => setForm({
    full_name: "", email: "", phone: "", gender: "",
    organization_id: "", department_id: "", status: "approved",
  });

  const submitAdd = async () => {
    const name = form.full_name.trim();
    const email = form.email.trim().toLowerCase();
    if (!name) return toast.error("Full name is required");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return toast.error("Valid email is required");

    setSaving(true);
    const payload: Record<string, any> = {
      full_name: name,
      email,
      phone: form.phone.trim() || null,
      gender: form.gender || null,
      organization_id: form.organization_id || null,
      department_id: form.department_id || null,
      status: form.status,
    };
    const { data, error } = await supabase.from("applicants").insert(payload as any).select("link_token").single();
    setSaving(false);
    if (error) { toast.error(error.message); return; }

    const token = (data as any)?.link_token as string | undefined;
    if (token) {
      const url = `${window.location.origin}/test?token=${token}`;
      try { await navigator.clipboard.writeText(url); } catch {}
      toast.success("User created — test link copied", { description: url });
    } else {
      toast.success("User created");
    }
    setAddOpen(false);
    resetForm();
    load();
  };

  const filtered = rows.filter((r) => {
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (expiredOnly && !(r.link_expires_at && new Date(r.link_expires_at) > new Date())) return false;
    if (!q) return true;
    const s = q.toLowerCase();
    return r.full_name.toLowerCase().includes(s) || r.email.toLowerCase().includes(s) || (r.phone ?? "").includes(s);
  });

  const filteredDepts = depts.filter((d) => !form.organization_id || d.organization_id === form.organization_id);
  const bulkDepts = depts.filter((d) => !bulkOrgId || d.organization_id === bulkOrgId);
  const visibleIds = filtered.map((r) => r.id);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const someSelected = visibleIds.some((id) => selected.has(id));
  const toggleAll = () => {
    setSelected((s) => {
      const n = new Set(s);
      if (allSelected) visibleIds.forEach((id) => n.delete(id));
      else visibleIds.forEach((id) => n.add(id));
      return n;
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            {expiredOnly ? "Expired Links" : initialStatus === "pending" ? "Pending Approvals" : "Users"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {expiredOnly
              ? "Applicants whose test link is currently locked. Approve to reset their 24h cooldown."
              : "All registered applicants with status, attempts, and login info."}
          </p>
        </div>
        {!expiredOnly && (
          <Button onClick={() => setAddOpen(true)} className="self-start sm:self-auto">
            <UserPlus className="h-4 w-4 mr-1" /> Add user
          </Button>
        )}
      </div>

      {selected.size > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-md border bg-muted/40 px-3 py-2">
          <div className="text-sm font-medium flex items-center gap-2">
            <UsersIcon className="h-4 w-4" /> {selected.size} selected
          </div>
          <div className="flex flex-wrap gap-2 sm:ml-auto">
            <Button size="sm" variant="outline" onClick={() => setBulkStatusOpen(true)}>
              Change status
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setBulkOrgId(""); setBulkDeptId(""); setBulkDeptOpen(true); }}>
              Reassign org / dept
            </Button>
            <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={openBulkDelete}>
              <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
            </Button>
            <Button size="sm" variant="ghost" onClick={clearSelection}>Clear</Button>
          </div>
        </div>
      )}


      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
          <CardTitle className="text-base">{filtered.length} {filtered.length === 1 ? "user" : "users"}</CardTitle>
          <div className="flex gap-2 flex-1 sm:max-w-md">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, phone…" className="pl-8" />
            </div>
            {!expiredOnly && !initialStatus && (
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    aria-label="Select all"
                    checked={allSelected ? true : someSelected ? "indeterminate" : false}
                    onCheckedChange={toggleAll}
                  />
                </TableHead>
                <TableHead>Applicant</TableHead>
                <TableHead className="hidden md:table-cell">Phone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Attempts</TableHead>
                <TableHead className="hidden lg:table-cell">Link</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No users match.</TableCell></TableRow>
              ) : filtered.map((r) => {
                const locked = r.link_expires_at && new Date(r.link_expires_at) > new Date();
                return (
                  <TableRow key={r.id} data-state={selected.has(r.id) ? "selected" : undefined}>
                    <TableCell>
                      <Checkbox
                        aria-label={`Select ${r.full_name}`}
                        checked={selected.has(r.id)}
                        onCheckedChange={() => toggleOne(r.id)}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{r.full_name}</div>
                      <div className="text-xs text-muted-foreground">{r.email}</div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm">{r.phone ?? "—"}</TableCell>
                    <TableCell><StatusPill status={r.status} /></TableCell>
                    <TableCell className="text-sm">{r.attempts_used} / 3</TableCell>
                    <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                      {locked ? `Locked until ${new Date(r.link_expires_at!).toLocaleString()}` : "Open"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end flex-wrap">
                        {r.status !== "approved" && (
                          <Button size="sm" variant="outline" onClick={() => act(r.id, "approve")} title="Approve">
                            <Check className="h-3.5 w-3.5 text-success" />
                          </Button>
                        )}
                        {r.status !== "rejected" && (
                          <Button size="sm" variant="outline" onClick={() => act(r.id, "reject")} title="Reject">
                            <X className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        )}
                        {r.status !== "suspended" && (
                          <Button size="sm" variant="outline" onClick={() => act(r.id, "suspend")} title="Suspend">
                            <Ban className="h-3.5 w-3.5 text-warning" />
                          </Button>
                        )}
                        <Button size="sm" variant="outline" onClick={() => act(r.id, "reset_attempts")} title="Reset attempts">
                          <RotateCcw className="h-3.5 w-3.5 text-info" />
                        </Button>
                        {locked && (
                          <Button size="sm" variant="outline" onClick={() => act(r.id, "approve_link")} title="Approve expired link (clear lock)">
                            <LinkIcon className="h-3.5 w-3.5 text-violet" />
                          </Button>
                        )}
                        <Button size="sm" variant="outline" onClick={() => act(r.id, "regenerate_link")} title="Regenerate fresh test URL">
                          <RefreshCw className="h-3.5 w-3.5 text-pink" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => copyLink(r.link_token)} title="Copy current test URL">
                          <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => openEdit(r)} title="Edit user">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setToDelete(r)} title="Delete user">
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={addOpen} onOpenChange={(o) => { setAddOpen(o); if (!o) resetForm(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add user</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Full name *</Label>
                <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="Jane Doe" />
              </div>
              <div className="space-y-1.5">
                <Label>Email *</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="jane@example.com" />
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Gender</Label>
                <Select value={form.gender || "unset"} onValueChange={(v) => setForm({ ...form, gender: v === "unset" ? "" : v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unset">Not specified</SelectItem>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                    <SelectItem value="prefer_not_to_say">Prefer not to say</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Organization</Label>
                <Select
                  value={form.organization_id || "none"}
                  onValueChange={(v) => setForm({ ...form, organization_id: v === "none" ? "" : v, department_id: "" })}
                >
                  <SelectTrigger><SelectValue placeholder="Select organization" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— None —</SelectItem>
                    {orgs.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Department</Label>
                <Select
                  value={form.department_id || "none"}
                  onValueChange={(v) => setForm({ ...form, department_id: v === "none" ? "" : v })}
                  disabled={!form.organization_id}
                >
                  <SelectTrigger><SelectValue placeholder={form.organization_id ? "Select department" : "Pick organization first"} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— None —</SelectItem>
                    {filteredDepts.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Initial status (permission)</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as any })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {APPLICANT_STATUSES.map((s) => {
                    const p = permissionsFor(s);
                    return <SelectItem key={s} value={s}>{p.label} — {p.description}</SelectItem>;
                  })}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                A unique test link is generated automatically and copied to your clipboard.
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setAddOpen(false)} disabled={saving}>Cancel</Button>
              <Button onClick={submitAdd} disabled={saving}>
                <Plus className="h-4 w-4 mr-1" /> {saving ? "Creating…" : "Create user"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={(o) => { setEditOpen(o); if (!o) setEditing(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit user</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="grid gap-3">
              <div className="text-xs text-muted-foreground">{editing.email}</div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Full name *</Label>
                  <Input value={editForm.full_name} onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Phone</Label>
                  <Input value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} />
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Organization</Label>
                  <Select
                    value={editForm.organization_id || "none"}
                    onValueChange={(v) => setEditForm({ ...editForm, organization_id: v === "none" ? "" : v, department_id: "" })}
                  >
                    <SelectTrigger><SelectValue placeholder="Select organization" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— None —</SelectItem>
                      {orgs.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Department</Label>
                  <Select
                    value={editForm.department_id || "none"}
                    onValueChange={(v) => setEditForm({ ...editForm, department_id: v === "none" ? "" : v })}
                    disabled={!editForm.organization_id}
                  >
                    <SelectTrigger><SelectValue placeholder={editForm.organization_id ? "Select department" : "Pick organization first"} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— None —</SelectItem>
                      {depts.filter((d) => d.organization_id === editForm.organization_id).map((d) => (
                        <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Status (permissions)</Label>
                <Select value={editForm.status} onValueChange={(v) => setEditForm({ ...editForm, status: v as ApplicantStatus })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {APPLICANT_STATUSES.map((s) => {
                      const p = permissionsFor(s);
                      return <SelectItem key={s} value={s}>{p.label} — {p.description}</SelectItem>;
                    })}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{permissionsFor(editForm.status).description}</p>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setEditOpen(false)} disabled={saving}>Cancel</Button>
                <Button onClick={submitEdit} disabled={saving}>
                  {saving ? "Saving…" : "Save changes"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this user?</AlertDialogTitle>
            <AlertDialogDescription>
              {toDelete && (
                <>This permanently removes <strong>{toDelete.full_name}</strong> ({toDelete.email}) and all of their attempts, results, login history, and proctoring snapshots. This cannot be undone.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting…" : "Delete user"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={bulkStatusOpen} onOpenChange={setBulkStatusOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Change status for {selected.size} user{selected.size === 1 ? "" : "s"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label>New status</Label>
              <Select value={bulkStatus} onValueChange={(v) => setBulkStatus(v as ApplicantStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {APPLICANT_STATUSES.map((s) => {
                    const p = permissionsFor(s);
                    return <SelectItem key={s} value={s}>{p.label} — {p.description}</SelectItem>;
                  })}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{permissionsFor(bulkStatus).description}</p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setBulkStatusOpen(false)} disabled={bulkBusy}>Cancel</Button>
              <Button onClick={applyBulkStatus} disabled={bulkBusy}>
                {bulkBusy ? "Applying…" : `Apply to ${selected.size}`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkDeptOpen} onOpenChange={setBulkDeptOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reassign {selected.size} user{selected.size === 1 ? "" : "s"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label>Organization</Label>
              <Select
                value={bulkOrgId || "none"}
                onValueChange={(v) => { setBulkOrgId(v === "none" ? "" : v); setBulkDeptId(""); }}
              >
                <SelectTrigger><SelectValue placeholder="Select organization" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— None —</SelectItem>
                  {orgs.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Department</Label>
              <Select
                value={bulkDeptId || "none"}
                onValueChange={(v) => setBulkDeptId(v === "none" ? "" : v)}
                disabled={!bulkOrgId}
              >
                <SelectTrigger>
                  <SelectValue placeholder={bulkOrgId ? "Select department" : "Pick organization first"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— None —</SelectItem>
                  {bulkDepts.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Selecting "None" for organization will clear both organization and department on all selected users.
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setBulkDeptOpen(false)} disabled={bulkBusy}>Cancel</Button>
              <Button onClick={applyBulkDept} disabled={bulkBusy}>
                {bulkBusy ? "Applying…" : `Apply to ${selected.size}`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={bulkDeleteOpen} onOpenChange={(o) => { if (!o) { setBulkDeleteOpen(false); setBulkDeleteForce(false); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selected.size} user{selected.size === 1 ? "" : "s"}?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  This permanently removes the selected applicants and all of their attempts, results,
                  login history, and proctoring snapshots. This cannot be undone.
                </p>
                {(() => {
                  const ids = Array.from(selected);
                  const sel = rows.filter((r) => ids.includes(r.id));
                  const counts = sel.reduce<Record<string, number>>((acc, r) => {
                    acc[r.status] = (acc[r.status] ?? 0) + 1; return acc;
                  }, {});
                  const now = new Date();
                  const locked = sel.filter((r) => r.link_expires_at && new Date(r.link_expires_at) > now && r.status === "approved").length;
                  return (
                    <div className="rounded-md border bg-muted/40 p-2 space-y-1">
                      <div className="font-medium text-foreground">Selection summary</div>
                      <div className="flex flex-wrap gap-2 text-xs">
                        {Object.entries(counts).map(([s, n]) => (
                          <span key={s} className="rounded bg-background border px-1.5 py-0.5">
                            {permissionsFor(s).label}: {n}
                          </span>
                        ))}
                      </div>
                      {bulkAttemptCounts == null ? (
                        <div className="text-xs text-muted-foreground">Checking submitted results…</div>
                      ) : (
                        <div className="text-xs text-muted-foreground">
                          Submitted results that will be erased: <strong className="text-foreground">{bulkAttemptCounts.submitted}</strong>
                          {bulkAttemptCounts.submitted > 0 && <> across <strong className="text-foreground">{bulkAttemptCounts.users}</strong> user{bulkAttemptCounts.users === 1 ? "" : "s"}</>}
                        </div>
                      )}
                      {locked > 0 && (
                        <div className="text-xs text-warning">
                          ⚠ {locked} approved user{locked === 1 ? " is" : "s are"} mid-attempt (link locked).
                        </div>
                      )}
                      {(locked > 0 || (bulkAttemptCounts?.submitted ?? 0) > 0) && (
                        <label className="flex items-center gap-2 text-xs pt-1">
                          <Checkbox checked={bulkDeleteForce} onCheckedChange={(v) => setBulkDeleteForce(v === true)} />
                          Force delete anyway
                        </label>
                      )}
                    </div>
                  );
                })()}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); applyBulkDelete(); }}
              disabled={bulkBusy || bulkAttemptCounts == null}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {bulkBusy ? "Deleting…" : `Delete ${selected.size}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
