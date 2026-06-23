# E2E tests

## `dashboard_refresh_test.py`

Playwright script that verifies the Admin dashboard **Refresh** button updates
KPIs and the Attempts list after a new test submission from another applicant.

### What it does

1. Logs into `/admin` as an existing admin.
2. Reads the **Attempts Today** KPI baseline.
3. Uses the admin's authenticated session to pick an approved applicant and one
   question id directly from the backend.
4. Calls the `submit-test` edge function with that applicant + a single answer
   (this mirrors a real submission into `test_results` and `test_attempts`).
5. Clicks the new manual **Refresh** button on the Overview header.
6. Asserts that **Attempts Today** incremented by at least 1.
7. Opens the **Attempts** section and asserts the submitted applicant appears.

### Run

```bash
ADMIN_EMAIL=you@example.com \
ADMIN_PASSWORD=••• \
VITE_SUPABASE_URL=$(grep VITE_SUPABASE_URL .env | cut -d= -f2) \
VITE_SUPABASE_PUBLISHABLE_KEY=$(grep VITE_SUPABASE_PUBLISHABLE_KEY .env | cut -d= -f2) \
BASE_URL=http://localhost:8080 \
python tests/e2e/dashboard_refresh_test.py
```

Screenshots are written to `/tmp/browser/dashboard-refresh/`.

### Notes

- Requires at least one **approved** applicant and one question in the database.
- Subject to the `submit-test` rate limit (5 submissions / IP / hour).

## `no_duplicate_attempts_test.py`

Submits one attempt, clicks **Refresh**, and asserts the Attempts list contains
exactly **one** new row for that applicant — no stale data and no duplicates.

Checks:

- DB attempt count for the applicant grew by exactly 1.
- UI row count for the applicant grew by exactly 1 and equals the DB count.
- Visible rows for that applicant have unique cell signatures (no row rendered twice).

Run it the same way as `dashboard_refresh_test.py`, just swap the filename.
Screenshots: `/tmp/browser/no-duplicate-attempts/`.
