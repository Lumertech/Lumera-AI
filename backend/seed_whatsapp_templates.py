"""One-shot Meta Graph API publisher for Lumera's utility templates.

Reads Meta credentials from:
  1. CLI args:   --waba-id <id> --token <system-user-token>
  2. env vars:   META_WABA_ID and META_SYSTEM_USER_TOKEN
  3. Mongo:      meta_whatsapp_configs collection (first configured tenant)

Publishes the 4 utility templates from `whatsapp_templates.py`. If a template
of the same name+language already exists, the Graph API returns error code
2388023 ("template already exists") — we treat that as success and move on.

Usage:
  # from env (recommended once you drop your keys into backend/.env)
  cd /app/backend && python seed_whatsapp_templates.py

  # ad-hoc override
  python seed_whatsapp_templates.py --waba-id 123456789 --token EAAB...

  # dry run (no API calls, prints payloads only)
  python seed_whatsapp_templates.py --dry-run
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys

import httpx
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

from whatsapp_templates import LUMERA_UTILITY_TEMPLATES

load_dotenv()

GRAPH_VERSION = "v20.0"
GRAPH_BASE = f"https://graph.facebook.com/{GRAPH_VERSION}"

# Meta's error code when a template of the same name+language already exists.
TEMPLATE_ALREADY_EXISTS_CODES = {2388023, 100}  # 100 sometimes returned as duplicate


async def _load_creds_from_mongo() -> tuple[str | None, str | None]:
    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME")
    if not (mongo_url and db_name):
        return None, None
    client = AsyncIOMotorClient(mongo_url)
    try:
        db = client[db_name]
        doc = await db.meta_whatsapp_configs.find_one(
            {"waba_id": {"$exists": True, "$ne": None}, "system_user_token": {"$exists": True, "$ne": None}},
            {"_id": 0, "waba_id": 1, "system_user_token": 1},
        )
        if doc:
            return doc.get("waba_id"), doc.get("system_user_token")
    finally:
        client.close()
    return None, None


async def resolve_credentials(args: argparse.Namespace) -> tuple[str, str]:
    waba_id = args.waba_id or os.environ.get("META_WABA_ID")
    token = args.token or os.environ.get("META_SYSTEM_USER_TOKEN")

    if not (waba_id and token):
        mongo_waba, mongo_tok = await _load_creds_from_mongo()
        waba_id = waba_id or mongo_waba
        token = token or mongo_tok

    if not (waba_id and token):
        print("ERROR: Missing Meta credentials.")
        print("Provide via one of:")
        print("  --waba-id <id> --token <system-user-token>")
        print("  META_WABA_ID and META_SYSTEM_USER_TOKEN in backend/.env")
        print("  Or configure a doctor via Lumera Settings → WhatsApp Setup (Meta).")
        sys.exit(2)

    return waba_id, token


async def publish_one(client: httpx.AsyncClient, waba_id: str, token: str, tmpl: dict) -> dict:
    url = f"{GRAPH_BASE}/{waba_id}/message_templates"
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    resp = await client.post(url, headers=headers, json=tmpl, timeout=30)
    body = {}
    try:
        body = resp.json()
    except json.JSONDecodeError:
        body = {"raw": resp.text}

    if resp.status_code in (200, 201):
        return {"name": tmpl["name"], "status": "submitted", "id": body.get("id"), "review_status": body.get("status")}

    err = body.get("error", {}) if isinstance(body, dict) else {}
    err_code = err.get("code")
    err_subcode = err.get("error_subcode")
    if err_code in TEMPLATE_ALREADY_EXISTS_CODES or err_subcode in TEMPLATE_ALREADY_EXISTS_CODES:
        return {"name": tmpl["name"], "status": "already_exists"}
    return {
        "name": tmpl["name"],
        "status": "failed",
        "http": resp.status_code,
        "error": err.get("message") or body,
    }


async def run(args: argparse.Namespace):
    print(f"→ Publishing {len(LUMERA_UTILITY_TEMPLATES)} Lumera utility templates to Meta")
    if args.dry_run:
        for t in LUMERA_UTILITY_TEMPLATES:
            print("── payload ──")
            print(json.dumps(t, indent=2))
        print("(dry-run — no API calls made)")
        return

    waba_id, token = await resolve_credentials(args)
    print(f"→ Using WABA {waba_id[:6]}…{waba_id[-4:]}")

    results: list[dict] = []
    async with httpx.AsyncClient() as client:
        for tmpl in LUMERA_UTILITY_TEMPLATES:
            print(f"  · {tmpl['name']} ({tmpl['language']}) … ", end="", flush=True)
            r = await publish_one(client, waba_id, token, tmpl)
            emoji = {"submitted": "✓", "already_exists": "↺", "failed": "✗"}[r["status"]]
            extra = ""
            if r["status"] == "submitted":
                extra = f" id={r.get('id','?')} review={r.get('review_status','PENDING')}"
            elif r["status"] == "failed":
                extra = f"  http={r.get('http')}  err={r.get('error')}"
            print(f"{emoji} {r['status']}{extra}")
            results.append(r)

    submitted = sum(1 for r in results if r["status"] == "submitted")
    exists = sum(1 for r in results if r["status"] == "already_exists")
    failed = sum(1 for r in results if r["status"] == "failed")

    print()
    print("────────────────────────────────────────")
    print(f"Submitted:      {submitted}")
    print(f"Already exists: {exists}")
    print(f"Failed:         {failed}")
    print("────────────────────────────────────────")
    if submitted:
        print("Templates are PENDING Meta review. Approval typically takes 1–24 hours.")
        print("Check status: Meta Business Manager → WhatsApp Manager → Message Templates")

    if failed:
        sys.exit(1)


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Publish Lumera utility WhatsApp templates to Meta.")
    p.add_argument("--waba-id", help="Meta WhatsApp Business Account ID")
    p.add_argument("--token", help="Meta System User Token with whatsapp_business_management scope")
    p.add_argument("--dry-run", action="store_true", help="Print payloads without calling Meta")
    return p.parse_args()


if __name__ == "__main__":
    asyncio.run(run(_parse_args()))
