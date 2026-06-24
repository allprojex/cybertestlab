import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.23.8";

const ALLOWED_ORIGINS = [
  "https://infinitydatalink.com",
  "https://www.infinitydatalink.com",
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

const BodySchema = z.object({
  token: z.string().uuid(),
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(255),
  phone: z.string().trim().min(5).max(40),
  gender: z.enum(["male", "female", "other", "prefer_not_to_say"]),
});

interface ShareLinkWithSet {
  enabled: boolean;
  expires_at: string | null;
  max_uses: number | null;
  uses_count: number;
  question_sets: { active: boolean } | null;
}

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
    return new Response(JSON.stringify({ error: "invalid_request", details: parsed.error.flatten() }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const { token, name, email, phone, gender } = parsed.data;
  const normEmail = email.toLowerCase();

  // Validate link
  const { data: link } = await supabase
    .from("question_set_share_links")
    .select("id, set_id, enabled, max_uses, uses_count, expires_at, question_sets:set_id(active)")
    .eq("token", token)
    .maybeSingle();

  const set = (link as ShareLinkWithSet | null)?.question_sets;
  if (!link || !link.enabled || !set?.active) {
    return new Response(JSON.stringify({ ok: false, reason: "not_available" }),
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

  // Upsert applicant by email
  const { data: existing } = await supabase
    .from("applicants")
    .select("id, link_token")
    .ilike("email", normEmail)
    .maybeSingle();

  let applicantId: string;
  let linkToken: string;

  if (existing?.id) {
    const newToken = crypto.randomUUID();
    const { error } = await supabase
      .from("applicants")
      .update({
        full_name: name,
        phone,
        gender,
        status: "approved",
        attempts_used: 0,
        link_expires_at: null,
        link_token: newToken,
        source: "public_link",
        share_link_id: link.id,
      })
      .eq("id", existing.id);
    if (error) {
      console.error("update_applicant_error", error);
      return new Response(JSON.stringify({ error: "internal" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    applicantId = existing.id;
    linkToken = newToken;
  } else {
    const newToken = crypto.randomUUID();
    const { data: created, error } = await supabase
      .from("applicants")
      .insert({
        full_name: name,
        email: normEmail,
        phone,
        gender,
        status: "approved",
        source: "public_link",
        share_link_id: link.id,
        link_token: newToken,
      })
      .select("id")
      .single();
    if (error || !created) {
      console.error("insert_applicant_error", error);
      return new Response(JSON.stringify({ error: "internal" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    applicantId = created.id;
    linkToken = newToken;
  }

  // Ensure user-scope assignment to the link's set so resolver picks it up
  const { data: existingAsgn } = await supabase
    .from("question_set_assignments")
    .select("id")
    .eq("scope", "user")
    .eq("applicant_id", applicantId)
    .eq("set_id", link.set_id)
    .maybeSingle();
  if (!existingAsgn) {
    await supabase.from("question_set_assignments").insert({
      set_id: link.set_id,
      scope: "user",
      applicant_id: applicantId,
      notes: "Created via public share link",
    });
  }

  // Increment uses_count
  await supabase
    .from("question_set_share_links")
    .update({ uses_count: link.uses_count + 1 })
    .eq("id", link.id);

  return new Response(
    JSON.stringify({
      ok: true,
      applicant_id: applicantId,
      link_token: linkToken,
      name,
      email: normEmail,
      phone,
      gender,
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
