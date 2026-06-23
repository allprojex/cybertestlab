import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type Branding = { name: string; logoUrl: string | null };

const DEFAULTS: Branding = { name: "CYBER TEST 360", logoUrl: null };

let cache: Branding | null = null;
let pending: Promise<Branding> | null = null;
const listeners = new Set<(b: Branding) => void>();

export async function fetchBranding(force = false): Promise<Branding> {
  if (cache && !force) return cache;
  if (pending && !force) return pending;
  pending = (async () => {
    const { data } = await supabase
      .from("app_settings")
      .select("brand_name, brand_logo_url")
      .eq("id", 1)
      .maybeSingle();
    const b: Branding = {
      name: data?.brand_name || DEFAULTS.name,
      logoUrl: data?.brand_logo_url || null,
    };
    cache = b;
    pending = null;
    if (typeof document !== "undefined") document.title = b.name;
    listeners.forEach((cb) => cb(b));
    return b;
  })();
  return pending;
}

export function setBrandingCache(b: Branding) {
  cache = b;
  if (typeof document !== "undefined") document.title = b.name;
  listeners.forEach((cb) => cb(b));
}

export function useBranding(): Branding {
  const [b, setB] = useState<Branding>(cache ?? DEFAULTS);
  useEffect(() => {
    listeners.add(setB);
    if (!cache) fetchBranding();
    else setB(cache);
    return () => {
      listeners.delete(setB);
    };
  }, []);
  return b;
}
