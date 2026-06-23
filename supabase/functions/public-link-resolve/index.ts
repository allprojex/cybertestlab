import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.23.8";

const ALLOWED_ORIGINS = [
  "https://pretestlab.lovable.app",
  "https://cybertestlab.lovable.app",
  "http://localhost:8080",
  "http://localhost:5173",
  "http://localhost:4173",
];

function buildCorsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && (
    ALLOWED_ORIGINS.includes(origin) ||
    /^https:\/\/[a-z0-9-]+\.lovable\.app$/i.test(origin) ||
    /^https:\/\/[a-z0-9-]+\.lovableproject\.com$/i.test(origin)
  ) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Vary": "Origin",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

const BodySchema = z.object({ token: z.string().uuid() });

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let body: unknown;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "invalid_json" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: "invalid_request" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const { data: link, error } = await supabase
    .from("question_set_share_links")
    .select("id, set_id, enabled, max_uses, uses_count, expires_at, question_sets:set_id(id,name,active)")
    .eq("token", parsed.data.token)
    .maybeSingle();

  if (error || !link) {
    return new Response(JSON.stringify({ ok: false, reason: "not_found" }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const set = (link as any).question_sets;
  if (!link.enabled || !set?.active) {
    return new Response(JSON.stringify({ ok: false, reason: "disabled" }),
      { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) {
    return new Response(JSON.stringify({ ok: false, reason: "expired" }),
      { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  if (link.max_uses != null && link.uses_count >= link.max_uses) {
    return new Response(JSON.stringify({ ok: false, reason: "exhausted" }),
      { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  return new Response(
    JSON.stringify({ ok: true, set_id: set.id, set_name: set.name }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
