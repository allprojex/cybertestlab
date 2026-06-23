import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.23.8";

const ALLOWED_ORIGINS = [
  "https://pretestlab.lovable.app",
  "https://id-preview--ac369ed3-68f9-4a68-807d-d464a9338b92.lovable.app",
  "http://localhost:8080",
  "http://localhost:5173",
  "http://localhost:4173",
];

function buildCorsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && (ALLOWED_ORIGINS.includes(origin) || /^https:\/\/[a-z0-9-]+\.lovable\.app$/i.test(origin) || /^https:\/\/[a-z0-9-]+\.lovableproject\.com$/i.test(origin))
    ? origin
    : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Vary": "Origin",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

const Schema = z.object({
  result_id: z.string().uuid(),
  access_token: z.string().min(32).max(128).regex(/^[a-f0-9]+$/i),
});

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsed = Schema.safeParse(body);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "Invalid request" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: row, error } = await supabase
      .from("test_results")
      .select("id, applicant_name, score, total_questions, percentage, answers, completed_at, access_token_hash")
      .eq("id", parsed.data.result_id)
      .maybeSingle();

    if (error) {
      console.error("get_result_error", { code: error.code });
      return new Response(JSON.stringify({ error: "Lookup failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const expectedHash = await hashToken(parsed.data.access_token);
    if (!row || !row.access_token_hash || !timingSafeEqual(row.access_token_hash, expectedHash)) {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { access_token_hash: _omit, ...safe } = row;
    return new Response(JSON.stringify({ result: safe }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("get_result_unhandled", { message: (err as Error)?.message });
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
