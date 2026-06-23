import { supabase } from "@/integrations/supabase/client";

export type LoginEvent =
  | "login_success"
  | "login_failed"
  | "logout"
  | "password_reset_requested"
  | "password_reset_completed"
  | "recovery_secret_used";

/**
 * Records a sign-in / auth event into `public.login_activity` via the
 * `log_login_event` security-definer RPC. Safe to call from anon or
 * authenticated contexts. Failures are swallowed so auth UX is never blocked.
 */
export async function logLoginEvent(
  event: LoginEvent,
  email?: string | null,
  applicantId?: string | null,
) {
  try {
    await supabase.rpc("log_login_event", {
      _email: email ?? null,
      _event: event,
      _user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
      _applicant_id: applicantId ?? null,
    });
  } catch {
    /* non-fatal — telemetry only */
  }
}
