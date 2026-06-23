// Looks up an admin by name, finds the recovery_email stored in user_metadata,
// generates a Supabase password-recovery link, and sends it via the
// transactional email pipeline.
//
// Always returns 200 with { ok: true } when the request is well-formed, even
// if the admin doesn't exist or has no recovery email configured. This avoids
// leaking which admin names exist or whether a recovery email is set.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";

const BodySchema = z.object({
  name: z
    .string()
    .trim()
    .min(2)
    .max(50)
    .regex(/^[a-zA-Z0-9._-]+$/),
  redirect_to: z.string().url().max(500),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.flatten().fieldErrors }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { name, redirect_to } = parsed.data;
  const authEmail = `${name.toLowerCase()}@admin.local`;

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const genericOk = () =>
    new Response(
      JSON.stringify({
        ok: true,
        message:
          "If an admin with that name has a recovery email on file, a reset link has been sent.",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );

  // Locate the admin user.
  let recoveryEmail: string | null = null;
  let adminName = name;
  let page = 1;
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) {
      console.error("listUsers failed", error);
      return genericOk();
    }
    const found = data.users.find((u) => u.email?.toLowerCase() === authEmail);
    if (found) {
      const meta = (found.user_metadata ?? {}) as Record<string, unknown>;
      const re = meta.recovery_email;
      if (typeof re === "string" && re.includes("@")) recoveryEmail = re.toLowerCase();
      if (typeof meta.admin_name === "string") adminName = meta.admin_name;
      break;
    }
    if (data.users.length < 200) break;
    page += 1;
  }

  if (!recoveryEmail) {
    // Don't leak existence; just return the generic success.
    return genericOk();
  }

  // Generate a recovery link for the auth user.
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "recovery",
    email: authEmail,
    options: { redirectTo: redirect_to },
  });
  if (linkErr || !linkData?.properties?.action_link) {
    console.error("generateLink failed", linkErr);
    return genericOk();
  }
  const resetUrl = linkData.properties.action_link;

  // Resolve current brand name from app_settings (admin-editable).
  const { data: brandRow } = await admin
    .from("app_settings")
    .select("brand_name")
    .eq("id", 1)
    .maybeSingle();
  const siteName: string = brandRow?.brand_name || "CYBER TEST 360";

  // Send via the transactional pipeline. Use service-role JWT for the
  // send-transactional-email function (verify_jwt=true).
  const idempotencyKey = `admin-reset-${authEmail}-${Date.now()}`;
  const sendRes = await fetch(`${supabaseUrl}/functions/v1/send-transactional-email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
    },
    body: JSON.stringify({
      templateName: "admin-password-reset",
      recipientEmail: recoveryEmail,
      idempotencyKey,
      templateData: {
        adminName,
        resetUrl,
        siteName,
        expiresInMinutes: 60,
      },
    }),
  });

  if (!sendRes.ok) {
    const body = await sendRes.text().catch(() => "");
    console.error("send-transactional-email failed", sendRes.status, body);
  }

  return genericOk();
});
