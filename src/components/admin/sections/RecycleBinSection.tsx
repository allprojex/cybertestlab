import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, RotateCcw, Loader2, Recycle } from "lucide-react";
import { toast } from "@/components/ui/sonner";

type BinRow = {
  kind: "applicants" | "questions" | "question_sets";
  id: string;
  label: string;
  deleted_at: string;
  deleted_by: string | null;
};

const KIND_LABEL: Record<BinRow["kind"], string> = {
  applicants: "User",
  questions: "Question",
  question_sets: "Question set",
};

export function RecycleBinSection() {
  const [rows, setRows] = useState<BinRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | BinRow["kind"]>("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmPurge, setConfirmPurge] = useState<BinRow | null>(null);
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [emptying, setEmptying] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("recycle_list");
    setLoading(false);
    if (error) return toast.error(error.message);
    setRows((data as BinRow[]) ?? []);
  };
  useEffect(() => { load(); }, []);

  const visible = filter === "all" ? rows : rows.filter((r) => r.kind === filter);
  const counts = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.kind] = (acc[r.kind] ?? 0) + 1; return acc;
  }, {});

  const restore = async (r: BinRow) => {
    setBusyId(r.id);
    const { error } = await supabase.rpc("recycle_restore", { _table: r.kind, _id: r.id });
    setBusyId(null);
    if (error) return toast.error(error.code === "42501" ? "Admins only." : error.message);
    toast.success(`${KIND_LABEL[r.kind]} restored`);
    load();
  };

  const purge = async () => {
    if (!confirmPurge) return;
    setBusyId(confirmPurge.id);
    const { error } = await supabase.rpc("recycle_purge", { _table: confirmPurge.kind, _id: confirmPurge.id });
    setBusyId(null);
    setConfirmPurge(null);
    if (error) return toast.error(error.code === "42501" ? "Admins only." : error.message);
    toast.success("Permanently deleted");
    load();
  };

  const emptyBin = async () => {
    setEmptying(true);
    const arg = filter === "all" ? {} : { _table: filter };
    const { data, error } = await supabase.rpc("recycle_empty", arg as any);
    setEmptying(false);
    setConfirmEmpty(false);
    if (error) return toast.error(error.code === "42501" ? "Admins only." : error.message);
    const n = (data as any)?.purged ?? 0;
    toast.success(`Purged ${n} item${n === 1 ? "" : "s"}`);
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Recycle className="h-5 w-5 text-muted-foreground" /> Recycle Bin
          </h2>
          <p className="text-sm text-muted-foreground">
            Deleted users, questions, and question sets stay here until you restore or permanently purge them.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All ({rows.length})</SelectItem>
              <SelectItem value="applicants">Users ({counts.applicants ?? 0})</SelectItem>
              <SelectItem value="questions">Questions ({counts.questions ?? 0})</SelectItem>
              <SelectItem value="question_sets">Question sets ({counts.question_sets ?? 0})</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="destructive" onClick={() => setConfirmEmpty(true)} disabled={rows.length === 0 || emptying}>
            <Trash2 className="h-4 w-4 mr-1" /> Empty {filter === "all" ? "bin" : "filtered"}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">{loading ? "Loading…" : `${visible.length} item${visible.length === 1 ? "" : "s"}`}</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-32">Type</TableHead>
                <TableHead>Item</TableHead>
                <TableHead className="w-44">Deleted</TableHead>
                <TableHead className="w-48 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                  <Loader2 className="h-4 w-4 inline animate-spin mr-2" /> Loading bin…
                </TableCell></TableRow>
              ) : visible.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center py-10 text-muted-foreground">
                  Recycle Bin is empty.
                </TableCell></TableRow>
              ) : visible.map((r) => (
                <TableRow key={`${r.kind}-${r.id}`}>
                  <TableCell><Badge variant="secondary">{KIND_LABEL[r.kind]}</Badge></TableCell>
                  <TableCell className="max-w-md truncate">{r.label}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{new Date(r.deleted_at).toLocaleString()}</TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button variant="outline" size="sm" onClick={() => restore(r)} disabled={busyId === r.id}>
                      <RotateCcw className="h-3.5 w-3.5 mr-1" /> Restore
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => setConfirmPurge(r)} disabled={busyId === r.id}>
                      <Trash2 className="h-3.5 w-3.5 mr-1" /> Purge
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AlertDialog open={!!confirmPurge} onOpenChange={(o) => !o && setConfirmPurge(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently delete this item?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. The {confirmPurge ? KIND_LABEL[confirmPurge.kind].toLowerCase() : "item"} will be removed from the database forever.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={purge} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Purge forever
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmEmpty} onOpenChange={setConfirmEmpty}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Empty {filter === "all" ? "the entire Recycle Bin" : `all ${KIND_LABEL[filter]} items`}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete every item currently shown. There is no undo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={emptyBin} disabled={emptying} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Yes, purge all
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
