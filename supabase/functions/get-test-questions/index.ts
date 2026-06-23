import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.23.8";

const ALLOWED_ORIGINS = [
  "https://pretestlab.lovable.app",
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
      "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

const BodySchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(255).optional().or(z.literal("")),
});

interface PublicQuestion {
  id: string;
  question_text: string;
  question_type: string;
  options: string[] | null;
  created_at: string;
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let body: unknown;
    try { body = await req.json(); } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "Invalid request" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const { name, email } = parsed.data;

    // Find applicant (email preferred, fall back to exact name match)
    let applicantId: string | null = null;
    if (email) {
      const { data } = await supabase
        .from("applicants").select("id").ilike("email", email).limit(1).maybeSingle();
      if (data?.id) applicantId = data.id;
    }
    if (!applicantId) {
      const { data } = await supabase
        .from("applicants").select("id").ilike("full_name", name).limit(1).maybeSingle();
      if (data?.id) applicantId = data.id;
    }

    // Resolve set via SECURITY DEFINER RPC (priority: user > department > org)
    let setId: string | null = null;
    if (applicantId) {
      const { data } = await supabase.rpc("resolve_applicant_set", { _applicant_id: applicantId });
      if (data) setId = data as unknown as string;
    }

    let questions: PublicQuestion[] = [];

    if (setId) {
      const { data: items, error } = await supabase
        .from("question_set_items")
        .select("sort_order, questions:question_id(id, question_text, question_type, options, published, approval_status, created_at)")
        .eq("set_id", setId)
        .order("sort_order");
      if (error) {
        console.error("set_items_error", { code: error.code });
      } else if (items) {
        questions = items
          .map((it: any) => it.questions)
          .filter((q: any) => q && q.published === true && q.approval_status === "approved")
          .map((q: any) => ({
            id: q.id,
            question_text: q.question_text,
            question_type: q.question_type,
            options: q.options ?? null,
            created_at: q.created_at,
          }));
      }
    }

    // Fallback: global pool when no assigned set or set is empty
    if (questions.length === 0) {
      setId = null;
      const { data, error } = await supabase
        .from("questions_public")
        .select("id, question_text, question_type, options, created_at");
      if (error) {
        console.error("fetch_pool_error", { code: error.code });
        return new Response(JSON.stringify({ error: "Failed to load questions" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      questions = (data ?? []) as PublicQuestion[];
    }

    return new Response(
      JSON.stringify({ set_id: setId, questions }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("get_test_questions_unhandled", { message: (err as Error)?.message });
    return new Response(JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
