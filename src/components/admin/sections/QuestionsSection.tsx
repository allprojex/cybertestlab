import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Plus, Pencil, Trash2, ArrowUp, ArrowDown, Eye, EyeOff, Lock,
  Download, Upload, MoreHorizontal, EyeIcon, EyeOffIcon, CheckCircle2, XCircle, Send,
} from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { parseCsv, toCsv, downloadCsv, type CsvRow } from "@/lib/csv";
import { parseXlsx } from "@/lib/xlsx";
import { QUESTION_TYPE_LABELS, SUPPORTED_QUESTION_TYPES, type QuestionType } from "@/lib/questionTypes";
import type { Database } from "@/integrations/supabase/types";
import { CategoriesTab } from "./questions/CategoriesTab";
import { OrganizationsTab } from "./questions/OrganizationsTab";
import { DepartmentsTab } from "./questions/DepartmentsTab";
import { AssignmentsTab } from "./questions/AssignmentsTab";
import { QuestionSetsTab } from "./questions/QuestionSetsTab";

type QType = QuestionType;
type Difficulty = "easy" | "medium" | "hard";
type Approval = "draft" | "pending" | "approved" | "rejected";
type AdminQuestion = {
  id: string;
  question_text: string;
  question_type: QType;
  options: string[] | null;
  correct_answer: string | null;
  correct_answers: string[] | null;
  sort_order: number;
  published: boolean;
  difficulty: Difficulty;
  approval_status: Approval;
  category_id: string | null;
  created_at: string;
};
type Category = { id: string; name: string };
type QuestionInsert = Database["public"]["Tables"]["questions"]["Insert"];
type QuestionUpdate = Database["public"]["Tables"]["questions"]["Update"];

const TYPE_LABEL = QUESTION_TYPE_LABELS;
const VALID_TYPES: QType[] = [...SUPPORTED_QUESTION_TYPES];
const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];
const APPROVAL_LABEL: Record<Approval, string> = {
  draft: "Draft", pending: "Pending", approved: "Approved", rejected: "Rejected",
};
const CSV_HEADERS = [
  "question_text", "question_type", "options", "correct_answer", "correct_answers",
  "category", "difficulty", "approval_status", "published", "sort_order",
];

function approvalBadge(status: Approval) {
  if (status === "approved") return <Badge className="bg-success/15 text-success border border-success/30">Approved</Badge>;
  if (status === "pending") return <Badge className="bg-warning/15 text-warning border border-warning/30">Pending</Badge>;
  if (status === "rejected") return <Badge variant="destructive">Rejected</Badge>;
  return <Badge variant="outline">Draft</Badge>;
}

function validateRow(row: CsvRow, i: number, categoryByName: Map<string, string>):
  { ok: true; payload: QuestionInsert } | { ok: false; error: string } {
  const text = (row.question_text || "").trim();
  const typeRaw = (row.question_type || "short_answer").trim() as QType;
  if (!text) return { ok: false, error: `Row ${i + 2}: question_text is required.` };
  if (!VALID_TYPES.includes(typeRaw)) return { ok: false, error: `Row ${i + 2}: question_type must be one of ${VALID_TYPES.join(", ")}.` };

  const answer = (row.correct_answer || "").trim();
  const answersRaw = (row.correct_answers || "").trim();
  let correctAnswers: string[] | null = null;

  let options: string[] | null = null;
  const rawOptions = (row.options || "").trim();
  if (typeRaw === "mcq" || typeRaw === "single_choice" || typeRaw === "multi_choice") {
    if (rawOptions.startsWith("[")) {
      try {
        const parsed = JSON.parse(rawOptions);
        if (!Array.isArray(parsed) || parsed.some((p) => typeof p !== "string")) throw new Error();
        options = parsed.map((p) => p.trim()).filter(Boolean);
      } catch {
        return { ok: false, error: `Row ${i + 2}: options must be JSON array or pipe-separated.` };
      }
    } else {
      options = rawOptions.split("|").map((o) => o.trim()).filter(Boolean);
    }
    if (options.length < 2) return { ok: false, error: `Row ${i + 2}: choice questions need at least 2 options.` };

    if (typeRaw === "multi_choice") {
      correctAnswers = answersRaw
        ? answersRaw.split("|").map((s) => s.trim()).filter(Boolean)
        : (answer ? [answer] : []);
      if (correctAnswers.length === 0) return { ok: false, error: `Row ${i + 2}: multi_choice needs at least one correct_answers value.` };
      for (const a of correctAnswers) {
        if (!options.includes(a)) return { ok: false, error: `Row ${i + 2}: correct answer "${a}" must match an option.` };
      }
    } else {
      if (!answer) return { ok: false, error: `Row ${i + 2}: correct_answer is required.` };
      if (!options.includes(answer)) return { ok: false, error: `Row ${i + 2}: correct_answer must match one of the options.` };
    }
  } else if (typeRaw === "true_false") {
    if (!["True", "False"].includes(answer)) return { ok: false, error: `Row ${i + 2}: true/false answer must be "True" or "False".` };
  } else if (typeRaw === "short_answer") {
    if (!answer) return { ok: false, error: `Row ${i + 2}: correct_answer is required.` };
  }

  const difficultyRaw = ((row.difficulty || "medium").trim().toLowerCase()) as Difficulty;
  if (!DIFFICULTIES.includes(difficultyRaw)) return { ok: false, error: `Row ${i + 2}: difficulty must be easy|medium|hard.` };

  const approvalRaw = ((row.approval_status || "draft").trim().toLowerCase()) as Approval;
  if (!(approvalRaw in APPROVAL_LABEL)) return { ok: false, error: `Row ${i + 2}: approval_status invalid.` };

  const categoryName = (row.category || "").trim();
  let category_id: string | null = null;
  if (categoryName) {
    const id = categoryByName.get(categoryName.toLowerCase());
    if (!id) return { ok: false, error: `Row ${i + 2}: category "${categoryName}" not found. Create it first.` };
    category_id = id;
  }

  const publishedRaw = (row.published || "true").toLowerCase().trim();
  const published = !["false", "0", "no", "n"].includes(publishedRaw);
  const sortOrderRaw = (row.sort_order || "").trim();
  const sortOrder = sortOrderRaw ? Number(sortOrderRaw) : null;
  if (sortOrderRaw && !Number.isFinite(sortOrder)) return { ok: false, error: `Row ${i + 2}: sort_order must be numeric.` };

  return {
    ok: true,
    payload: {
      question_text: text,
      question_type: typeRaw,
      options,
      correct_answer: typeRaw === "multi_choice" ? (correctAnswers?.[0] ?? "") : (typeRaw === "open" && !answer ? null : answer),
      correct_answers: correctAnswers,
      category_id,
      difficulty: difficultyRaw,
      approval_status: approvalRaw,
      published,
      ...(sortOrder !== null ? { sort_order: sortOrder } : {}),
    },
  };
}

function QuestionsList() {
  const [questions, setQuestions] = useState<AdminQuestion[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [reorderingId, setReorderingId] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AdminQuestion | null>(null);
  const [formText, setFormText] = useState("");
  const [formType, setFormType] = useState<QType>("short_answer");
  const [formOptions, setFormOptions] = useState(["", "", "", ""]);
  const [formCorrect, setFormCorrect] = useState("");
  const [formCorrectMulti, setFormCorrectMulti] = useState<string[]>([]);
  const [formPublished, setFormPublished] = useState(true);
  const [formDifficulty, setFormDifficulty] = useState<Difficulty>("medium");
  const [formApproval, setFormApproval] = useState<Approval>("draft");
  const [formCategoryId, setFormCategoryId] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const [revealAll, setRevealAll] = useState(false);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});

  const [deleteTarget, setDeleteTarget] = useState<AdminQuestion | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterCat, setFilterCat] = useState<string>("all");
  const [filterDiff, setFilterDiff] = useState<string>("all");
  const [filterApproval, setFilterApproval] = useState<string>("all");

  const [rejectTarget, setRejectTarget] = useState<AdminQuestion | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const load = async () => {
    setLoading(true);
    const [q, c] = await Promise.all([
      supabase.from("questions").select("*").is("deleted_at", null).order("sort_order").order("created_at"),
      supabase.from("question_categories").select("id,name").order("name"),
    ]);
    if (q.error) toast.error(q.error.message);
    if (q.data) setQuestions(q.data as unknown as AdminQuestion[]);
    if (c.data) setCategories(c.data as Category[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const catMap = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);
  const catByName = useMemo(() => new Map(categories.map((c) => [c.name.toLowerCase(), c.id])), [categories]);

  const filtered = useMemo(() => {
    return questions.filter((q) => {
      if (filterType !== "all" && q.question_type !== filterType) return false;
      if (filterCat !== "all" && q.category_id !== filterCat) return false;
      if (filterDiff !== "all" && q.difficulty !== filterDiff) return false;
      if (filterApproval !== "all" && q.approval_status !== filterApproval) return false;
      if (search.trim()) {
        const s = search.toLowerCase();
        if (!q.question_text.toLowerCase().includes(s)) return false;
      }
      return true;
    });
  }, [questions, search, filterType, filterCat, filterDiff, filterApproval]);

  const reset = () => {
    setFormText(""); setFormType("short_answer");
    setFormOptions(["", "", "", ""]); setFormCorrect(""); setFormCorrectMulti([]);
    setFormPublished(true); setFormDifficulty("medium"); setFormApproval("draft");
    setFormCategoryId(""); setEditing(null);
  };
  const openAdd = () => { reset(); setDialogOpen(true); };
  const openEdit = (q: AdminQuestion) => {
    setEditing(q);
    setFormText(q.question_text); setFormType(q.question_type);
    setFormOptions(q.options ? [...q.options, ...Array(4).fill("")].slice(0, Math.max(4, q.options.length)) : ["", "", "", ""]);
    setFormCorrect(q.correct_answer ?? "");
    setFormCorrectMulti(q.correct_answers ?? []);
    setFormPublished(q.published);
    setFormDifficulty(q.difficulty);
    setFormApproval(q.approval_status);
    setFormCategoryId(q.category_id ?? "");
    setDialogOpen(true);
  };

  const save = async () => {
    const text = formText.trim();
    if (text.length < 3) return toast.error("Question text is too short.");
    let opts: string[] | null = null;
    let answer = formCorrect.trim();
    let answers: string[] | null = null;

    if (formType === "mcq" || formType === "single_choice" || formType === "multi_choice") {
      opts = formOptions.map((o) => o.trim()).filter(Boolean);
      if (opts.length < 2) return toast.error("Choice questions need at least 2 options.");
      if (formType === "multi_choice") {
        answers = formCorrectMulti.filter((a) => opts!.includes(a));
        if (answers.length === 0) return toast.error("Select at least one correct option.");
        answer = answers[0];
      } else {
        if (!answer) return toast.error("Pick a correct answer.");
        if (!opts.includes(answer)) return toast.error("Correct answer must match an option.");
      }
    } else if (formType === "true_false") {
      if (!["True", "False"].includes(answer)) return toast.error("Answer must be True or False.");
    } else if (formType === "short_answer") {
      if (!answer) return toast.error("Answer is required.");
    }

    setSaving(true);
    const payload: QuestionInsert = {
      question_text: text,
      question_type: formType,
      options: opts,
      correct_answer: formType === "open" && !answer ? null : answer,
      correct_answers: answers,
      published: formPublished,
      difficulty: formDifficulty,
      approval_status: formApproval,
      category_id: formCategoryId || null,
    };
    if (formApproval === "approved") {
      const { data: u } = await supabase.auth.getUser();
      payload.approved_by = u.user?.id ?? null;
      payload.approved_at = new Date().toISOString();
    }
    if (editing) {
      const { error } = await supabase.from("questions").update(payload).eq("id", editing.id);
      if (error) { setSaving(false); return toast.error(error.message); }
      toast.success("Question updated");
    } else {
      const nextOrder = (questions[questions.length - 1]?.sort_order ?? 0) + 10;
      const { error } = await supabase.from("questions").insert({ ...payload, sort_order: nextOrder });
      if (error) { setSaving(false); return toast.error(error.message); }
      toast.success("Question added");
    }
    setSaving(false); setDialogOpen(false); reset(); load();
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase.rpc("recycle_soft_delete", { _table: "questions", _id: deleteTarget.id });
    if (error) toast.error(error.message); else toast.success("Question moved to Recycle Bin");
    setDeleteTarget(null); load();
  };

  const togglePublished = async (q: AdminQuestion) => {
    const { error } = await supabase.from("questions").update({ published: !q.published }).eq("id", q.id);
    if (error) return toast.error(error.message);
    setQuestions((qs) => qs.map((x) => (x.id === q.id ? { ...x, published: !q.published } : x)));
  };

  const setApproval = async (q: AdminQuestion, status: Approval, reason?: string) => {
    const patch: QuestionUpdate = { approval_status: status };
    if (status === "approved") {
      const { data: u } = await supabase.auth.getUser();
      patch.approved_by = u.user?.id ?? null;
      patch.approved_at = new Date().toISOString();
      patch.rejection_reason = null;
    } else if (status === "rejected") {
      patch.rejection_reason = reason ?? null;
    }
    const { error } = await supabase.from("questions").update(patch).eq("id", q.id);
    if (error) return toast.error(error.message);
    toast.success(`Marked ${APPROVAL_LABEL[status]}`);
    load();
  };

  const move = async (index: number, direction: -1 | 1) => {
    const list = filtered;
    const a = list[index];
    const b = list[index + direction];
    if (!a || !b) return;
    setReorderingId(a.id);
    const orderA = a.sort_order;
    let orderB = b.sort_order;
    if (orderA === orderB) orderB = orderA + direction * 5;
    const { error: e1 } = await supabase.from("questions").update({ sort_order: orderB }).eq("id", a.id);
    if (e1) { setReorderingId(null); return toast.error(e1.message); }
    const { error: e2 } = await supabase.from("questions").update({ sort_order: orderA }).eq("id", b.id);
    if (e2) { setReorderingId(null); return toast.error(e2.message); }
    setReorderingId(null);
    load();
  };

  const allSelectedOnPage = filtered.length > 0 && filtered.every((q) => selected.has(q.id));
  const toggleSelectAll = (checked: boolean) => {
    if (checked) setSelected(new Set(filtered.map((q) => q.id)));
    else setSelected(new Set());
  };
  const toggleSelect = (id: string, checked: boolean) => {
    setSelected((s) => {
      const n = new Set(s);
      if (checked) n.add(id);
      else n.delete(id);
      return n;
    });
  };
  const clearSelection = () => setSelected(new Set());

  const bulkSetPublished = async (value: boolean) => {
    if (selected.size === 0) return;
    const ids = Array.from(selected);
    const { error } = await supabase.from("questions").update({ published: value }).in("id", ids);
    if (error) return toast.error(error.message);
    toast.success(`${ids.length} ${value ? "published" : "unpublished"}`);
    clearSelection(); load();
  };
  const bulkSetApproval = async (status: Approval) => {
    if (selected.size === 0) return;
    const ids = Array.from(selected);
    const patch: QuestionUpdate = { approval_status: status };
    if (status === "approved") {
      const { data: u } = await supabase.auth.getUser();
      patch.approved_by = u.user?.id ?? null;
      patch.approved_at = new Date().toISOString();
      patch.rejection_reason = null;
    }
    const { error } = await supabase.from("questions").update(patch).in("id", ids);
    if (error) return toast.error(error.message);
    toast.success(`${ids.length} marked ${APPROVAL_LABEL[status]}`);
    clearSelection(); load();
  };
  const bulkDelete = async () => {
    if (selected.size === 0) return;
    const ids = Array.from(selected);
    let firstError: string | null = null;
    for (const id of ids) {
      const { error } = await supabase.rpc("recycle_soft_delete", { _table: "questions", _id: id });
      if (error && !firstError) firstError = error.message;
    }
    if (firstError) return toast.error(firstError);
    toast.success(`${ids.length} moved to Recycle Bin`);
    setBulkDeleteOpen(false); clearSelection(); load();
  };

  const exportCsv = () => {
    const rows = questions.map((q) => ({
      question_text: q.question_text,
      question_type: q.question_type,
      options: q.options ? q.options.join("|") : "",
      correct_answer: q.correct_answer ?? "",
      correct_answers: q.correct_answers ? q.correct_answers.join("|") : "",
      category: q.category_id ? (catMap.get(q.category_id) ?? "") : "",
      difficulty: q.difficulty,
      approval_status: q.approval_status,
      published: q.published ? "true" : "false",
      sort_order: String(q.sort_order),
    }));
    const csv = toCsv(rows, CSV_HEADERS);
    downloadCsv(`question-bank-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  };
  const exportTemplate = () => {
    const csv = toCsv(
      [
        { question_text: "What is 2 + 2?", question_type: "single_choice", options: "1|2|3|4", correct_answer: "4", correct_answers: "", category: "", difficulty: "easy", approval_status: "approved", published: "true", sort_order: "10" },
        { question_text: "Select all prime numbers.", question_type: "multi_choice", options: "2|3|4|5", correct_answer: "", correct_answers: "2|3|5", category: "", difficulty: "medium", approval_status: "draft", published: "true", sort_order: "20" },
        { question_text: "The earth is flat.", question_type: "true_false", options: "", correct_answer: "False", correct_answers: "", category: "", difficulty: "easy", approval_status: "approved", published: "true", sort_order: "30" },
        { question_text: "Define cybersecurity.", question_type: "short_answer", options: "", correct_answer: "Protecting systems, networks and data.", correct_answers: "", category: "", difficulty: "medium", approval_status: "draft", published: "true", sort_order: "40" },
        { question_text: "Explain one safe password practice.", question_type: "open", options: "", correct_answer: "", correct_answers: "", category: "", difficulty: "medium", approval_status: "draft", published: "true", sort_order: "50" },
      ],
      CSV_HEADERS,
    );
    downloadCsv("question-bank-template.csv", csv);
  };

  const handleRows = async (rows: CsvRow[]) => {
    if (rows.length === 0) { toast.error("File is empty."); return; }
    const missing = ["question_text", "question_type"].filter((h) => !(h in rows[0]));
    if (missing.length) { toast.error(`Missing columns: ${missing.join(", ")}.`); return; }
    const payloads: QuestionInsert[] = [];
    for (let i = 0; i < rows.length; i++) {
      const res = validateRow(rows[i], i, catByName);
      if ("error" in res) { toast.error(res.error); return; }
      payloads.push(res.payload);
    }
    let nextOrder = (questions[questions.length - 1]?.sort_order ?? 0) + 10;
    for (const p of payloads) if (p.sort_order == null) { p.sort_order = nextOrder; nextOrder += 10; }
    const { error } = await supabase.from("questions").insert(payloads);
    if (error) { toast.error(error.message); return; }
    toast.success(`Imported ${payloads.length} questions.`);
    load();
  };

  const onPickImport = () => fileRef.current?.click();
  const onImportFile = async (file: File) => {
    setImporting(true);
    try {
      const isXlsx = /\.(xlsx|xls)$/i.test(file.name);
      const rows = isXlsx ? await parseXlsx(file) : parseCsv(await file.text());
      await handleRows(rows);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to import file.");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const toggleReveal = (id: string) => setRevealed((r) => ({ ...r, [id]: !r[id] }));
  const maskAnswer = (q: AdminQuestion) => {
    const show = revealAll || revealed[q.id];
    const answer = q.question_type === "multi_choice" && q.correct_answers?.length
      ? q.correct_answers.join(", ")
      : (q.correct_answer ?? "");
    if (show) return answer || "No answer key";
    return "•".repeat(Math.min(12, Math.max(6, answer.length || 6)));
  };

  const selectedQuestion = selected.size === 1
    ? questions.find((q) => selected.has(q.id)) ?? null
    : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Questions</h3>
          <p className="text-sm text-muted-foreground">
            Create, approve, publish, and assign questions. Answers stay admin-only.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setRevealAll((v) => !v)}>
            {revealAll ? <><EyeOff className="h-4 w-4 mr-1" /> Hide answers</> : <><Eye className="h-4 w-4 mr-1" /> Reveal answers</>}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm"><Download className="h-4 w-4 mr-1" /> Export</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={exportCsv}>Export all (CSV)</DropdownMenuItem>
              <DropdownMenuItem onClick={exportTemplate}>Download CSV template</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" size="sm" onClick={onPickImport} disabled={importing}>
            <Upload className="h-4 w-4 mr-1" /> {importing ? "Importing…" : "Import CSV / Excel"}
          </Button>
          <input
            ref={fileRef} type="file"
            accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onImportFile(f); }}
          />
          <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) reset(); }}>
            <DialogTrigger asChild>
              <Button onClick={openAdd}><Plus className="h-4 w-4 mr-1" /> Add question</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>{editing ? "Edit question" : "Add question"}</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Question</Label>
                  <Textarea rows={3} value={formText} onChange={(e) => setFormText(e.target.value)} placeholder="What is..." />
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Type</Label>
                    <Select value={formType} onValueChange={(v) => setFormType(v as QType)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="open">Open Response</SelectItem>
                        <SelectItem value="single_choice">Single Choice</SelectItem>
                        <SelectItem value="multi_choice">Multi-Select</SelectItem>
                        <SelectItem value="mcq">Multiple Choice (legacy)</SelectItem>
                        <SelectItem value="true_false">True / False</SelectItem>
                        <SelectItem value="short_answer">Short Answer</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Difficulty</Label>
                    <Select value={formDifficulty} onValueChange={(v) => setFormDifficulty(v as Difficulty)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {DIFFICULTIES.map((d) => <SelectItem key={d} value={d} className="capitalize">{d}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Category</Label>
                    <Select value={formCategoryId || "none"} onValueChange={(v) => setFormCategoryId(v === "none" ? "" : v)}>
                      <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Approval status</Label>
                    <Select value={formApproval} onValueChange={(v) => setFormApproval(v as Approval)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(Object.keys(APPROVAL_LABEL) as Approval[]).map((a) => <SelectItem key={a} value={a}>{APPROVAL_LABEL[a]}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-md border px-3 py-2">
                  <span className="text-sm">{formPublished ? "Published — visible to applicants (if approved)" : "Unpublished — hidden"}</span>
                  <Switch checked={formPublished} onCheckedChange={setFormPublished} />
                </div>

                {(formType === "mcq" || formType === "single_choice" || formType === "multi_choice") && (
                  <div className="space-y-1.5">
                    <Label>Options</Label>
                    {formOptions.map((opt, i) => (
                      <div key={i} className="flex items-center gap-2">
                        {formType === "multi_choice" ? (
                          <Checkbox
                            checked={formCorrectMulti.includes(opt) && opt.length > 0}
                            onCheckedChange={(v) => {
                              setFormCorrectMulti((prev) => v
                                ? Array.from(new Set([...prev, opt])).filter(Boolean)
                                : prev.filter((x) => x !== opt));
                            }}
                          />
                        ) : null}
                        <Input
                          placeholder={`Option ${i + 1}`} value={opt}
                          onChange={(e) => {
                            const c = [...formOptions]; const old = c[i]; c[i] = e.target.value; setFormOptions(c);
                            if (formType === "multi_choice") {
                              setFormCorrectMulti((prev) => prev.map((x) => (x === old ? e.target.value : x)));
                            }
                            if ((formType === "mcq" || formType === "single_choice") && formCorrect === old) setFormCorrect(e.target.value);
                          }}
                        />
                      </div>
                    ))}
                    <Button variant="ghost" size="sm" onClick={() => setFormOptions([...formOptions, ""])}>+ Add option</Button>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5">
                    <Lock className="h-3.5 w-3.5" />
                    {formType === "open" ? "Model answer / rubric (optional)" : "Correct answer (admin-only)"}
                  </Label>
                  {formType === "short_answer" || formType === "open" ? (
                    <Textarea rows={4} value={formCorrect} onChange={(e) => setFormCorrect(e.target.value)} placeholder={formType === "open" ? "Optional review notes or exact-match answer" : "Model answer"} />
                  ) : formType === "true_false" ? (
                    <Select value={formCorrect} onValueChange={setFormCorrect}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent><SelectItem value="True">True</SelectItem><SelectItem value="False">False</SelectItem></SelectContent>
                    </Select>
                  ) : formType === "multi_choice" ? (
                    <div className="text-xs text-muted-foreground border rounded-md p-2 bg-muted/40">
                      Tick the correct options above. Selected: {formCorrectMulti.filter(Boolean).join(", ") || "none"}
                    </div>
                  ) : (
                    <Select value={formCorrect} onValueChange={setFormCorrect}>
                      <SelectTrigger><SelectValue placeholder="Pick one of the options" /></SelectTrigger>
                      <SelectContent>{formOptions.filter(Boolean).map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                    </Select>
                  )}
                  <p className="text-xs text-muted-foreground">Hidden from applicants by row-level security.</p>
                </div>

                <Button className="w-full" onClick={save} disabled={saving}>
                  {saving ? "Saving…" : editing ? "Update question" : "Add question"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Input className="w-64" placeholder="Search questions…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {VALID_TYPES.map((t) => <SelectItem key={t} value={t}>{TYPE_LABEL[t]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterCat} onValueChange={setFilterCat}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterDiff} onValueChange={setFilterDiff}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Difficulty" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All difficulties</SelectItem>
            {DIFFICULTIES.map((d) => <SelectItem key={d} value={d} className="capitalize">{d}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterApproval} onValueChange={setFilterApproval}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Approval" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {(Object.keys(APPROVAL_LABEL) as Approval[]).map((a) => <SelectItem key={a} value={a}>{APPROVAL_LABEL[a]}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {selected.size > 0 && (
        <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/60 backdrop-blur px-3 py-2">
          <div className="text-sm"><strong>{selected.size}</strong> selected</div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => bulkSetApproval("pending")}><Send className="h-4 w-4 mr-1" /> Submit</Button>
            <Button size="sm" variant="outline" onClick={() => bulkSetApproval("approved")}><CheckCircle2 className="h-4 w-4 mr-1" /> Approve</Button>
            <Button size="sm" variant="outline" onClick={() => bulkSetApproval("rejected")}><XCircle className="h-4 w-4 mr-1" /> Reject</Button>
            <Button size="sm" variant="outline" onClick={() => bulkSetPublished(true)}><EyeIcon className="h-4 w-4 mr-1" /> Publish</Button>
            <Button size="sm" variant="outline" onClick={() => bulkSetPublished(false)}><EyeOffIcon className="h-4 w-4 mr-1" /> Unpublish</Button>
            <Button size="sm" variant="destructive" onClick={() => setBulkDeleteOpen(true)}><Trash2 className="h-4 w-4 mr-1" /> Delete</Button>
            <Button size="sm" variant="ghost" onClick={clearSelection}>Clear</Button>
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {loading ? "Loading…" : `${filtered.length} of ${questions.length} · ${questions.filter((q) => q.approval_status === "approved" && q.published).length} live`}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox checked={allSelectedOnPage} onCheckedChange={(v) => toggleSelectAll(!!v)} aria-label="Select all" />
                </TableHead>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Question</TableHead>
                <TableHead className="w-32">Type</TableHead>
                <TableHead className="w-32">Category</TableHead>
                <TableHead className="w-24">Difficulty</TableHead>
                <TableHead className="w-28">Approval</TableHead>
                <TableHead className="w-28">Published</TableHead>
                <TableHead className="w-56">Answer</TableHead>
                <TableHead className="w-44 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((q, i) => (
                <TableRow key={q.id} className={reorderingId === q.id ? "opacity-50" : undefined}>
                  <TableCell>
                    <Checkbox checked={selected.has(q.id)} onCheckedChange={(v) => toggleSelect(q.id, !!v)} aria-label={`Select ${i + 1}`} />
                  </TableCell>
                  <TableCell className="text-muted-foreground tabular-nums">{i + 1}</TableCell>
                  <TableCell className="font-medium align-top whitespace-pre-wrap max-w-md">{q.question_text}</TableCell>
                  <TableCell><Badge variant="secondary" className="text-xs">{TYPE_LABEL[q.question_type]}</Badge></TableCell>
                  <TableCell className="text-sm">{q.category_id ? catMap.get(q.category_id) ?? "—" : <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell><Badge variant="outline" className="capitalize">{q.difficulty}</Badge></TableCell>
                  <TableCell>{approvalBadge(q.approval_status)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch checked={q.published} onCheckedChange={() => togglePublished(q)} />
                      {q.published
                        ? <Badge className="bg-success/15 text-success border border-success/30">Live</Badge>
                        : <Badge variant="outline" className="text-muted-foreground">Hidden</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm align-top">
                    <div className="flex items-start gap-2">
                      <span className="flex-1 break-words whitespace-pre-wrap">{maskAnswer(q)}</span>
                      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0"
                        aria-label={revealAll || revealed[q.id] ? "Hide" : "Reveal"}
                        onClick={() => toggleReveal(q.id)} disabled={revealAll}>
                        {revealAll || revealed[q.id] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1 justify-end">
                      <Button variant="ghost" size="icon" disabled={i === 0 || !!reorderingId} onClick={() => move(i, -1)} aria-label="Up"><ArrowUp className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" disabled={i === filtered.length - 1 || !!reorderingId} onClick={() => move(i, 1)} aria-label="Down"><ArrowDown className="h-4 w-4" /></Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Question</DropdownMenuLabel>
                          <DropdownMenuItem onClick={() => openEdit(q)}><Pencil className="h-4 w-4 mr-2" /> Edit</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => togglePublished(q)}>
                            {q.published ? <><EyeOffIcon className="h-4 w-4 mr-2" /> Unpublish</> : <><EyeIcon className="h-4 w-4 mr-2" /> Publish</>}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuLabel>Approval</DropdownMenuLabel>
                          <DropdownMenuItem onClick={() => setApproval(q, "pending")}><Send className="h-4 w-4 mr-2" /> Submit for approval</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setApproval(q, "approved")}><CheckCircle2 className="h-4 w-4 mr-2" /> Approve</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => { setRejectTarget(q); setRejectReason(""); }}><XCircle className="h-4 w-4 mr-2" /> Reject…</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteTarget(q)}>
                            <Trash2 className="h-4 w-4 mr-2" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {!loading && filtered.length === 0 && (
                <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-10">
                  No questions match. Adjust filters or click “Add question”.
                </TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        CSV / Excel columns: <code>question_text</code>, <code>question_type</code> (open | single_choice | multi_choice | mcq | true_false | short_answer),
        <code> options</code> (pipe-separated), <code>correct_answer</code>, <code>correct_answers</code> (multi-select, pipe-separated),
        <code> category</code>, <code>difficulty</code>, <code>approval_status</code>, <code>published</code>, <code>sort_order</code>.
      </p>

      {/* Footer action bar */}
      <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-end gap-2 border-t bg-background/95 backdrop-blur px-3 py-2">
        <Button variant="outline" onClick={openAdd}><Plus className="h-4 w-4 mr-1" /> Add</Button>
        <Button variant="outline" disabled={!selectedQuestion} onClick={() => selectedQuestion && openEdit(selectedQuestion)}>
          <Pencil className="h-4 w-4 mr-1" /> Edit
        </Button>
        <Button variant="outline" disabled={selected.size === 0} onClick={() => bulkSetApproval("approved")}>
          <CheckCircle2 className="h-4 w-4 mr-1" /> Approve
        </Button>
        <Button variant="outline" disabled={selected.size === 0} onClick={() => bulkSetApproval("rejected")}>
          <XCircle className="h-4 w-4 mr-1" /> Reject
        </Button>
        <Button variant="destructive" disabled={selected.size === 0} onClick={() => setBulkDeleteOpen(true)}>
          <Trash2 className="h-4 w-4 mr-1" /> Delete
        </Button>
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this question?</AlertDialogTitle>
            <AlertDialogDescription>This permanently removes the question and its answer. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selected.size} question{selected.size === 1 ? "" : "s"}?</AlertDialogTitle>
            <AlertDialogDescription>Selected questions and answers will be permanently removed.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={bulkDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete selected</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!rejectTarget} onOpenChange={(o) => !o && setRejectTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reject question</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Textarea rows={3} placeholder="Reason (optional)" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
            <Button className="w-full" onClick={async () => { if (rejectTarget) { await setApproval(rejectTarget, "rejected", rejectReason.trim() || undefined); setRejectTarget(null); } }}>
              Reject
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}



export function QuestionsSection() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Question Bank</h2>
        <p className="text-sm text-muted-foreground">
          Manage questions, categories, organizations, departments, and assignments across the platform.
        </p>
      </div>
      <Tabs defaultValue="questions" className="space-y-4">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="questions">Questions</TabsTrigger>
          <TabsTrigger value="sets">Sets</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
          <TabsTrigger value="organizations">Organizations</TabsTrigger>
          <TabsTrigger value="departments">Departments</TabsTrigger>
          <TabsTrigger value="assignments">Assignments</TabsTrigger>
        </TabsList>
        <TabsContent value="questions"><QuestionsList /></TabsContent>
        <TabsContent value="sets"><QuestionSetsTab /></TabsContent>
        <TabsContent value="categories"><CategoriesTab /></TabsContent>
        <TabsContent value="organizations"><OrganizationsTab /></TabsContent>
        <TabsContent value="departments"><DepartmentsTab /></TabsContent>
        <TabsContent value="assignments"><AssignmentsTab /></TabsContent>
      </Tabs>
    </div>
  );
}
