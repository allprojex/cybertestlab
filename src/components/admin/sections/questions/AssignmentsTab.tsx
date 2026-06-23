import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Link2 } from "lucide-react";
import { toast } from "@/components/ui/sonner";

type Question = { id: string; question_text: string };
type Org = { id: string; name: string };
type Dept = { id: string; name: string; organization_id: string };
type Applicant = { id: string; full_name: string; email: string | null };
type Assignment = {
  id: string;
  scope: "organization" | "department" | "user";
  question_id: string;
  organization_id: string | null;
  department_id: string | null;
  applicant_id: string | null;
  notes: string | null;
  created_at: string;
};

export function AssignmentsTab() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [depts, setDepts] = useState<Dept[]>([]);
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [items, setItems] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);

  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<"organization" | "department" | "user">("organization");
  const [questionId, setQuestionId] = useState<string>("");
  const [orgId, setOrgId] = useState<string>("");
  const [deptId, setDeptId] = useState<string>("");
  const [applicantId, setApplicantId] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [orgFilter, setOrgFilter] = useState<string>("all");
  const [deptFilter, setDeptFilter] = useState<string>("all");
  const [scopeFilter, setScopeFilter] = useState<"all" | "organization" | "department" | "user">("all");

  const [delTarget, setDelTarget] = useState<Assignment | null>(null);

  const load = async () => {
    setLoading(true);
    const [q, o, d, a, asg] = await Promise.all([
      supabase.from("questions").select("id,question_text").order("sort_order"),
      supabase.from("organizations").select("id,name").eq("active", true).order("name"),
      supabase.from("departments").select("id,name,organization_id").order("name"),
      supabase.from("applicants").select("id,full_name,email").order("full_name"),
      supabase.from("question_assignments").select("*").order("created_at", { ascending: false }),
    ]);
    if (q.data) setQuestions(q.data as Question[]);
    if (o.data) setOrgs(o.data as Org[]);
    if (d.data) setDepts(d.data as Dept[]);
    if (a.data) setApplicants(a.data as Applicant[]);
    if (asg.data) setItems(asg.data as Assignment[]);
    [q, o, d, a, asg].forEach((r) => r.error && toast.error(r.error.message));
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const reset = () => {
    setScope("organization"); setQuestionId(""); setOrgId(""); setDeptId(""); setApplicantId(""); setNotes("");
  };
  const openAdd = () => { reset(); setOpen(true); };

  const save = async () => {
    if (!questionId) return toast.error("Pick a question.");
    if (scope === "organization" && !orgId) return toast.error("Pick an organization.");
    if (scope === "department" && !deptId) return toast.error("Pick a department.");
    if (scope === "user" && !applicantId) return toast.error("Pick an applicant.");
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    const payload = {
      question_id: questionId,
      scope,
      organization_id: scope === "organization" ? orgId : null,
      department_id: scope === "department" ? deptId : null,
      applicant_id: scope === "user" ? applicantId : null,
      notes: notes.trim() || null,
      assigned_by: u.user?.id ?? null,
    };
    const { error } = await supabase.from("question_assignments").insert(payload);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Assignment created");
    setOpen(false); reset(); load();
  };

  const remove = async () => {
    if (!delTarget) return;
    const { error } = await supabase.from("question_assignments").delete().eq("id", delTarget.id);
    if (error) return toast.error(error.message);
    toast.success("Assignment removed");
    setDelTarget(null); load();
  };

  const qMap = useMemo(() => new Map(questions.map((q) => [q.id, q.question_text])), [questions]);
  const oMap = useMemo(() => new Map(orgs.map((o) => [o.id, o.name])), [orgs]);
  const dMap = useMemo(() => new Map(depts.map((d) => [d.id, d.name])), [depts]);
  const aMap = useMemo(() => new Map(applicants.map((a) => [a.id, a.full_name])), [applicants]);

  const filtered = items.filter((it) => {
    if (scopeFilter !== "all" && it.scope !== scopeFilter) return false;
    if (orgFilter !== "all") {
      // include direct org match and departments belonging to that org
      const deptOrg = it.department_id ? depts.find((d) => d.id === it.department_id)?.organization_id : null;
      if (it.organization_id !== orgFilter && deptOrg !== orgFilter) return false;
    }
    if (deptFilter !== "all" && it.department_id !== deptFilter) return false;
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return (
      (qMap.get(it.question_id) ?? "").toLowerCase().includes(s) ||
      (it.organization_id ? (oMap.get(it.organization_id) ?? "").toLowerCase().includes(s) : false) ||
      (it.department_id ? (dMap.get(it.department_id) ?? "").toLowerCase().includes(s) : false) ||
      (it.applicant_id ? (aMap.get(it.applicant_id) ?? "").toLowerCase().includes(s) : false)
    );
  });

  const deptFilterOptions = orgFilter === "all" ? depts : depts.filter((d) => d.organization_id === orgFilter);

  const targetLabel = (it: Assignment) => {
    if (it.scope === "organization") return oMap.get(it.organization_id ?? "") ?? "—";
    if (it.scope === "department") {
      const d = depts.find((x) => x.id === it.department_id);
      const orgName = d ? oMap.get(d.organization_id) ?? "" : "";
      return d ? `${orgName} › ${d.name}` : "—";
    }
    return aMap.get(it.applicant_id ?? "") ?? "—";
  };

  const deptOptions = orgId ? depts.filter((d) => d.organization_id === orgId) : depts;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Assignments</h3>
          <p className="text-sm text-muted-foreground">Link questions to organizations, departments, or individual applicants.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input className="w-56" placeholder="Search assignments…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <Select value={scopeFilter} onValueChange={(v) => setScopeFilter(v as typeof scopeFilter)}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All scopes</SelectItem>
              <SelectItem value="organization">Organization</SelectItem>
              <SelectItem value="department">Department</SelectItem>
              <SelectItem value="user">Applicant</SelectItem>
            </SelectContent>
          </Select>
          <Select value={orgFilter} onValueChange={(v) => { setOrgFilter(v); setDeptFilter("all"); }}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All organizations</SelectItem>
              {orgs.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={deptFilter} onValueChange={setDeptFilter}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All departments</SelectItem>
              {deptFilterOptions.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={openAdd}><Plus className="h-4 w-4 mr-1" /> Assign question</Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{loading ? "Loading…" : `${filtered.length} of ${items.length} assignments`}</CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Question</TableHead>
                <TableHead className="w-32">Scope</TableHead>
                <TableHead>Target</TableHead>
                <TableHead className="w-40">When</TableHead>
                <TableHead className="w-24 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((it) => (
                <TableRow key={it.id}>
                  <TableCell className="max-w-md truncate" title={qMap.get(it.question_id) ?? ""}>
                    <Link2 className="h-3.5 w-3.5 inline mr-1 text-muted-foreground" />
                    {qMap.get(it.question_id) ?? <span className="text-muted-foreground italic">deleted</span>}
                  </TableCell>
                  <TableCell><Badge variant="secondary" className="capitalize">{it.scope}</Badge></TableCell>
                  <TableCell>{targetLabel(it)}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">{new Date(it.created_at).toLocaleString()}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => setDelTarget(it)} aria-label="Remove"><Trash2 className="h-4 w-4" /></Button>
                  </TableCell>
                </TableRow>
              ))}
              {!loading && filtered.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No assignments.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2 border-t pt-3">
        <Button variant="outline" onClick={openAdd}><Plus className="h-4 w-4 mr-1" /> Add</Button>
      </div>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>Assign question</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Question</Label>
              <Select value={questionId} onValueChange={setQuestionId}>
                <SelectTrigger><SelectValue placeholder="Select a question" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {questions.map((q) => (
                    <SelectItem key={q.id} value={q.id}>{q.question_text.slice(0, 90)}{q.question_text.length > 90 ? "…" : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Scope</Label>
              <Select value={scope} onValueChange={(v) => setScope(v as typeof scope)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="organization">Organization</SelectItem>
                  <SelectItem value="department">Department</SelectItem>
                  <SelectItem value="user">Individual applicant</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {scope === "organization" && (
              <div className="space-y-1.5">
                <Label>Organization</Label>
                <Select value={orgId} onValueChange={setOrgId}>
                  <SelectTrigger><SelectValue placeholder="Pick organization" /></SelectTrigger>
                  <SelectContent>{orgs.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            {scope === "department" && (
              <>
                <div className="space-y-1.5">
                  <Label>Organization (filter)</Label>
                  <Select value={orgId} onValueChange={(v) => { setOrgId(v); setDeptId(""); }}>
                    <SelectTrigger><SelectValue placeholder="All organizations" /></SelectTrigger>
                    <SelectContent>{orgs.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Department</Label>
                  <Select value={deptId} onValueChange={setDeptId}>
                    <SelectTrigger><SelectValue placeholder="Pick department" /></SelectTrigger>
                    <SelectContent>{deptOptions.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </>
            )}
            {scope === "user" && (
              <div className="space-y-1.5">
                <Label>Applicant</Label>
                <Select value={applicantId} onValueChange={setApplicantId}>
                  <SelectTrigger><SelectValue placeholder="Pick applicant" /></SelectTrigger>
                  <SelectContent className="max-h-72">{applicants.map((a) => <SelectItem key={a.id} value={a.id}>{a.full_name}{a.email ? ` — ${a.email}` : ""}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5"><Label>Notes (optional)</Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
            <Button className="w-full" onClick={save} disabled={saving}>{saving ? "Saving…" : "Create assignment"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!delTarget} onOpenChange={(o) => !o && setDelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove assignment?</AlertDialogTitle>
            <AlertDialogDescription>The question will no longer be linked to this target.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={remove} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
