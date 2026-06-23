import { Fragment as FragmentRow, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, ChevronRight, ChevronDown, Building2 } from "lucide-react";
import { toast } from "@/components/ui/sonner";

type Org = { id: string; name: string; code: string | null; active: boolean };
type Dept = { id: string; organization_id: string; name: string; code: string | null };

export function OrganizationsTab() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [depts, setDepts] = useState<Dept[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const [orgOpen, setOrgOpen] = useState(false);
  const [editingOrg, setEditingOrg] = useState<Org | null>(null);
  const [orgName, setOrgName] = useState("");
  const [orgCode, setOrgCode] = useState("");
  const [orgActive, setOrgActive] = useState(true);

  const [deptOpen, setDeptOpen] = useState(false);
  const [deptOrgId, setDeptOrgId] = useState<string>("");
  const [editingDept, setEditingDept] = useState<Dept | null>(null);
  const [deptName, setDeptName] = useState("");
  const [deptCode, setDeptCode] = useState("");

  const [delOrg, setDelOrg] = useState<Org | null>(null);
  const [delDept, setDelDept] = useState<Dept | null>(null);

  const load = async () => {
    setLoading(true);
    const [o, d] = await Promise.all([
      supabase.from("organizations").select("id,name,code,active").order("name"),
      supabase.from("departments").select("id,organization_id,name,code").order("name"),
    ]);
    if (o.error) toast.error(o.error.message); else setOrgs((o.data ?? []) as Org[]);
    if (d.error) toast.error(d.error.message); else setDepts((d.data ?? []) as Dept[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const toggleRow = (id: string) => {
    setExpanded((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const resetOrg = () => { setEditingOrg(null); setOrgName(""); setOrgCode(""); setOrgActive(true); };
  const openAddOrg = () => { resetOrg(); setOrgOpen(true); };
  const openEditOrg = (o: Org) => { setEditingOrg(o); setOrgName(o.name); setOrgCode(o.code ?? ""); setOrgActive(o.active); setOrgOpen(true); };
  const saveOrg = async () => {
    const n = orgName.trim();
    if (!n) return toast.error("Name required.");
    const payload = { name: n, code: orgCode.trim() || null, active: orgActive };
    const { error } = editingOrg
      ? await supabase.from("organizations").update(payload).eq("id", editingOrg.id)
      : await supabase.from("organizations").insert(payload);
    if (error) return toast.error(error.message);
    toast.success(editingOrg ? "Organization updated" : "Organization added");
    setOrgOpen(false); resetOrg(); load();
  };
  const removeOrg = async () => {
    if (!delOrg) return;
    const { error } = await supabase.from("organizations").delete().eq("id", delOrg.id);
    if (error) return toast.error(error.message);
    toast.success("Organization deleted");
    setDelOrg(null); load();
  };

  const resetDept = () => { setEditingDept(null); setDeptName(""); setDeptCode(""); };
  const openAddDept = (orgId: string) => { resetDept(); setDeptOrgId(orgId); setDeptOpen(true); };
  const openEditDept = (d: Dept) => { setEditingDept(d); setDeptOrgId(d.organization_id); setDeptName(d.name); setDeptCode(d.code ?? ""); setDeptOpen(true); };
  const saveDept = async () => {
    const n = deptName.trim();
    if (!n) return toast.error("Name required.");
    const payload = { name: n, code: deptCode.trim() || null, organization_id: deptOrgId };
    const { error } = editingDept
      ? await supabase.from("departments").update(payload).eq("id", editingDept.id)
      : await supabase.from("departments").insert(payload);
    if (error) return toast.error(error.message);
    toast.success(editingDept ? "Department updated" : "Department added");
    setDeptOpen(false); resetDept(); load();
  };
  const removeDept = async () => {
    if (!delDept) return;
    const { error } = await supabase.from("departments").delete().eq("id", delDept.id);
    if (error) return toast.error(error.message);
    toast.success("Department deleted");
    setDelDept(null); load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Organizations & Departments</h3>
          <p className="text-sm text-muted-foreground">Agencies and their internal departments for question assignment.</p>
        </div>
        <Button onClick={openAddOrg}><Plus className="h-4 w-4 mr-1" /> Add organization</Button>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">{loading ? "Loading…" : `${orgs.length} organizations`}</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
                <TableHead>Name</TableHead>
                <TableHead className="w-32">Code</TableHead>
                <TableHead className="w-24">Status</TableHead>
                <TableHead className="w-44 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orgs.map((o) => {
                const isOpen = expanded.has(o.id);
                const orgDepts = depts.filter((d) => d.organization_id === o.id);
                return (
                  <FragmentRow key={o.id}>
                    <TableRow>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => toggleRow(o.id)} aria-label="Toggle">
                          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </Button>
                      </TableCell>
                      <TableCell className="font-medium flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-muted-foreground" /> {o.name}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{o.code ?? "—"}</TableCell>
                      <TableCell>
                        {o.active ? <Badge className="bg-success/15 text-success border border-success/30">Active</Badge> : <Badge variant="outline">Inactive</Badge>}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => openAddDept(o.id)}><Plus className="h-3.5 w-3.5 mr-1" /> Dept</Button>
                        <Button variant="ghost" size="icon" onClick={() => openEditOrg(o)} aria-label="Edit"><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => setDelOrg(o)} aria-label="Delete"><Trash2 className="h-4 w-4" /></Button>
                      </TableCell>
                    </TableRow>
                    {isOpen && (
                      <TableRow>
                        <TableCell />
                        <TableCell colSpan={4} className="bg-muted/30">
                          {orgDepts.length === 0 ? (
                            <p className="text-sm text-muted-foreground py-2">No departments yet.</p>
                          ) : (
                            <div className="space-y-1 py-1">
                              {orgDepts.map((d) => (
                                <div key={d.id} className="flex items-center justify-between gap-2 rounded px-2 py-1 hover:bg-background">
                                  <div className="text-sm"><span className="font-medium">{d.name}</span>{d.code && <span className="text-muted-foreground ml-2">({d.code})</span>}</div>
                                  <div>
                                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditDept(d)} aria-label="Edit"><Pencil className="h-3.5 w-3.5" /></Button>
                                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDelDept(d)} aria-label="Delete"><Trash2 className="h-3.5 w-3.5" /></Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    )}
                  </FragmentRow>
                );
              })}
              {!loading && orgs.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No organizations yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2 border-t pt-3">
        <Button variant="outline" onClick={openAddOrg}><Plus className="h-4 w-4 mr-1" /> Add</Button>
      </div>

      <Dialog open={orgOpen} onOpenChange={(o) => { setOrgOpen(o); if (!o) resetOrg(); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingOrg ? "Edit organization" : "Add organization"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Name</Label><Input value={orgName} onChange={(e) => setOrgName(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Code (optional)</Label><Input value={orgCode} onChange={(e) => setOrgCode(e.target.value)} placeholder="e.g. GIS" /></div>
            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <span className="text-sm">{orgActive ? "Active" : "Inactive"}</span>
              <Switch checked={orgActive} onCheckedChange={setOrgActive} />
            </div>
            <Button className="w-full" onClick={saveOrg}>{editingOrg ? "Update" : "Add"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={deptOpen} onOpenChange={(o) => { setDeptOpen(o); if (!o) resetDept(); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingDept ? "Edit department" : "Add department"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Name</Label><Input value={deptName} onChange={(e) => setDeptName(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Code (optional)</Label><Input value={deptCode} onChange={(e) => setDeptCode(e.target.value)} /></div>
            <Button className="w-full" onClick={saveDept}>{editingDept ? "Update" : "Add"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!delOrg} onOpenChange={(o) => !o && setDelOrg(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this organization?</AlertDialogTitle>
            <AlertDialogDescription>All departments and assignments under it will be removed.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={removeOrg} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!delDept} onOpenChange={(o) => !o && setDelDept(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this department?</AlertDialogTitle>
            <AlertDialogDescription>Assignments to this department will be removed.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={removeDept} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
