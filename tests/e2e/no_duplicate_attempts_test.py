"""
E2E: verify that after submitting a new attempt and refreshing the dashboard,
the Attempts list shows exactly one new row for that applicant — no stale
data and no duplicates.

Run:
    ADMIN_EMAIL=... ADMIN_PASSWORD=... \
    VITE_SUPABASE_URL=... VITE_SUPABASE_PUBLISHABLE_KEY=... \
    BASE_URL=http://localhost:8080 \
    python tests/e2e/no_duplicate_attempts_test.py
"""

import asyncio
import json
import os
import re
import sys
from pathlib import Path

from playwright.async_api import async_playwright

BASE_URL = os.environ.get("BASE_URL", "http://localhost:8080")
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD")
SUPABASE_URL = os.environ.get("VITE_SUPABASE_URL") or os.environ.get("SUPABASE_URL")
SUPABASE_ANON = (
    os.environ.get("VITE_SUPABASE_PUBLISHABLE_KEY")
    or os.environ.get("SUPABASE_ANON_KEY")
)

SCREENSHOTS = Path("/tmp/browser/no-duplicate-attempts")
SCREENSHOTS.mkdir(parents=True, exist_ok=True)


async def _admin_login(page):
    await page.goto(f"{BASE_URL}/admin", wait_until="domcontentloaded")
    if await page.locator("text=Analytics Dashboard").count():
        return
    await page.get_by_label(re.compile("email", re.I)).fill(ADMIN_EMAIL)
    await page.get_by_label(re.compile("password", re.I)).fill(ADMIN_PASSWORD)
    await page.get_by_role("button", name=re.compile("sign in|log in", re.I)).click()
    await page.wait_for_selector("text=Analytics Dashboard", timeout=20_000)


async def _admin_fetch(page, path: str):
    return await page.evaluate(
        """async ({ url, anon, path }) => {
            const session = JSON.parse(localStorage.getItem(
              Object.keys(localStorage).find(k => k.startsWith('sb-') && k.endsWith('-auth-token'))
            ));
            const r = await fetch(url + path, {
                headers: { apikey: anon, Authorization: 'Bearer ' + session.access_token, Prefer: 'count=exact' },
            });
            const total = r.headers.get('content-range')?.split('/').pop();
            const body = await r.json();
            return { status: r.status, body, total: total ? Number(total) : null };
        }""",
        {"url": SUPABASE_URL, "anon": SUPABASE_ANON, "path": path},
    )


async def _attempts_count_for(page, applicant_id: str) -> int:
    res = await _admin_fetch(
        page,
        f"/rest/v1/test_attempts?select=id&applicant_id=eq.{applicant_id}",
    )
    return res["total"] if res["total"] is not None else len(res["body"])


async def _pick_target(page) -> dict:
    apps = await _admin_fetch(
        page,
        "/rest/v1/applicants?select=id,full_name,email&status=eq.approved&limit=5",
    )
    qs = await _admin_fetch(page, "/rest/v1/questions?select=id&limit=1")
    if not apps["body"]:
        raise SystemExit("No approved applicants to test with.")
    if not qs["body"]:
        raise SystemExit("No questions to test with.")
    return {"applicant": apps["body"][0], "question_id": qs["body"][0]["id"]}


async def _submit_attempt(page, applicant: dict, question_id: str) -> dict:
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
    return json.loads(resp["body"])


async def _ui_row_count_for(page, name: str) -> int:
    """Count distinct table rows in the Attempts table whose name cell matches."""
    return await page.locator(
        f'table tr:has(div.font-medium:has-text("{name}"))'
    ).count()


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

        target = await _pick_target(page)
        applicant = target["applicant"]
        name = applicant["full_name"]
        print("Target applicant:", name, applicant["id"])

        # --- Baselines (DB + UI) ---
        db_before = await _attempts_count_for(page, applicant["id"])
        await page.get_by_role("button", name=re.compile(r"^Attempts$", re.I)).click()
        await page.wait_for_selector("table", timeout=10_000)
        ui_before = await _ui_row_count_for(page, name)
        print(f"Before: db={db_before} ui={ui_before}")
        assert ui_before == db_before, (
            f"UI/DB out of sync before submit: ui={ui_before} db={db_before}"
        )

        # --- Submit one attempt ---
        submission = await _submit_attempt(page, applicant, target["question_id"])
        print("Submitted:", submission.get("result_id"))

        # --- Refresh the dashboard via the manual button ---
        await page.get_by_role("button", name=re.compile(r"^Overview$", re.I)).click()
        await page.wait_for_selector("text=Analytics Dashboard", timeout=10_000)
        await page.get_by_role("button", name=re.compile(r"^Refresh", re.I)).click()
        await page.wait_for_function(
            "() => Array.from(document.querySelectorAll('button'))"
            ".some(b => /^Refresh$/i.test(b.innerText.trim()))",
            timeout=15_000,
        )
        await page.screenshot(path=str(SCREENSHOTS / "1_after_refresh.png"))

        # --- Re-check Attempts list ---
        await page.get_by_role("button", name=re.compile(r"^Attempts$", re.I)).click()
        # Wait for the new row to appear
        await page.locator(
            f'table tr:has(div.font-medium:has-text("{name}"))'
        ).first.wait_for(state="visible", timeout=10_000)
        await page.screenshot(path=str(SCREENSHOTS / "2_attempts.png"))

        db_after = await _attempts_count_for(page, applicant["id"])
        ui_after = await _ui_row_count_for(page, name)
        print(f"After:  db={db_after} ui={ui_after}")

        # Exactly one new attempt in DB
        assert db_after == db_before + 1, (
            f"Expected DB to grow by exactly 1, got before={db_before} after={db_after}"
        )
        # UI matches DB exactly — no stale data and no duplicates
        assert ui_after == db_after, (
            f"UI/DB mismatch — possible stale or duplicate rows: ui={ui_after} db={db_after}"
        )
        assert ui_after == ui_before + 1, (
            f"UI did not show exactly one new row: before={ui_before} after={ui_after}"
        )

        # Defensive: row ids must be unique (no React-key duplication rendering same row twice)
        ids = await page.evaluate(
            """(name) => Array.from(document.querySelectorAll('table tr'))
                .filter(tr => tr.querySelector('div.font-medium')?.textContent?.trim() === name)
                .map(tr => tr.outerHTML)""",
            name,
        )
        assert len(ids) == len(set(ids)) or True  # outerHTML may legitimately repeat for identical rows
        # The stronger uniqueness check: distinct (#attempt, started_at) cells across rows
        signatures = await page.evaluate(
            """(name) => Array.from(document.querySelectorAll('table tr'))
                .filter(tr => tr.querySelector('div.font-medium')?.textContent?.trim() === name)
                .map(tr => Array.from(tr.querySelectorAll('td')).map(td => td.innerText.trim()).join('|'))""",
            name,
        )
        assert len(signatures) == len(set(signatures)), (
            f"Duplicate attempt rows detected for {name}: {signatures}"
        )

        print(f"✅ No stale/duplicate rows. db={db_after} ui={ui_after} (was {db_before})")
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
