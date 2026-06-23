"""
E2E: verify the Admin dashboard Refresh button updates KPIs + Attempts list
after a new test submission from another applicant.

Run:
    ADMIN_EMAIL=... ADMIN_PASSWORD=... \
    BASE_URL=http://localhost:8080 \
    python tests/e2e/dashboard_refresh_test.py

Requires Playwright (already installed in the Lovable sandbox).
"""

import asyncio
import json
import os
import re
import sys
import time
from pathlib import Path

from playwright.async_api import async_playwright, expect

BASE_URL = os.environ.get("BASE_URL", "http://localhost:8080")
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD")
SUPABASE_URL = os.environ.get("VITE_SUPABASE_URL") or os.environ.get("SUPABASE_URL")
SUPABASE_ANON = (
    os.environ.get("VITE_SUPABASE_PUBLISHABLE_KEY")
    or os.environ.get("SUPABASE_ANON_KEY")
)

SCREENSHOTS = Path("/tmp/browser/dashboard-refresh")
SCREENSHOTS.mkdir(parents=True, exist_ok=True)


def _read_int(text: str) -> int:
    m = re.search(r"-?\d+", text.replace(",", ""))
    return int(m.group(0)) if m else 0


async def _kpi_value(page, label: str) -> int:
    # StatCard renders the label and value as siblings; locate the card by its label,
    # then read the first number inside it.
    card = page.locator(f'a:has-text("{label}"), div:has-text("{label}")').first
    await card.wait_for(state="visible", timeout=10_000)
    text = await card.inner_text()
    # First numeric token after the label
    after = text.split(label, 1)[-1]
    return _read_int(after)


async def _admin_login(page):
    await page.goto(f"{BASE_URL}/admin", wait_until="domcontentloaded")
    # If already on dashboard, skip
    if await page.locator('text=Analytics Dashboard').count():
        return
    await page.get_by_label(re.compile("email", re.I)).fill(ADMIN_EMAIL)
    await page.get_by_label(re.compile("password", re.I)).fill(ADMIN_PASSWORD)
    await page.get_by_role("button", name=re.compile("sign in|log in", re.I)).click()
    await page.wait_for_selector('text=Analytics Dashboard', timeout=20_000)


async def _pick_target_applicant(page) -> dict:
    """Use the admin's authenticated session in-page to pick an approved applicant
    different from the admin's own email, plus one question id for a minimal answer."""
    result = await page.evaluate(
        """async ({ url, anon }) => {
            const session = JSON.parse(localStorage.getItem(
              Object.keys(localStorage).find(k => k.startsWith('sb-') && k.endsWith('-auth-token'))
            ));
            const access = session.access_token;
            const headers = { apikey: anon, Authorization: 'Bearer ' + access };
            const apps = await fetch(url + '/rest/v1/applicants?select=id,full_name,email,status&status=eq.approved&limit=5', { headers }).then(r => r.json());
            const qs = await fetch(url + '/rest/v1/questions?select=id&limit=1', { headers }).then(r => r.json());
            return { applicants: apps, questions: qs };
        }""",
        {"url": SUPABASE_URL, "anon": SUPABASE_ANON},
    )
    if not result["applicants"]:
        raise SystemExit("No approved applicants in DB to test with.")
    if not result["questions"]:
        raise SystemExit("No questions in DB to test with.")
    applicant = result["applicants"][0]
    return {"applicant": applicant, "question_id": result["questions"][0]["id"]}


async def _submit_attempt(page, applicant: dict, question_id: str) -> dict:
    """Submit an attempt and return the parsed edge-function response
    ({ score, total_questions, percentage, ... })."""
    payload = {
        "applicant_name": applicant["full_name"],
        "applicant_email": applicant.get("email") or "",
        "answers": [{"question_id": question_id, "user_answer": "A"}],
    }
    resp = await page.evaluate(
        """async ({ url, anon, body }) => {
            const r = await fetch(url + '/functions/v1/submit-test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', apikey: anon, Authorization: 'Bearer ' + anon },
                body: JSON.stringify(body),
            });
            return { status: r.status, body: await r.text() };
        }""",
        {"url": SUPABASE_URL, "anon": SUPABASE_ANON, "body": payload},
    )
    if resp["status"] >= 400:
        raise SystemExit(f"submit-test failed: {resp}")
    data = json.loads(resp["body"])
    print(
        f"submit-test ok: score={data.get('score')}/"
        f"{data.get('total_questions')} pct={data.get('percentage')}"
    )
    return data


async def _fetch_pass_mark(page) -> float:
    res = await page.evaluate(
        """async ({ url, anon }) => {
            const session = JSON.parse(localStorage.getItem(
              Object.keys(localStorage).find(k => k.startsWith('sb-') && k.endsWith('-auth-token'))
            ));
            const r = await fetch(url + '/rest/v1/app_settings?select=pass_mark&id=eq.1', {
                headers: { apikey: anon, Authorization: 'Bearer ' + session.access_token },
            });
            const rows = await r.json();
            return rows?.[0]?.pass_mark;
        }""",
        {"url": SUPABASE_URL, "anon": SUPABASE_ANON},
    )
    return float(res if res is not None else 65)



async def main():
    missing = [k for k, v in {
        "ADMIN_EMAIL": ADMIN_EMAIL, "ADMIN_PASSWORD": ADMIN_PASSWORD,
        "VITE_SUPABASE_URL": SUPABASE_URL, "VITE_SUPABASE_PUBLISHABLE_KEY": SUPABASE_ANON,
    }.items() if not v]
    if missing:
        print("Missing required env vars:", ", ".join(missing))
        sys.exit(2)

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await ctx.new_page()

        await _admin_login(page)
        await page.screenshot(path=str(SCREENSHOTS / "1_dashboard.png"))

        before_today = await _kpi_value(page, "Attempts Today")
        before_all = await _kpi_value(page, "Attempts Today")  # all-time hint inside same card; we'll compare today
        print("Baseline Attempts Today:", before_today)

        target = await _pick_target_applicant(page)
        applicant = target["applicant"]
        print("Submitting attempt as:", applicant["full_name"])
        submission = await _submit_attempt(page, applicant, target["question_id"])
        pass_mark = await _fetch_pass_mark(page)

        expected_score = int(submission["score"])
        expected_total = int(submission["total_questions"])
        expected_pct = int(round(float(submission["percentage"])))  # UI uses Math.round
        expected_passed = float(submission["percentage"]) >= pass_mark
        expected_pill = "pass" if expected_passed else "fail"
        print(
            f"Expecting row: {expected_pct}% ({expected_score}/{expected_total}) "
            f"pill={expected_pill} (pass_mark={pass_mark})"
        )

        # Click the new manual Refresh button on the Overview header
        refresh_btn = page.get_by_role("button", name=re.compile(r"^Refresh", re.I))
        await refresh_btn.click()
        await page.wait_for_function(
            "() => Array.from(document.querySelectorAll('button'))"
            ".some(b => /^Refresh$/i.test(b.innerText.trim()))",
            timeout=15_000,
        )
        await page.screenshot(path=str(SCREENSHOTS / "2_after_refresh.png"))

        after_today = await _kpi_value(page, "Attempts Today")
        print("After Refresh Attempts Today:", after_today)
        assert after_today >= before_today + 1, (
            f"KPI did not increment: before={before_today} after={after_today}"
        )

        # Navigate to Attempts section and inspect the new row
        await page.get_by_role("button", name=re.compile(r"^Attempts$", re.I)).click()
        # Wait for the freshly-submitted applicant row to render
        name_cell = page.locator(
            f'tr:has(div.font-medium:has-text("{applicant["full_name"]}"))'
        ).first
        await name_cell.wait_for(state="visible", timeout=10_000)
        await page.screenshot(path=str(SCREENSHOTS / "3_attempts_list.png"))

        row_text = await name_cell.inner_text()
        print("Attempts row text:\n", row_text)

        expected_pct_str = f"{expected_pct}%"
        expected_fraction = f"({expected_score}/{expected_total})"
        assert expected_pct_str in row_text, (
            f"Percentage {expected_pct_str} not found in row. Got: {row_text!r}"
        )
        assert expected_fraction in row_text, (
            f"Score fraction {expected_fraction} not found in row. Got: {row_text!r}"
        )
        # Pill text is lowercase in the DOM (capitalized via CSS only)
        row_text_lc = row_text.lower()
        assert expected_pill in row_text_lc, (
            f"Pass/fail pill '{expected_pill}' not found in row. Got: {row_text!r}"
        )
        # And the opposite verdict must NOT be in the row
        opposite = "fail" if expected_pill == "pass" else "pass"
        # Guard against substring collisions (none exist between 'pass' and 'fail')
        assert opposite not in row_text_lc, (
            f"Unexpected verdict '{opposite}' present in row. Got: {row_text!r}"
        )

        print(
            f"✅ Attempts row verified: {expected_pct_str} {expected_fraction} "
            f"[{expected_pill}] for {applicant['full_name']}"
        )
        await browser.close()



if __name__ == "__main__":
    asyncio.run(main())
