import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { Upload, Image as ImageIcon, Trash2 } from "lucide-react";
import { fetchBranding, setBrandingCache } from "@/hooks/useBranding";

const MAX_BYTES = 400 * 1024; // 400KB cap on uploaded logo
const SIGNED_URL_TTL = 60 * 60 * 24 * 365 * 10; // 10 years

export function BrandSettingsSection() {
  const [name, setName] = useState("CYBER TEST 360");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("brand_name, brand_logo_url")
        .eq("id", 1)
        .maybeSingle();
      if (data) {
        setName(data.brand_name || "CYBER TEST 360");
        // Migrate-away: if legacy inline data URL is still cached, ignore it.
        const v = data.brand_logo_url || null;
        setLogoUrl(v && v.startsWith("data:") ? null : v);
      }
      setLoading(false);
    })();
  }, []);

  const onPickFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file (PNG, JPG, SVG, WebP).");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("Logo must be 400KB or smaller. Compress it and try again.");
      return;
    }
    setUploading(true);
    try {
      const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
      const path = `logo-${Date.now()}.${ext}`;
      const up = await supabase.storage
        .from("brand")
        .upload(path, file, { upsert: true, contentType: file.type, cacheControl: "3600" });
      if (up.error) throw up.error;
      const signed = await supabase.storage.from("brand").createSignedUrl(path, SIGNED_URL_TTL);
      if (signed.error || !signed.data?.signedUrl) throw signed.error ?? new Error("Could not sign URL");
      setLogoUrl(signed.data.signedUrl);
      toast.success("Logo uploaded. Click Save to apply.");
    } catch (e: any) {
      toast.error(e?.message || "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    const trimmed = name.trim();
    if (trimmed.length < 2) return toast.error("Brand name is too short.");
    if (trimmed.length > 60) return toast.error("Brand name must be 60 characters or fewer.");
    setSaving(true);
    const { error } = await supabase
      .from("app_settings")
      .update({ brand_name: trimmed, brand_logo_url: logoUrl })
      .eq("id", 1);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setBrandingCache({ name: trimmed, logoUrl });
    await fetchBranding(true);
    toast.success("Brand settings saved — applied across the site, emails, and reports.");
  };

  const removeLogo = () => {
    setLogoUrl(null);
    if (fileRef.current) fileRef.current.value = "";
  };


  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Brand Settings</h2>
        <p className="text-sm text-muted-foreground">
          Change the app name and logo used everywhere — site title, admin console, transactional emails, and PDF reports.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Identity</CardTitle>
          <CardDescription>These values are applied globally as soon as you save.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2 max-w-md">
            <Label htmlFor="brand-name">App name</Label>
            <Input
              id="brand-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              disabled={loading}
              placeholder="CYBER TEST 360"
            />
            <p className="text-xs text-muted-foreground">Used in browser tab, headers, emails, and PDF reports.</p>
          </div>

          <div className="space-y-2">
            <Label>Logo</Label>
            <div className="flex flex-wrap items-center gap-4">
              <div className="h-24 w-24 rounded-xl border bg-muted/30 flex items-center justify-center overflow-hidden">
                {logoUrl ? (
                  <img src={logoUrl} alt="Brand logo preview" className="max-h-full max-w-full object-contain" />
                ) : (
                  <ImageIcon className="h-8 w-8 text-muted-foreground" />
                )}
              </div>
              <div className="flex flex-col gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onPickFile(f);
                  }}
                />
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
                    <Upload className="h-4 w-4 mr-2" /> {uploading ? "Uploading…" : "Upload logo"}
                  </Button>
                  {logoUrl && (
                    <Button type="button" variant="ghost" onClick={removeLogo}>
                      <Trash2 className="h-4 w-4 mr-2" /> Remove
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  PNG, JPG, SVG or WebP · up to 400KB · square works best.
                </p>
              </div>
            </div>
          </div>

          <div className="pt-2">
            <Button onClick={save} disabled={saving || loading}>
              {saving ? "Saving…" : "Save brand settings"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
