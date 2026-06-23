import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Pencil, Trash2, Network, Search, ListPlus } from "lucide-react";
import { toast } from "@/components/ui/sonner";

type Org = { id: string; name: string };
type Dept = { id: string; organization_id: string; name: string; code: string | null };
type Question = { id: string; question_text: string };

export function DepartmentsTab() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [depts, setDepts] = useState<Dept[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [assignCounts, setAssignCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const [q, setQ] = useState("");
  const [orgFilter, setOrgFilter] = useState<string>("all");

  // CRUD dialog
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Dept | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [orgId, setOrgId] = useState<string>("");
  const [saving, setSaving] = useState(false);

  // Safe-delete dialog state
  const [delTarget, setDelTarget] = useState<Dept | null>(null);
  const [delBusy, setDelBusy] = useState(false);
  const [delMode, setDelMode] = useState<"remove" | "reassign">("remove");
  const [delReassignTo, setDelReassignTo] = useState<string>("");
  const [delAssignmentIds, setDelAssignmentIds] = useState<string[]>([]);

  // Assign-questions dialog state
  const [assignTarget, setAssignTarget] = useState<Dept | null>(null);
  const [assignBusy, setAssignBusy] = useState(false);
  const [assignedSet, setAssignedSet] = useState<Set<string>>(new Set());
  const [assignSearch, setAssignSearch] = useState("");
  const [assignSelected, setAssignSelected] = useState<Set<string>>(new Set());

  const load = async () => {
    setLoading(true);
    const [o, d, a, qs] = await Promise.all([
      supabase.from("organizations").select("id,name").eq("active", true).order("name"),
      supabase.from("departments").select("id,organization_id,name,code").order("name"),
      supabase.from("question_assignments").select("department_id").eq("scope", "department"),
      supabase.from("questions").select("id,question_text").order("sort_order"),
    ]);
    if (o.error) toast.error(o.error.message); else setOrgs((o.data ?? []) as Org[]);
    if (d.error) toast.error(d.error.message); else setDepts((d.data ?? []) as Dept[]);
    if (qs.error) toast.error(qs.error.message); else setQuestions((qs.data ?? []) as Question[]);
    if (!a.error) {
      const counts: Record<string, number> = {};
      for (const row of (a.data ?? []) as { department_id: string | null }[]) {
        if (row.department_id) counts[row.department_id] = (counts[row.department_id] ?? 0) + 1;
      }
      setAssignCounts(counts);
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const orgMap = useMemo(() => new Map(orgs.map((o) => [o.id, o.name])), [orgs]);

  const reset = () => { setEditing(null); setName(""); setCode(""); setOrgId(orgs[0]?.id ?? ""); };
  const openAdd = () => { reset(); setOpen(true); };
  const openEdit = (d: Dept) => {
    setEditing(d); setName(d.name); setCode(d.code ?? ""); setOrgId(d.organization_id); setOpen(true);
  };

  const save = async () => {
    const n = name.trim();
    if (!n) return toast.error("Name is required.");
    if (!orgId) return toast.error("Organization is required.");
    setSaving(true);
    const payload = { name: n, code: code.trim() || null, organization_id: orgId };
    const { error } = editing
      ? await supabase.from("departments").update(payload).eq("id", editing.id)
      : await supabase.from("departments").insert(payload);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(editing ? "Department updated" : "Department added");
    setOpen(false); reset(); load();
  };

  const openDelete = async (d: Dept) => {
    setDelTarget(d);
    setDelMode("remove");
    setDelReassignTo("");
    setDelAssignmentIds([]);
    const { data, error } = await supabase
      .from("question_assignments")
      .select("id")
      .eq("scope", "department")
      .eq("department_id", d.id);
    if (error) { toast.error(error.message); return; }
    setDelAssignmentIds((data ?? []).map((r: any) => r.id));
  };

  const confirmDelete = async () => {
    if (!delTarget) return;
    setDelBusy(true);
    try {
      if (delAssignmentIds.length > 0 && delMode === "reassign") {
        if (!delReassignTo) { toast.error("Pick a department to reassign questions to."); return; }
        const { error: ue } = await supabase
          .from("question_assignments")
          .update({ department_id: delReassignTo })
          .in("id", delAssignmentIds);
        if (ue) { toast.error(ue.message); return; }
      }
      // "remove" mode: CASCADE on FK will delete the assignments automatically
      const { error } = await supabase.from("departments").delete().eq("id", delTarget.id);
      if (error) { toast.error(error.message); return; }
      toast.success(
        delAssignmentIds.length > 0 && delMode === "reassign"
          ? `Reassigned ${delAssignmentIds.length} question${delAssignmentIds.length === 1 ? "" : "s"} and deleted department`
          : "Department deleted",
      );
      setDelTarget(null);
      load();
    } finally {
      setDelBusy(false);
    }
  };

  const openAssign = async (d: Dept) => {
    setAssignTarget(d);
    setAssignSearch("");
    setAssignSelected(new Set());
    const { data, error } = await supabase
      .from("question_assignments")
      .select("question_id")
      .eq("scope", "department")
      .eq("department_id", d.id);
    if (error) { toast.error(error.message); return; }
    setAssignedSet(new Set((data ?? []).map((r: any) => r.question_id)));
  };

  const toggleAssignSelected = (id: string) =>
    setAssignSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const applyAssignChanges = async (action: "assign" | "unassign") => {
    if (!assignTarget) return;
    const ids = Array.from(assignSelected);
    if (!ids.length) return toast.error("Select at least one question.");
    setAssignBusy(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (action === "assign") {
        const toInsert = ids
          .filter((qid) => !assignedSet.has(qid))
          .map((qid) => ({
            question_id: qid,
            scope: "department" as const,
            organization_id: null,
            department_id: assignTarget.id,
            applicant_id: null,
            assigned_by: u.user?.id ?? null,
          }));
        if (!toInsert.length) { toast.message("All selected are already assigned."); return; }
        const { error } = await supabase.from("question_assignments").insert(toInsert);
        if (error) { toast.error(error.message); return; }
        toast.success(`Assigned ${toInsert.length} question${toInsert.length === 1 ? "" : "s"} to ${assignTarget.name}`);
      } else {
        const toRemove = ids.filter((qid) => assignedSet.has(qid));
        if (!toRemove.length) { toast.message("None of the selected questions are assigned."); return; }
        const { error } = await supabase
          .from("question_assignments")
          .delete()
          .eq("scope", "department")
          .eq("department_id", assignTarget.id)
          .in("question_id", toRemove);
        if (error) { toast.error(error.message); return; }
        toast.success(`Unassigned ${toRemove.length} question${toRemove.length === 1 ? "" : "s"}`);
      }
      // refresh local assigned set & dept counts
      const { data } = await supabase
        .from("question_assignments")
        .select("question_id")
        .eq("scope", "department")
        .eq("department_id", assignTarget.id);
      setAssignedSet(new Set((data ?? []).map((r: any) => r.question_id)));
      setAssignSelected(new Set());
      load();
    } finally {
      setAssignBusy(false);
    }
  };


  const filtered = depts.filter((d) => {
    if (orgFilter !== "all" && d.organization_id !== orgFilter) return false;
    if (!q.trim()) return true;
    const s = q.toLowerCase();
    return d.name.toLowerCase().includes(s)
      || (d.code ?? "").toLowerCase().includes(s)
      || (orgMap.get(d.organization_id) ?? "").toLowerCase().includes(s);
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Departments</h3>
          <p className="text-sm text-muted-foreground">
            Manage departments inside each organization. Assign questions to a department from the Assignments tab.
          </p>
        </div>
        <Button onClick={openAdd} disabled={orgs.length === 0}>
          <Plus className="h-4 w-4 mr-1" /> Add department
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
          <CardTitle className="text-base">
            {loading ? "Loading…" : `${filtered.length} of ${depts.length} departments`}
          </CardTitle>
          <div className="flex gap-2 flex-1 sm:max-w-md">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, code, org…" className="pl-8" />
            </div>
            <Select value={orgFilter} onValueChange={setOrgFilter}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All organizations</SelectItem>
                {orgs.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Department</TableHead>
                <TableHead>Organization</TableHead>
                <TableHead className="w-24">Code</TableHead>
                <TableHead className="w-32">Assignments</TableHead>
                <TableHead className="w-44 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!loading && filtered.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  {orgs.length === 0 ? "Create an organization first." : "No departments match."}
                </TableCell></TableRow>
              )}
              {filtered.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium flex items-center gap-2">
                    <Network className="h-4 w-4 text-muted-foreground" /> {d.name}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{orgMap.get(d.organization_id) ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{d.code ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={assignCounts[d.id] ? "secondary" : "outline"}>
                      {assignCounts[d.id] ?? 0} question{(assignCounts[d.id] ?? 0) === 1 ? "" : "s"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <Button variant="ghost" size="sm" onClick={() => openAssign(d)} title="Assign questions">
                      <ListPlus className="h-4 w-4 mr-1" /> Assign
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => openEdit(d)} aria-label="Edit"><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => openDelete(d)} aria-label="Delete"><Trash2 className="h-4 w-4" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit department" : "Add department"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Organization *</Label>
              <Select value={orgId} onValueChange={setOrgId}>
                <SelectTrigger><SelectValue placeholder="Select organization" /></SelectTrigger>
                <SelectContent>
                  {orgs.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Recruitment" />
            </div>
            <div className="space-y-1.5">
              <Label>Code (optional)</Label>
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. REC" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
              <Button onClick={save} disabled={saving}>{saving ? "Saving…" : editing ? "Update" : "Add"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!delTarget} onOpenChange={(o) => !o && setDelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this department?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                {delTarget && (
                  <p>
                    You are about to delete <strong>{delTarget.name}</strong>
                    {orgMap.get(delTarget.organization_id) ? <> in {orgMap.get(delTarget.organization_id)}</> : null}.
                    This also unlinks applicants currently assigned to this department.
                  </p>
                )}
                {delTarget && delAssignmentIds.length === 0 ? (
                  <div className="rounded-md border bg-muted/40 p-2 text-xs">No question assignments are linked — safe to delete.</div>
                ) : delTarget ? (
                  <>
                    <div className="rounded-md border bg-muted/40 p-2 text-xs">
                      <strong className="text-foreground">{delAssignmentIds.length}</strong> question assignment{delAssignmentIds.length === 1 ? "" : "s"} are linked to this department.
                    </div>
                    <div className="space-y-2">
                      <label className="flex items-start gap-2">
                        <input type="radio" className="mt-1" checked={delMode === "remove"} onChange={() => setDelMode("remove")} />
                        <span><strong className="text-foreground">Remove assignments</strong> — delete the {delAssignmentIds.length} linked question assignment{delAssignmentIds.length === 1 ? "" : "s"}.</span>
                      </label>
                      <label className="flex items-start gap-2">
                        <input
                          type="radio"
                          className="mt-1"
                          checked={delMode === "reassign"}
                          onChange={() => setDelMode("reassign")}
                          disabled={depts.filter((x) => x.organization_id === delTarget.organization_id && x.id !== delTarget.id).length === 0}
                        />
                        <span>
                          <strong className="text-foreground">Reassign to another department</strong> in the same organization:
                          <div className="mt-1.5 max-w-xs">
                            <Select value={delReassignTo} onValueChange={(v) => { setDelReassignTo(v); setDelMode("reassign"); }}>
                              <SelectTrigger><SelectValue placeholder="Pick a department" /></SelectTrigger>
                              <SelectContent>
                                {depts
                                  .filter((x) => x.organization_id === delTarget.organization_id && x.id !== delTarget.id)
                                  .map((x) => <SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                          {depts.filter((x) => x.organization_id === delTarget.organization_id && x.id !== delTarget.id).length === 0 && (
                            <div className="text-xs text-muted-foreground mt-1">No other departments exist in this organization.</div>
                          )}
                        </span>
                      </label>
                    </div>
                  </>
                ) : null}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={delBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); confirmDelete(); }}
              disabled={delBusy || (delMode === "reassign" && !delReassignTo)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {delBusy ? "Working…" : "Delete department"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!assignTarget} onOpenChange={(o) => { if (!o) { setAssignTarget(null); setAssignSelected(new Set()); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Assign questions to {assignTarget?.name}</DialogTitle>
          </DialogHeader>
          {assignTarget && (
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={assignSearch}
                  onChange={(e) => setAssignSearch(e.target.value)}
                  placeholder="Search questions…"
                  className="pl-8"
                />
              </div>
              <div className="border rounded-md max-h-80 overflow-y-auto divide-y">
                {questions.length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">No questions in the bank yet.</div>
                ) : (() => {
                  const list = questions.filter((qq) =>
                    !assignSearch.trim() || qq.question_text.toLowerCase().includes(assignSearch.toLowerCase()),
                  );
                  if (list.length === 0) {
                    return <div className="p-6 text-center text-sm text-muted-foreground">No questions match.</div>;
                  }
                  return list.map((qq) => {
                    const isAssigned = assignedSet.has(qq.id);
                    return (
                      <label key={qq.id} className="flex items-start gap-3 p-2.5 hover:bg-muted/40 cursor-pointer">
                        <Checkbox
                          className="mt-0.5"
                          checked={assignSelected.has(qq.id)}
                          onCheckedChange={() => toggleAssignSelected(qq.id)}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm truncate">{qq.question_text}</div>
                          {isAssigned && (
                            <Badge variant="secondary" className="mt-1 text-[10px]">Already assigned</Badge>
                          )}
                        </div>
                      </label>
                    );
                  });
                })()}
              </div>
              <div className="flex items-center justify-between gap-2 pt-1">
                <div className="text-xs text-muted-foreground">
                  {assignSelected.size} selected · {assignedSet.size} currently assigned
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" disabled={assignBusy || assignSelected.size === 0} onClick={() => applyAssignChanges("unassign")}>
                    Unassign
                  </Button>
                  <Button disabled={assignBusy || assignSelected.size === 0} onClick={() => applyAssignChanges("assign")}>
                    <Plus className="h-4 w-4 mr-1" /> Assign
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
