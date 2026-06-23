// One-shot admin seeding endpoint.
// Usage (replace placeholders):
//   curl -X POST "$SUPABASE_URL/functions/v1/seed-admin" \
//     -H "Content-Type: application/json" \
//     -H "x-seed-secret: $SEED_ADMIN_SECRET" \
//     -d '{"name":"admin","password":"SomeStrongPass!"}'
//
// The function creates an auth user with email `${name}@admin.local`
// (matching the AdminLogin page's nameToEmail mapping) and grants the
// `admin` role in public.user_roles. Safe to re-run: if the user already
// exists, the password is updated and the admin role is re-asserted.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";

const BodySchema = z.object({
  name: z
    .string()
    .trim()
    .min(2)
    .max(50)
    .regex(/^[a-zA-Z0-9._-]+$/, "Use letters, numbers, dots, dashes or underscores"),
  password: z.string().min(8).max(128),
  // Real, deliverable email used for password-reset links. Highly recommended.
  recovery_email: z.string().trim().email().max(255).optional(),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const expected = Deno.env.get("SEED_ADMIN_SECRET");
  const provided = req.headers.get("x-seed-secret");
  if (!expected || provided !== expected) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.flatten().fieldErrors }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { name, password, recovery_email } = parsed.data;
  const email = `${name.toLowerCase()}@admin.local`;

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const userMeta: Record<string, unknown> = { admin_name: name };
  if (recovery_email) userMeta.recovery_email = recovery_email.toLowerCase();

  // Try to create; if it already exists, look it up and update the password.
  let userId: string | null = null;
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: userMeta,
  });

  if (created.error) {
    // Find existing user via pagination.
    let page = 1;
    while (!userId) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const found = data.users.find((u) => u.email?.toLowerCase() === email);
      if (found) {
        userId = found.id;
        break;
      }
      if (data.users.length < 200) break;
      page += 1;
    }

    if (!userId) {
      return new Response(JSON.stringify({ error: created.error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const upd = await admin.auth.admin.updateUserById(userId, {
      password,
      email_confirm: true,
      ...(recovery_email ? { user_metadata: userMeta } : {}),
    });
    if (upd.error) {
      return new Response(JSON.stringify({ error: upd.error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } else {
    userId = created.data.user!.id;
  }

  // Grant admin role (unique on (user_id, role) makes this idempotent).
  const { error: roleErr } = await admin
    .from("user_roles")
    .upsert({ user_id: userId, role: "admin" }, { onConflict: "user_id,role" });

  if (roleErr) {
    return new Response(JSON.stringify({ error: roleErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({ ok: true, email, name, user_id: userId }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
