# Shareable Question-Set Links + Real-Time Results

Let admins generate a public link from any active question set in the Question Bank. Anyone with the link can register and take the test — no admin invite needed. Their attempts and scores appear live on the admin dashboard.

## 1. Admin: generate & manage the link (Question Bank → Sets)

In `QuestionSetsTab` (Manage Set drawer), add a new **Public share link** card next to Assignments:

- "Generate public link" button → creates/rotates a token on the set
- Shows the full URL: `https://<deployed-domain>/t/<token>` with **Copy**, **Open**, **QR code**, **Rotate**, and **Disable** actions
- Toggle: *Enabled / Disabled* (disabling invalidates the URL without deleting the token)
- Optional limits per link: `max_uses` (blank = unlimited) and `expires_at`
- Live counter: "X attempts started · Y completed"

Only `admin` role can see/manage these controls. The deployed origin is read from `window.location.origin`, so it works in preview and after publish.

## 2. Public applicant flow (no admin pre-approval)

New route `/t/:token`:

1. Validates the token via an edge function (`public-link-resolve`) → returns set name, brand, and limits, or 410/404 if disabled/expired/exhausted.
2. Shows a lightweight intake form (full name, email, phone, gender) — same fields as `Index`.
3. On submit, calls `public-link-start` which:
   - Creates an `applicants` row with `status='approved'`, `source='public_link'`, links it to the set/org, and increments the link's `uses_count`.
   - Mints a one-time `link_token` for that applicant and redirects to `/proctor-check` → `/test` using the existing flow.
4. Reuses existing `ProctorCheck`, `TestPage`, scoring edge function, and `ResultsPage`.

Rate-limit by IP (reuse the existing 5/hr pattern) inside the edge function.

## 3. Real-time results on the admin dashboard

- Enable Realtime on `test_attempts` and `test_results` (publication `supabase_realtime`).
- In `OverviewSection` and the applicants/results lists, subscribe to `postgres_changes` for INSERT/UPDATE and merge into local state so new completions appear without a refresh.
- Tag rows that came from a public link (small "Public link" badge sourced from `applicants.source`) so admins can tell shareable-link applicants from invited ones.

## 4. Backend changes (single migration)

New table `public.question_set_share_links`:
- `set_id` (FK → `question_sets`, unique), `token` (uuid, unique), `enabled` (bool), `max_uses` (int null), `uses_count` (int), `expires_at` (timestamptz null), `created_by` (uuid)
- RLS: admins full access; **no anon/authenticated SELECT** — public reads go through the edge function with the service role.
- GRANTs: `authenticated` (admins read/write via `has_role`), `service_role` (all). No `anon` grant.

`applicants` table: add `source text default 'admin'` and `share_link_id uuid null` so we can attribute and badge public attempts.

Enable Realtime:
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.test_attempts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.test_results;
```

Two new edge functions (CORS, Zod input validation, IP rate-limit, service-role client):
- `public-link-resolve` — GET token → `{ set_name, brand, ok }` or error.
- `public-link-start` — POST `{ token, name, email, phone, gender }` → creates applicant + per-applicant `link_token`, increments `uses_count`, returns redirect payload.

## Technical notes

- Token format: `uuid` (opaque, 36 chars). Rotating issues a new uuid; old URLs 404 immediately.
- Set must be `active=true` AND have ≥1 question for the link to resolve; otherwise the edge function returns a friendly "not available" message.
- The existing `consume_attempt` / `link_expires_at` cooldown still applies per applicant created by the link, so a single visitor can't loop forever.
- No changes to scoring, proctoring, PDF export, or admin auth.
- Branding (`useBranding`) is reused on the public landing page so the link feels on-brand.

## Out of scope

- Per-link analytics dashboard (counts in the share card are enough for v1).
- Email capture campaigns or pre-registration gating.
- Self-serve applicant accounts/passwords.
