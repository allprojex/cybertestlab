// Admin password reset endpoint.
// Resets the password for an existing admin user identified by name.
// Requires the SEED_ADMIN_SECRET header (treated as a recovery secret).
//
// Usage (curl, optional — the UI at /admin-reset uses the same endpoint):
//   curl -X POST "$SUPABASE_URL/functions/v1/admin-reset" \
//     -H "Content-Type: application/json" \
//     -H "x-seed-secret: $SEED_ADMIN_SECRET" \
//     -d '{"name":"admin","new_password":"NewStrongPass!"}'
//
// Unlike seed-admin, this function will NOT create a missing user and will
// NOT touch role assignments — it only rotates the password.

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
  new_password: z.string().min(8).max(128),
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

  const { name, new_password } = parsed.data;
  const email = `${name.toLowerCase()}@admin.local`;

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // Locate the existing user; do NOT auto-create.
  let userId: string | null = null;
  let page = 1;
  while (true) {
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
    return new Response(
      JSON.stringify({ error: "Admin not found. Use the seed function to create it first." }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const upd = await admin.auth.admin.updateUserById(userId, {
    password: new_password,
    email_confirm: true,
  });
  if (upd.error) {
    return new Response(JSON.stringify({ error: upd.error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true, name, email }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
