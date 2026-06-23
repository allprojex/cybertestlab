// One-shot bootstrap: creates a default admin (name=admin) with a fixed
// password, idempotent. Safe to delete after use.
//
// No auth required — intentionally — so it can be invoked once from the
// agent. After bootstrap, delete this function or it can be re-run by anyone.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const DEFAULT_NAME = "admin";
const DEFAULT_PASSWORD = "Admin@2026!";
const DEFAULT_EMAIL = `${DEFAULT_NAME}@admin.local`;

Deno.serve(async (_req) => {
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  let userId: string | null = null;

  const created = await admin.auth.admin.createUser({
    email: DEFAULT_EMAIL,
    password: DEFAULT_PASSWORD,
    email_confirm: true,
    user_metadata: { admin_name: DEFAULT_NAME },
  });

  if (created.error) {
    let page = 1;
    while (true) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const found = data.users.find((u) => u.email?.toLowerCase() === DEFAULT_EMAIL);
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
      password: DEFAULT_PASSWORD,
      email_confirm: true,
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
    JSON.stringify({
      ok: true,
      name: DEFAULT_NAME,
      password: DEFAULT_PASSWORD,
      user_id: userId,
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
