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

const SubmitSchema = z.object({
  applicant_name: z.string().trim().min(1).max(100),
  applicant_email: z.string().trim().email().max(255).optional().or(z.literal("")),
  applicant_gender: z.enum(["male", "female", "other", "prefer_not_to_say"]).optional().or(z.literal("")),
  answers: z
    .array(
      z.object({
        question_id: z.string().uuid(),
        user_answer: z.string().max(2000).optional().default(""),
      })
    )
    .max(500),
});

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const MAX_SUBMISSIONS_PER_WINDOW = 5;

async function hashToken(token: string): Promise<string> {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req.headers.get("origin"));

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Persistent rate limiting via submission_logs
    const clientIp =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("cf-connecting-ip") ||
      "unknown";
    const sinceIso = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();

    const { count, error: countError } = await supabase
      .from("submission_logs")
      .select("id", { count: "exact", head: true })
      .eq("ip_address", clientIp)
      .gte("created_at", sinceIso);

    if (countError) {
      console.error("rate_limit_count_error", { code: countError.code });
    } else if ((count ?? 0) >= MAX_SUBMISSIONS_PER_WINDOW) {
      return new Response(
        JSON.stringify({ error: "Too many submissions. Please try again later." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate body with Zod
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const parsed = SubmitSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid request payload" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const { applicant_name, applicant_email, applicant_gender, answers } = parsed.data;

    // Resolve assigned question set (priority user > department > organization)
    let applicantId: string | null = null;
    if (applicant_email) {
      const { data: byEmail } = await supabase
        .from("applicants").select("id").ilike("email", applicant_email).limit(1).maybeSingle();
      if (byEmail?.id) applicantId = byEmail.id;
    }
    if (!applicantId) {
      const { data: byName } = await supabase
        .from("applicants").select("id").ilike("full_name", applicant_name).limit(1).maybeSingle();
      if (byName?.id) applicantId = byName.id;
    }
    let setId: string | null = null;
    if (applicantId) {
      const { data: rpc } = await supabase.rpc("resolve_applicant_set", { _applicant_id: applicantId });
      if (rpc) setId = rpc as unknown as string;
    }

    let questions:
      | Array<{ id: string; question_text: string; question_type: string; correct_answer: string }>
      | null = null;

    if (setId) {
      const { data: items } = await supabase
        .from("question_set_items")
        .select("question_id, sort_order, questions:question_id(id, question_text, question_type, correct_answer, published, approval_status)")
        .eq("set_id", setId)
        .order("sort_order");
      if (items) {
        questions = items
          .map((it: any) => it.questions)
          .filter((q: any) => q && q.published === true && q.approval_status === "approved")
          .map((q: any) => ({
            id: q.id,
            question_text: q.question_text,
            question_type: q.question_type,
            correct_answer: q.correct_answer,
          }));
      }
    }

    if (!questions || questions.length === 0) {
      setId = null;
      const { data: all, error: qError } = await supabase
        .from("questions")
        .select("id, question_text, question_type, correct_answer")
        .eq("published", true)
        .eq("approval_status", "approved");
      if (qError || !all || all.length === 0) {
        console.error("fetch_questions_error", { code: qError?.code });
        return new Response(
          JSON.stringify({ error: "Failed to fetch questions" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      questions = all;
    }

    const gradedAnswers = questions.map((q) => {
      const userEntry = answers.find((a) => a.question_id === q.id);
      const userAnswer = (userEntry?.user_answer || "").trim().toLowerCase();
      const correctAnswer = q.correct_answer.trim().toLowerCase();
      return {
        question_id: q.id,
        question_text: q.question_text,
        question_type: q.question_type,
        correct_answer: q.correct_answer,
        user_answer: userEntry?.user_answer || "",
        is_correct: userAnswer === correctAnswer,
      };
    });

    const score = gradedAnswers.filter((a) => a.is_correct).length;
    const totalQuestions = questions.length;
    const percentage = Math.round((score / totalQuestions) * 100 * 100) / 100;

    const accessToken = generateToken();
    const accessTokenHash = await hashToken(accessToken);

    const { data: result, error: insertError } = await supabase
      .from("test_results")
      .insert({
        applicant_name: applicant_name.trim(),
        applicant_email: applicant_email || null,
        score,
        total_questions: totalQuestions,
        percentage,
        answers: gradedAnswers,
        access_token_hash: accessTokenHash,
        applicant_gender: applicant_gender || null,
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("insert_error", { code: insertError.code });
      return new Response(
        JSON.stringify({ error: "Failed to save results" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Mirror submission into test_attempts so admin dashboards (Attempts,
    // KPIs, pass-rate, scores) reflect every completed test. Best-effort:
    // failures here must not break the applicant flow.
    if (applicantId) {
      try {
        const { data: settings } = await supabase
          .from("app_settings").select("pass_mark").eq("id", 1).maybeSingle();
        const passMark = Number(settings?.pass_mark ?? 65);
        const passed = percentage >= passMark;

        const { count: priorCount } = await supabase
          .from("test_attempts")
          .select("id", { count: "exact", head: true })
          .eq("applicant_id", applicantId);
        const attemptNumber = (priorCount ?? 0) + 1;

        const nowIso = new Date().toISOString();
        const { error: attemptErr } = await supabase.from("test_attempts").insert({
          applicant_id: applicantId,
          attempt_number: attemptNumber,
          started_at: nowIso,
          submitted_at: nowIso,
          score,
          total: totalQuestions,
          percentage,
          passed,
          ip: clientIp === "unknown" ? null : clientIp,
        });
        if (attemptErr) {
          console.error("test_attempts_insert_error", { code: attemptErr.code, message: attemptErr.message });
        }
      } catch (e) {
        console.error("test_attempts_mirror_failed", { message: (e as Error)?.message });
      }
    }

    // Record the submission for rate limiting (best effort)
    await supabase.from("submission_logs").insert({ ip_address: clientIp });

    return new Response(
      JSON.stringify({
        result_id: result.id,
        access_token: accessToken,
        score,
        total_questions: totalQuestions,
        percentage,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("submit_test_unhandled", { message: (err as Error)?.message });
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
