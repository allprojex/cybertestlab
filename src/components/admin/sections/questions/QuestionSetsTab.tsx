import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, FolderPlus, Layers, Link2, ArrowUp, ArrowDown, Eye } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { ShareLinkTab } from "./ShareLinkTab";

type Set_ = { id: string; name: string; description: string | null; active: boolean };
import { CheckCircle2, XCircle, Sparkles, RotateCcw, AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type SetItem = { id: string; set_id: string; question_id: string; sort_order: number };
type SetAssignment = {
  id: string;
  set_id: string;
  scope: "organization" | "department" | "user";
  organization_id: string | null;
  department_id: string | null;
  applicant_id: string | null;
  notes: string | null;
  created_at: string;
};
type Question = { id: string; question_text: string };
type Org = { id: string; name: string };
type Dept = { id: string; name: string; organization_id: string };
type Applicant = { id: string; full_name: string; email: string | null };

export function QuestionSetsTab() {
  const [sets, setSets] = useState<Set_[]>([]);
  const [items, setItems] = useState<SetItem[]>([]);
  const [assignments, setAssignments] = useState<SetAssignment[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [depts, setDepts] = useState<Dept[]>([]);
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [loading, setLoading] = useState(true);

  // Set editor (create/edit metadata)
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Set_ | null>(null);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);

  // Manage set (items + assignments)
  const [manage, setManage] = useState<Set_ | null>(null);
  const [pickQuestion, setPickQuestion] = useState<string>("");
  const [assignScope, setAssignScope] = useState<"organization" | "department" | "user">("organization");
  const [assignOrg, setAssignOrg] = useState<string>("");
  const [assignDept, setAssignDept] = useState<string>("");
  const [assignApplicant, setAssignApplicant] = useState<string>("");
  const [assignNotes, setAssignNotes] = useState("");

  // Preview state
  const [previewOrg, setPreviewOrg] = useState<string>("");
  const [previewDept, setPreviewDept] = useState<string>("");
  const [previewApplicant, setPreviewApplicant] = useState<string>("");

  const [delSet, setDelSet] = useState<Set_ | null>(null);

  const load = async () => {
    setLoading(true);
    const [s, i, a, q, o, d, ap] = await Promise.all([
      supabase.from("question_sets").select("*").is("deleted_at", null).order("name"),
      supabase.from("question_set_items").select("*").order("sort_order"),
      supabase.from("question_set_assignments").select("*").order("created_at", { ascending: false }),
      supabase.from("questions").select("id,question_text").is("deleted_at", null).order("sort_order"),
      supabase.from("organizations").select("id,name").eq("active", true).order("name"),
      supabase.from("departments").select("id,name,organization_id").order("name"),
      supabase.from("applicants").select("id,full_name,email").order("full_name"),
    ]);
    [s, i, a, q, o, d, ap].forEach((r) => r.error && toast.error(r.error.message));
    if (s.data) setSets(s.data as Set_[]);
    if (i.data) setItems(i.data as SetItem[]);
    if (a.data) setAssignments(a.data as SetAssignment[]);
    if (q.data) setQuestions(q.data as Question[]);
    if (o.data) setOrgs(o.data as Org[]);
    if (d.data) setDepts(d.data as Dept[]);
    if (ap.data) setApplicants(ap.data as Applicant[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const qMap = useMemo(() => new Map(questions.map((q) => [q.id, q.question_text])), [questions]);
  const oMap = useMemo(() => new Map(orgs.map((o) => [o.id, o.name])), [orgs]);
  const dMap = useMemo(() => new Map(depts.map((d) => [d.id, d.name])), [depts]);
  const aMap = useMemo(() => new Map(applicants.map((a) => [a.id, a.full_name])), [applicants]);

  const reset = () => { setEditing(null); setName(""); setDesc(""); setActive(true); };
  const openAdd = () => { reset(); setOpen(true); };
  const openEdit = (s: Set_) => { setEditing(s); setName(s.name); setDesc(s.description ?? ""); setActive(s.active); setOpen(true); };

  // Reasons a set can't be published yet — used by save() and the editor checklist.
  const publishIssues = (s: Set_ | null): string[] => {
    if (!s) return ["Save the set first, then add questions and an assignment before publishing."];
    const issues: string[] = [];
    const items = setItemsFor(s.id).length;
    const asgns = assignmentsFor(s.id).length;
    if (items === 0) issues.push("Add at least 1 question (this set has 0).");
    if (asgns === 0) issues.push("Add at least 1 assignment — pick an organization, department, or applicant.");
    return issues;
  };

  const save = async () => {
    const n = name.trim();
    if (!n) return toast.error("Set name is required.", { description: "Enter a short, recognizable name like “Customs Officer 2026”." });
    if (n.length > 120) return toast.error("Set name is too long.", { description: "Please keep it under 120 characters." });

    if (active) {
      const issues = publishIssues(editing);
      if (issues.length) {
        return toast.error("This set isn't ready to publish.", {
          description: issues.join("  \n• ").replace(/^/, "• "),
        });
      }
    }
    setSaving(true);
    const payload = { name: n, description: desc.trim() || null, active };
    const { error } = editing
      ? await supabase.from("question_sets").update(payload).eq("id", editing.id)
      : await supabase.from("question_sets").insert(payload);
    setSaving(false);
    if (error) return toast.error("Couldn't save the set.", { description: error.message });
    toast.success(editing ? "Set updated." : "Set created.");
    setOpen(false); reset(); load();
  };

  const removeSet = async () => {
    if (!delSet) return;
    const { error } = await supabase.rpc("recycle_soft_delete", { _table: "question_sets", _id: delSet.id });
    if (error) return toast.error(error.message);
    toast.success("Set moved to Recycle Bin");
    setDelSet(null); load();
  };

  // Set items
  const setItemsFor = (setId: string) => items.filter((it) => it.set_id === setId).sort((a, b) => a.sort_order - b.sort_order);

  const addItem = async () => {
    if (!manage) return;
    if (!pickQuestion) return toast.error("Pick a question first.", { description: "Choose one from the dropdown, then click Add." });
    const existing = setItemsFor(manage.id);
    if (existing.some((it) => it.question_id === pickQuestion)) {
      return toast.error("That question is already in this set.", { description: "Each question can only appear once per set." });
    }
    const nextOrder = (existing[existing.length - 1]?.sort_order ?? 0) + 10;
    const { error } = await supabase.from("question_set_items").insert({
      set_id: manage.id, question_id: pickQuestion, sort_order: nextOrder,
    });
    if (error) return toast.error("Couldn't add the question.", { description: error.message });
    toast.success("Question added to set.");
    setPickQuestion("");
    load();
  };

  const removeItem = async (id: string) => {
    const { error } = await supabase.from("question_set_items").delete().eq("id", id);
    if (error) return toast.error(error.message);
    load();
  };

  const moveItem = async (setId: string, index: number, dir: -1 | 1) => {
    const list = setItemsFor(setId);
    const a = list[index]; const b = list[index + dir];
    if (!a || !b) return;
    let oa = a.sort_order, ob = b.sort_order;
    if (oa === ob) ob = oa + dir * 5;
    const e1 = await supabase.from("question_set_items").update({ sort_order: ob }).eq("id", a.id);
    if (e1.error) return toast.error(e1.error.message);
    const e2 = await supabase.from("question_set_items").update({ sort_order: oa }).eq("id", b.id);
    if (e2.error) return toast.error(e2.error.message);
    load();
  };

  // Set assignments
  const assignmentsFor = (setId: string) => assignments.filter((a) => a.set_id === setId);

  const addAssignment = async () => {
    if (!manage) return;
    if (assignScope === "organization" && !assignOrg) return toast.error("Choose an organization.", { description: "Pick which organization should receive this set." });
    if (assignScope === "department" && !assignDept) return toast.error("Choose a department.", { description: "Filter by organization, then pick the specific department." });
    if (assignScope === "user" && !assignApplicant) return toast.error("Choose an applicant.", { description: "Pick the individual applicant to receive this set." });

    // Prevent duplicate assignment to the same target.
    const existing = assignmentsFor(manage.id);
    const dupe = existing.find((a) =>
      a.scope === assignScope &&
      (a.organization_id ?? "") === (assignScope === "organization" ? assignOrg : "") &&
      (a.department_id ?? "") === (assignScope === "department" ? assignDept : "") &&
      (a.applicant_id ?? "") === (assignScope === "user" ? assignApplicant : "")
    );
    if (dupe) return toast.error("This target is already assigned.", { description: "Remove the existing assignment first if you need to change its notes." });

    const { data: u } = await supabase.auth.getUser();
    const payload = {
      set_id: manage.id,
      scope: assignScope,
      organization_id: assignScope === "organization" ? assignOrg : null,
      department_id: assignScope === "department" ? assignDept : null,
      applicant_id: assignScope === "user" ? assignApplicant : null,
      notes: assignNotes.trim() || null,
      assigned_by: u.user?.id ?? null,
    };
    const { error } = await supabase.from("question_set_assignments").insert(payload);
    if (error) return toast.error("Couldn't save the assignment.", { description: error.message });
    toast.success("Assignment added.");
    setAssignOrg(""); setAssignDept(""); setAssignApplicant(""); setAssignNotes("");
    load();
  };

  const removeAssignment = async (id: string) => {
    const { error } = await supabase.from("question_set_assignments").delete().eq("id", id);
    if (error) return toast.error("Couldn't remove the assignment.", { description: error.message });
    toast.success("Assignment removed.");
    load();
  };

  const targetLabel = (a: SetAssignment) => {
    if (a.scope === "organization") return oMap.get(a.organization_id ?? "") ?? "—";
    if (a.scope === "department") {
      const d = depts.find((x) => x.id === a.department_id);
      return d ? `${oMap.get(d.organization_id) ?? ""} › ${d.name}` : "—";
    }
    return aMap.get(a.applicant_id ?? "") ?? "—";
  };

  const deptOptions = assignOrg ? depts.filter((d) => d.organization_id === assignOrg) : depts;
  const previewDeptOptions = previewOrg ? depts.filter((d) => d.organization_id === previewOrg) : depts;
  const availableQuestions = manage
    ? questions.filter((q) => !setItemsFor(manage.id).some((it) => it.question_id === q.id))
    : [];

  // Resolve which set an example applicant would receive (priority: user > department > organization)
  const previewResolution = useMemo(() => {
    const activeAssignments = assignments.filter((a) => {
      const s = sets.find((x) => x.id === a.set_id);
      return s?.active === true;
    });
    const tierMatch = (scope: SetAssignment["scope"], id: string) => {
      if (!id) return null;
      const a = activeAssignments.find((x) =>
        x.scope === scope &&
        (scope === "user" ? x.applicant_id === id :
         scope === "department" ? x.department_id === id :
         x.organization_id === id)
      );
      return a ? sets.find((s) => s.id === a.set_id) ?? null : null;
    };
    const user = tierMatch("user", previewApplicant);
    const dept = tierMatch("department", previewDept);
    const org = tierMatch("organization", previewOrg);
    const chosen = user ?? dept ?? org ?? null;
    const matchedTier: "user" | "department" | "organization" | null =
      user ? "user" : dept ? "department" : org ? "organization" : null;
    return { user, dept, org, chosen, matchedTier };
  }, [assignments, sets, previewApplicant, previewDept, previewOrg]);

  const resolvedPreviewSet = previewResolution.chosen;
  const previewQuestions = resolvedPreviewSet
    ? setItemsFor(resolvedPreviewSet.id).map((it) => ({ id: it.id, text: qMap.get(it.question_id) ?? "(deleted)" }))
    : [];

  const anyPreviewSelected = !!(previewOrg || previewDept || previewApplicant);
  const resetPreview = () => { setPreviewOrg(""); setPreviewDept(""); setPreviewApplicant(""); };

  // Build up to 6 quick-test presets from real active assignments so admins can
  // try common scenarios in one click.
  const quickPresets = useMemo(() => {
    const out: { key: string; label: string; apply: () => void; tier: string }[] = [];
    const seen = new Set<string>();
    const activeAssigns = assignments.filter((a) => sets.find((s) => s.id === a.set_id)?.active);
    for (const a of activeAssigns) {
      let key = "", label = "", tier = a.scope;
      let apply: () => void = () => {};
      if (a.scope === "user" && a.applicant_id) {
        const ap = applicants.find((x) => x.id === a.applicant_id);
        if (!ap) continue;
        key = `u:${ap.id}`;
        label = `Applicant · ${ap.full_name}`;
        apply = () => { setPreviewApplicant(ap.id); };
      } else if (a.scope === "department" && a.department_id) {
        const d = depts.find((x) => x.id === a.department_id);
        if (!d) continue;
        key = `d:${d.id}`;
        label = `Dept · ${oMap.get(d.organization_id) ?? "?"} › ${d.name}`;
        apply = () => { setPreviewOrg(d.organization_id); setPreviewDept(d.id); setPreviewApplicant(""); };
      } else if (a.scope === "organization" && a.organization_id) {
        const o = orgs.find((x) => x.id === a.organization_id);
        if (!o) continue;
        key = `o:${o.id}`;
        label = `Org · ${o.name}`;
        apply = () => { setPreviewOrg(o.id); setPreviewDept(""); setPreviewApplicant(""); };
      }
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push({ key, label, apply, tier });
      if (out.length >= 6) break;
    }
    return out;
  }, [assignments, sets, applicants, depts, orgs, oMap]);

  type TierRow = { tier: "user" | "department" | "organization"; label: string; selected: boolean; match: Set_ | null; winner: boolean };
  const tierRows: TierRow[] = [
    { tier: "user", label: "Individual applicant", selected: !!previewApplicant, match: previewResolution.user, winner: previewResolution.matchedTier === "user" },
    { tier: "department", label: "Department", selected: !!previewDept, match: previewResolution.dept, winner: previewResolution.matchedTier === "department" },
    { tier: "organization", label: "Organization", selected: !!previewOrg, match: previewResolution.org, winner: previewResolution.matchedTier === "organization" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Question Sets</h3>
          <p className="text-sm text-muted-foreground">Group questions into reusable sets and assign each set to organizations, departments, or applicants.</p>
        </div>
        <Button onClick={openAdd}><FolderPlus className="h-4 w-4 mr-1" /> New set</Button>
      </div>

      {/* Applicant preview */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Eye className="h-4 w-4 text-muted-foreground" /> Preview applicant resolution
              </CardTitle>
              <p className="text-sm text-muted-foreground">Pick any combination of organization, department, and applicant. Resolution priority is <strong>Applicant → Department → Organization → Global pool</strong>.</p>
            </div>
            <Button variant="ghost" size="sm" onClick={resetPreview} disabled={!anyPreviewSelected}>
              <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reset
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {quickPresets.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed bg-muted/20 p-2.5">
              <span className="text-xs font-medium text-muted-foreground flex items-center gap-1 pr-1">
                <Sparkles className="h-3.5 w-3.5" /> Try a scenario:
              </span>
              {quickPresets.map((p) => (
                <Button key={p.key} variant="outline" size="sm" className="h-7 text-xs" onClick={() => { resetPreview(); p.apply(); }}>
                  {p.label}
                </Button>
              ))}
            </div>
          )}

          <div className="grid sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Organization</Label>
              <Select value={previewOrg || "__none"} onValueChange={(v) => { const x = v === "__none" ? "" : v; setPreviewOrg(x); setPreviewDept(""); }}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">None</SelectItem>
                  {orgs.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Department</Label>
              <Select value={previewDept || "__none"} onValueChange={(v) => setPreviewDept(v === "__none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">None</SelectItem>
                  {previewDeptOptions.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Applicant</Label>
              <Select value={previewApplicant || "__none"} onValueChange={(v) => setPreviewApplicant(v === "__none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="__none">None</SelectItem>
                  {applicants.map((a) => <SelectItem key={a.id} value={a.id}>{a.full_name}{a.email ? ` — ${a.email}` : ""}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Resolution path */}
          <div className="rounded-md border bg-muted/20 p-3 space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Resolution path</p>
            <ul className="space-y-1.5">
              {tierRows.map((row) => (
                <li key={row.tier} className="flex items-center gap-2 text-sm">
                  {!row.selected ? (
                    <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-muted text-muted-foreground text-[10px]">—</span>
                  ) : row.match ? (
                    <CheckCircle2 className={`h-4 w-4 ${row.winner ? "text-success" : "text-muted-foreground"}`} />
                  ) : (
                    <XCircle className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className={`capitalize w-36 ${row.winner ? "font-semibold" : ""}`}>{row.label}</span>
                  <span className="text-muted-foreground flex-1 truncate">
                    {!row.selected
                      ? "not selected"
                      : row.match
                        ? <>matches <span className="font-medium text-foreground">{row.match.name}</span>{row.winner && <Badge className="ml-2 bg-success/15 text-success border border-success/30">winner</Badge>}</>
                        : "no active assignment at this tier"}
                  </span>
                </li>
              ))}
              <li className="flex items-center gap-2 text-sm pt-1 border-t border-border/60 mt-1">
                <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-info/15 text-info text-[10px]">★</span>
                <span className="w-36 font-semibold">Global pool</span>
                <span className="text-muted-foreground flex-1">used only when no tier above matches</span>
              </li>
            </ul>
          </div>

          {/* Result */}
          <div className="rounded-md border bg-card p-3">
            {resolvedPreviewSet ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm flex-wrap">
                  <Badge className="bg-success/15 text-success border border-success/30">Resolved</Badge>
                  <span className="font-medium">{resolvedPreviewSet.name}</span>
                  <span className="text-muted-foreground">via {previewResolution.matchedTier} match — {previewQuestions.length} {previewQuestions.length === 1 ? "question" : "questions"}</span>
                </div>
                {previewQuestions.length === 0 ? (
                  <Alert variant="default" className="border-warning/40 bg-warning/10">
                    <AlertCircle className="h-4 w-4 text-warning" />
                    <AlertTitle className="text-sm">Empty set</AlertTitle>
                    <AlertDescription className="text-xs">
                      This set has no questions, so the applicant would actually fall back to the global pool. Add questions to fix this.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <ol className="list-decimal pl-5 text-sm space-y-1 max-h-56 overflow-y-auto">
                    {previewQuestions.map((q) => (
                      <li key={q.id} className="text-foreground/90">{q.text}</li>
                    ))}
                  </ol>
                )}
              </div>
            ) : !anyPreviewSelected ? (
              <p className="text-sm text-muted-foreground">Pick an organization, department, or applicant above — or click a scenario chip — to see the resolved set and its questions.</p>
            ) : (
              <Alert variant="default" className="border-info/40 bg-info/10">
                <AlertCircle className="h-4 w-4 text-info" />
                <AlertTitle className="text-sm">No assignment matches — global pool will be used</AlertTitle>
                <AlertDescription className="text-xs">
                  None of the selected tiers has an active assignment. The applicant would receive the global question pool. Add an assignment in a set above to override this.
                </AlertDescription>
              </Alert>
            )}
          </div>
        </CardContent>
      </Card>





      <Card>
        <CardHeader><CardTitle className="text-base">{loading ? "Loading…" : `${sets.length} sets`}</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-24">Questions</TableHead>
                <TableHead className="w-28">Assignments</TableHead>
                <TableHead className="w-24">Status</TableHead>
                <TableHead className="w-44 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sets.map((s) => {
                const issues = publishIssues(s);
                const readyToPublish = issues.length === 0;
                return (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium flex items-center gap-2"><Layers className="h-4 w-4 text-muted-foreground" /> {s.name}</TableCell>
                    <TableCell className="text-muted-foreground max-w-md truncate">{s.description ?? "—"}</TableCell>
                    <TableCell><Badge variant={setItemsFor(s.id).length ? "secondary" : "outline"}>{setItemsFor(s.id).length}</Badge></TableCell>
                    <TableCell><Badge variant={assignmentsFor(s.id).length ? "secondary" : "outline"}>{assignmentsFor(s.id).length}</Badge></TableCell>
                    <TableCell>
                      {s.active ? (
                        <Badge className="bg-success/15 text-success border border-success/30">Active</Badge>
                      ) : readyToPublish ? (
                        <Badge variant="outline" className="border-info/40 text-info">Ready</Badge>
                      ) : (
                        <Badge variant="outline" title={issues.join(" ")}>Draft · needs setup</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" onClick={() => setManage(s)}><Layers className="h-3.5 w-3.5 mr-1" /> Manage</Button>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(s)} aria-label="Edit"><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => setDelSet(s)} aria-label="Delete"><Trash2 className="h-4 w-4" /></Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {!loading && sets.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No sets yet. Click “New set” to create one.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2 border-t pt-3">
        <Button variant="outline" onClick={openAdd}><Plus className="h-4 w-4 mr-1" /> Add</Button>
      </div>

      {/* Create/edit set */}
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit set" : "New question set"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Customs Officer 2026" maxLength={120} />
              <p className="text-xs text-muted-foreground">A clear, recognizable name (max 120 characters).</p>
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Optional context for other admins" />
            </div>

            {(() => {
              const issues = publishIssues(editing);
              const ready = issues.length === 0;
              return (
                <div className={`rounded-md border p-3 ${ready ? "border-success/40 bg-success/5" : "border-warning/40 bg-warning/5"}`}>
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {ready
                      ? <><CheckCircle2 className="h-4 w-4 text-success" /> Ready to publish</>
                      : <><AlertCircle className="h-4 w-4 text-warning" /> Before you can publish</>}
                  </div>
                  {!ready && (
                    <ul className="mt-1.5 space-y-1 text-xs text-muted-foreground">
                      {issues.map((i, idx) => (
                        <li key={idx} className="flex items-start gap-1.5">
                          <XCircle className="h-3.5 w-3.5 mt-0.5 text-warning shrink-0" /> {i}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })()}

            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <div className="space-y-0.5">
                <p className="text-sm font-medium">{active ? "Active (visible to applicants)" : "Inactive (draft)"}</p>
                <p className="text-xs text-muted-foreground">Only active sets are served at test time.</p>
              </div>
              <Switch checked={active} onCheckedChange={setActive} />
            </div>
            <Button className="w-full" onClick={save} disabled={saving}>{saving ? "Saving…" : editing ? "Update" : "Create"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Manage set: items + assignments */}
      <Dialog open={!!manage} onOpenChange={(o) => !o && setManage(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{manage?.name}</DialogTitle></DialogHeader>
          {manage && (
            <Tabs defaultValue="items" className="space-y-4">
              <TabsList>
                <TabsTrigger value="items">Questions ({setItemsFor(manage.id).length})</TabsTrigger>
                <TabsTrigger value="assignments">Assignments ({assignmentsFor(manage.id).length})</TabsTrigger>
                <TabsTrigger value="share">Public link</TabsTrigger>
              </TabsList>
              <TabsContent value="share">
                <ShareLinkTab setId={manage.id} setActive={manage.active} />
              </TabsContent>

              <TabsContent value="items" className="space-y-3">
                <div className="flex items-end gap-2">
                  <div className="flex-1 space-y-1.5">
                    <Label>Add question to set</Label>
                    <Select value={pickQuestion} onValueChange={setPickQuestion}>
                      <SelectTrigger><SelectValue placeholder="Pick a question" /></SelectTrigger>
                      <SelectContent className="max-h-72">
                        {availableQuestions.map((q) => (
                          <SelectItem key={q.id} value={q.id}>{q.question_text.slice(0, 80)}{q.question_text.length > 80 ? "…" : ""}</SelectItem>
                        ))}
                        {availableQuestions.length === 0 && <div className="px-2 py-1 text-xs text-muted-foreground">All questions already added.</div>}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={addItem} disabled={!pickQuestion}><Plus className="h-4 w-4 mr-1" /> Add</Button>
                </div>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Question</TableHead>
                      <TableHead className="w-32 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {setItemsFor(manage.id).map((it, i, list) => (
                      <TableRow key={it.id}>
                        <TableCell className="tabular-nums text-muted-foreground">{i + 1}</TableCell>
                        <TableCell className="max-w-md">{qMap.get(it.question_id) ?? <span className="italic text-muted-foreground">deleted</span>}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" disabled={i === 0} onClick={() => moveItem(manage.id, i, -1)} aria-label="Up"><ArrowUp className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" disabled={i === list.length - 1} onClick={() => moveItem(manage.id, i, 1)} aria-label="Down"><ArrowDown className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => removeItem(it.id)} aria-label="Remove"><Trash2 className="h-4 w-4" /></Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {setItemsFor(manage.id).length === 0 && (
                      <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-6">No questions in this set yet.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </TabsContent>

              <TabsContent value="assignments" className="space-y-3">
                <div className="grid sm:grid-cols-2 gap-3 rounded-lg border bg-muted/30 p-3">
                  <div className="space-y-1.5">
                    <Label>Scope</Label>
                    <Select value={assignScope} onValueChange={(v) => setAssignScope(v as typeof assignScope)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="organization">Organization</SelectItem>
                        <SelectItem value="department">Department</SelectItem>
                        <SelectItem value="user">Individual applicant</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {assignScope === "organization" && (
                    <div className="space-y-1.5">
                      <Label>Organization</Label>
                      <Select value={assignOrg} onValueChange={setAssignOrg}>
                        <SelectTrigger><SelectValue placeholder="Pick" /></SelectTrigger>
                        <SelectContent>{orgs.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  )}
                  {assignScope === "department" && (
                    <>
                      <div className="space-y-1.5">
                        <Label>Organization (filter)</Label>
                        <Select value={assignOrg} onValueChange={(v) => { setAssignOrg(v); setAssignDept(""); }}>
                          <SelectTrigger><SelectValue placeholder="All" /></SelectTrigger>
                          <SelectContent>{orgs.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5 sm:col-span-2">
                        <Label>Department</Label>
                        <Select value={assignDept} onValueChange={setAssignDept}>
                          <SelectTrigger><SelectValue placeholder="Pick" /></SelectTrigger>
                          <SelectContent>{deptOptions.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    </>
                  )}
                  {assignScope === "user" && (
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label>Applicant</Label>
                      <Select value={assignApplicant} onValueChange={setAssignApplicant}>
                        <SelectTrigger><SelectValue placeholder="Pick" /></SelectTrigger>
                        <SelectContent className="max-h-72">{applicants.map((a) => <SelectItem key={a.id} value={a.id}>{a.full_name}{a.email ? ` — ${a.email}` : ""}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  )}
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label>Notes (optional)</Label>
                    <Input value={assignNotes} onChange={(e) => setAssignNotes(e.target.value)} />
                  </div>
                  <div className="sm:col-span-2">
                    <Button className="w-full" onClick={addAssignment}><Link2 className="h-4 w-4 mr-1" /> Assign set</Button>
                  </div>
                </div>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-32">Scope</TableHead>
                      <TableHead>Target</TableHead>
                      <TableHead className="w-40">When</TableHead>
                      <TableHead className="w-16 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {assignmentsFor(manage.id).map((a) => (
                      <TableRow key={a.id}>
                        <TableCell><Badge variant="secondary" className="capitalize">{a.scope}</Badge></TableCell>
                        <TableCell>{targetLabel(a)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString()}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" onClick={() => removeAssignment(a.id)} aria-label="Remove"><Trash2 className="h-4 w-4" /></Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {assignmentsFor(manage.id).length === 0 && (
                      <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">No assignments yet.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!delSet} onOpenChange={(o) => !o && setDelSet(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this set?</AlertDialogTitle>
            <AlertDialogDescription>All items and assignments belonging to this set will be removed. Questions themselves are not deleted.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={removeSet} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
