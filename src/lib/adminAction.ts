import { supabase } from "@/integrations/supabase/client";

let cachedIp: string | null = null;
async function getIp(): Promise<string | null> {
  if (cachedIp) return cachedIp;
  try {
    const r = await fetch("https://api.ipify.org?format=json");
    const j = await r.json();
    cachedIp = j?.ip ?? null;
  } catch {
    cachedIp = null;
  }
  return cachedIp;
}

export async function runAdminAction(applicantId: string, action: string) {
  const ip = await getIp();
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : null;
  return supabase.rpc("admin_user_action" as any, {
    _applicant: applicantId,
    _action: action,
    _ip: ip,
    _user_agent: ua,
  });
}
