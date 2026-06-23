import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "@/components/ui/sonner";

type Category = { id: string; name: string; description: string | null };

export function CategoriesTab() {
  const [items, setItems] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [saving, setSaving] = useState(false);
  const [delTarget, setDelTarget] = useState<Category | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("question_categories")
      .select("id,name,description")
      .order("name");
    if (error) toast.error(error.message);
    if (data) setItems(data as Category[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const reset = () => { setEditing(null); setName(""); setDesc(""); };
  const openAdd = () => { reset(); setOpen(true); };
  const openEdit = (c: Category) => { setEditing(c); setName(c.name); setDesc(c.description ?? ""); setOpen(true); };

  const save = async () => {
    const n = name.trim();
    if (!n) return toast.error("Name is required.");
    setSaving(true);
    const payload = { name: n, description: desc.trim() || null };
    const { error } = editing
      ? await supabase.from("question_categories").update(payload).eq("id", editing.id)
      : await supabase.from("question_categories").insert(payload);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(editing ? "Category updated" : "Category added");
    setOpen(false); reset(); load();
  };

  const remove = async () => {
    if (!delTarget) return;
    const { error } = await supabase.from("question_categories").delete().eq("id", delTarget.id);
    if (error) return toast.error(error.message);
    toast.success("Category deleted");
    setDelTarget(null); load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Categories</h3>
          <p className="text-sm text-muted-foreground">Group questions by topic or skill area.</p>
        </div>
        <Button onClick={openAdd}><Plus className="h-4 w-4 mr-1" /> Add category</Button>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">{loading ? "Loading…" : `${items.length} categories`}</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-32 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell className="text-muted-foreground">{c.description ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(c)} aria-label="Edit"><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => setDelTarget(c)} aria-label="Delete"><Trash2 className="h-4 w-4" /></Button>
                  </TableCell>
                </TableRow>
              ))}
              {!loading && items.length === 0 && (
                <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-8">No categories yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2 border-t pt-3">
        <Button variant="outline" onClick={openAdd}><Plus className="h-4 w-4 mr-1" /> Add</Button>
      </div>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit category" : "Add category"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Description</Label><Textarea rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
            <Button className="w-full" onClick={save} disabled={saving}>{saving ? "Saving…" : editing ? "Update" : "Add"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!delTarget} onOpenChange={(o) => !o && setDelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this category?</AlertDialogTitle>
            <AlertDialogDescription>Questions assigned to it will keep their data, but lose this label.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={remove} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
