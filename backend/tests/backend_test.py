"""Backend coverage for Meta WhatsApp, Ambient AI session logs/Whisper RBAC, and regressions."""
from __future__ import annotations

import os
import re
import time
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values
from pymongo import MongoClient


FRONTEND_ENV = dotenv_values("/app/frontend/.env")
BACKEND_ENV = dotenv_values("/app/backend/.env")
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or FRONTEND_ENV.get("REACT_APP_BACKEND_URL") or "").rstrip("/")
if not BASE_URL:
    raise RuntimeError("REACT_APP_BACKEND_URL is missing")
API = f"{BASE_URL}/api"
TIMEOUT = 30


def _credential_section(label: str) -> dict[str, str]:
    """Read supplied credentials rather than embedding account secrets in tests."""
    path = Path("/app/memory/test_credentials.md")
    if not path.exists():
        pytest.skip("Missing /app/memory/test_credentials.md")
    text = path.read_text(encoding="utf-8")
    match = re.search(rf"## {re.escape(label)}.*?(?=\n##|\Z)", text, re.I | re.S)
    if not match:
        pytest.skip(f"Missing {label} credentials section")
    section = match.group(0)
    email = re.search(r"(?im)^\s*-\s*Email:\s*(\S+)", section)
    password = re.search(r"(?im)^\s*-\s*Password:\s*(\S+)", section)
    if not email or not password:
        pytest.skip(f"Incomplete {label} credentials")
    return {"email": email.group(1), "password": password.group(1)}


def _login(credentials: dict[str, str]) -> dict:
    response = requests.post(f"{API}/auth/login", json=credentials, timeout=TIMEOUT)
    assert response.status_code == 200, f"Login failed: {response.status_code} {response.text}"
    body = response.json()
    assert isinstance(body.get("token"), str) and body["token"]
    assert body.get("user", {}).get("email") == credentials["email"]
    return body


def _headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _assert_clear_error(response: requests.Response, status: int, expected_terms: tuple[str, ...] = ()) -> str:
    assert response.status_code == status, f"Expected {status}, got {response.status_code}: {response.text}"
    body = response.json()
    detail = body.get("detail")
    assert isinstance(detail, str) and detail.strip(), body
    if expected_terms:
        lowered = detail.lower()
        assert any(term.lower() in lowered for term in expected_terms), detail
    return detail


@pytest.fixture(scope="module")
def backend_context():
    """Create isolated doctors/sub-users and clean every QA-owned Mongo document afterward."""
    doctor_login = _login(_credential_section("Doctor / Test Professional"))
    stamp = f"{int(time.time())}_{uuid.uuid4().hex[:8]}"
    mongo_url = BACKEND_ENV.get("MONGO_URL")
    db_name = BACKEND_ENV.get("DB_NAME")
    assert mongo_url and db_name, "Mongo test setup variables are missing"
    mongo_client = MongoClient(mongo_url)
    db = mongo_client[db_name]

    temp_doctors: dict[str, dict] = {}
    created_user_ids: list[str] = []
    created_clinic_ids: list[str] = []

    for purpose in ("meta_empty", "meta_configured", "ambient"):
        credentials = {
            "email": f"test_feature_{purpose}_{stamp}@test.com",
            "password": "TestFeature@12345",
        }
        registration = requests.post(
            f"{API}/auth/register",
            json={
                "name": f"TEST Feature {purpose}",
                "email": credentials["email"],
                "password": credentials["password"],
                "phone_number": f"+919{uuid.uuid4().int % 1_000_000_000:09d}",
                "profession": "doctor",
            },
            timeout=TIMEOUT,
        )
        assert registration.status_code == 200, registration.text
        body = registration.json()
        assert body["user"]["profession"] == "doctor"
        created_user_ids.append(body["user"]["id"])
        temp_doctors[purpose] = {
            "user": body["user"],
            "headers": _headers(body["token"]),
            "credentials": credentials,
        }

    ambient = temp_doctors["ambient"]
    clinic = requests.post(
        f"{API}/clinics",
        headers=ambient["headers"],
        json={"name": f"TEST Ambient Clinic {stamp}", "address": "QA"},
        timeout=TIMEOUT,
    )
    assert clinic.status_code == 200, clinic.text
    clinic_id = clinic.json()["id"]
    created_clinic_ids.append(clinic_id)

    role_users: dict[str, dict] = {}
    for role in ("assistant", "front_desk"):
        credentials = {
            "email": f"test_ambient_{role}_{stamp}@test.com",
            "password": "RoleFeature@12345",
        }
        created = requests.post(
            f"{API}/clinics/sub-users",
            headers=ambient["headers"],
            json={
                "name": f"TEST Ambient {role}",
                "email": credentials["email"],
                "password": credentials["password"],
                "phone_number": f"+918{uuid.uuid4().int % 1_000_000_000:09d}",
                "clinic_id": clinic_id,
                "role": role,
            },
            timeout=TIMEOUT,
        )
        assert created.status_code == 200, created.text
        created_user_ids.append(created.json()["id"])
        login = _login(credentials)
        role_users[role] = {"user": login["user"], "headers": _headers(login["token"])}

    context = {
        "stamp": stamp,
        "db": db,
        "primary_doctor": {
            "user": doctor_login["user"],
            "headers": _headers(doctor_login["token"]),
        },
        **temp_doctors,
        **role_users,
    }
    yield context

    # Remove all isolated feature-test records, including failed-test leftovers.
    db.meta_whatsapp_configs.delete_many({"owner_id": {"$in": created_user_ids}})
    db.meta_whatsapp_messages.delete_many({"owner_id": {"$in": created_user_ids}})
    db.ambient_sessions.delete_many({"doctor_id": {"$in": created_user_ids}})
    db.letterheads.delete_many({"owner_id": {"$in": created_user_ids}})
    db.clinics.delete_many({"id": {"$in": created_clinic_ids}})
    db.users.delete_many({"id": {"$in": created_user_ids}})
    mongo_client.close()


# ---------- Meta WhatsApp config, send guard, and webhook verification ----------

class TestMetaWhatsApp:
    def test_send_without_credentials_is_clear_400(self, backend_context):
        owner = backend_context["meta_empty"]
        backend_context["db"].meta_whatsapp_configs.delete_many({"owner_id": owner["user"]["id"]})
        response = requests.post(
            f"{API}/meta-whatsapp/send",
            headers=owner["headers"],
            json={"to": "+919999999999", "body": "TEST must not reach Meta"},
            timeout=TIMEOUT,
        )
        detail = _assert_clear_error(response, 400, ("not configured", "credentials", "settings"))
        assert "WhatsApp" in detail

    def test_put_then_get_config_masks_and_persists_secrets(self, backend_context):
        owner = backend_context["meta_configured"]
        stamp = backend_context["stamp"]
        payload = {
            "app_id": f"TEST_APP_{stamp}",
            "app_secret": f"TEST_SECRET_{stamp}",
            "waba_id": f"TEST_WABA_{stamp}",
            "phone_number_id": f"TEST_PHONE_{stamp}",
            "system_user_token": f"TEST_SYSTEM_TOKEN_{stamp}",
            "webhook_verify_token": f"TEST_VERIFY_{stamp}",
        }
        saved = requests.put(
            f"{API}/meta-whatsapp/config", headers=owner["headers"], json=payload, timeout=TIMEOUT
        )
        assert saved.status_code == 200, saved.text
        assert saved.json() == {"message": "Saved", "configured": True}

        fetched = requests.get(f"{API}/meta-whatsapp/config", headers=owner["headers"], timeout=TIMEOUT)
        assert fetched.status_code == 200, fetched.text
        body = fetched.json()
        for field in ("app_id", "waba_id", "phone_number_id", "webhook_verify_token"):
            assert body[field] == payload[field]
        assert body["has_app_secret"] is True
        assert body["has_system_user_token"] is True
        assert body["configured"] is True
        assert "app_secret" not in body and "system_user_token" not in body
        assert body["webhook_url"].endswith("/api/meta-whatsapp/webhook")

        persisted = backend_context["db"].meta_whatsapp_configs.find_one(
            {"owner_id": owner["user"]["id"]}, {"_id": 0}
        )
        assert persisted["app_secret"] == payload["app_secret"]
        assert persisted["system_user_token"] == payload["system_user_token"]

    def test_webhook_accepts_correct_token_and_rejects_wrong_token(self, backend_context):
        owner = backend_context["meta_configured"]
        cfg = backend_context["db"].meta_whatsapp_configs.find_one({"owner_id": owner["user"]["id"]})
        assert cfg and cfg.get("webhook_verify_token")
        challenge = f"TEST_CHALLENGE_{backend_context['stamp']}"
        accepted = requests.get(
            f"{API}/meta-whatsapp/webhook",
            params={
                "hub.mode": "subscribe",
                "hub.verify_token": cfg["webhook_verify_token"],
                "hub.challenge": challenge,
            },
            timeout=TIMEOUT,
        )
        assert accepted.status_code == 200, accepted.text
        assert accepted.text == challenge
        assert accepted.headers.get("content-type", "").startswith("text/plain")

        rejected = requests.get(
            f"{API}/meta-whatsapp/webhook",
            params={
                "hub.mode": "subscribe",
                "hub.verify_token": f"WRONG_{uuid.uuid4().hex}",
                "hub.challenge": challenge,
            },
            timeout=TIMEOUT,
        )
        _assert_clear_error(rejected, 403, ("mismatch", "invalid"))


# ---------- Ambient extraction, automatic persistence, sessions, search, and RBAC ----------

@pytest.fixture(scope="module")
def successful_ambient_extract(backend_context):
    """Call the real configured LLM once; mark only external quota/integration failures blocked."""
    transcript_marker = f"TESTHINGLISH{backend_context['stamp'].replace('_', '')}"
    transcript = (
        f"{transcript_marker}. Patient ko teen din se sar dard aur chakkar ho raha hai. "
        "BP 160/100 hai. High blood pressure ka diagnosis likho. "
        "Tablet Amlodac 5 mg roz subah ek baar tees din ke liye dena."
    )
    response = requests.post(
        f"{API}/ambient/extract",
        headers=backend_context["ambient"]["headers"],
        json={"transcript": transcript, "context": f"TEST Patient {backend_context['stamp']}"},
        timeout=150,
    )
    if response.status_code in (502, 503):
        detail = response.text.lower()
        if any(term in detail for term in ("llm", "quota", "emergent", "unstructured", "not configured")):
            pytest.xfail(f"Blocked by LLM integration: {response.status_code} {response.text[:300]}")
    assert response.status_code == 200, response.text
    return {"response": response.json(), "transcript": transcript, "marker": transcript_marker}


@pytest.fixture(scope="module")
def controlled_sessions(backend_context):
    """Seed field-isolated rows to prove each supported search branch and ordering."""
    db = backend_context["db"]
    doctor_id = backend_context["ambient"]["user"]["id"]
    stamp = backend_context["stamp"].replace("_", "")
    base = datetime.now(timezone.utc) + timedelta(minutes=5)
    rows = [
        {
            "id": f"TEST-SESSION-TRANSCRIPT-{stamp}",
            "doctor_id": doctor_id,
            "context": "ordinary context",
            "transcript": f"Contains TranScriptNeedle{stamp} only here",
            "extracted": {"provisional_diagnosis": "ordinary diagnosis"},
            "created_at": (base + timedelta(seconds=1)).isoformat(),
        },
        {
            "id": f"TEST-SESSION-CONTEXT-{stamp}",
            "doctor_id": doctor_id,
            "context": f"Contains ConTextNeedle{stamp} only here",
            "transcript": "ordinary transcript",
            "extracted": {"provisional_diagnosis": "ordinary diagnosis"},
            "created_at": (base + timedelta(seconds=2)).isoformat(),
        },
        {
            "id": f"TEST-SESSION-DIAGNOSIS-{stamp}",
            "doctor_id": doctor_id,
            "context": "ordinary context",
            "transcript": "ordinary transcript",
            "extracted": {"provisional_diagnosis": f"DiagNosisNeedle{stamp}"},
            "created_at": (base + timedelta(seconds=3)).isoformat(),
        },
    ]
    db.ambient_sessions.insert_many(rows)
    yield {"rows": rows, "needles": [f"transcriptneedle{stamp}", f"contextneedle{stamp}", f"diagnosisneedle{stamp}"]}
    db.ambient_sessions.delete_many({"id": {"$in": [row["id"] for row in rows]}})


class TestAmbientAI:
    def test_hinglish_extract_parses_bp_medication_and_diagnosis(self, successful_ambient_extract):
        body = successful_ambient_extract["response"]
        assert body["raw_transcript"] == successful_ambient_extract["transcript"]
        assert isinstance(body.get("symptoms"), str) and body["symptoms"].strip()
        assert isinstance(body.get("provisional_diagnosis"), str) and body["provisional_diagnosis"].strip()
        bp = str((body.get("vitals") or {}).get("bp", "")).replace(" ", "")
        assert "160/100" in bp, body
        medicines = body.get("medications")
        assert isinstance(medicines, list) and medicines
        assert any(
            "amlod" in f"{item.get('medicine_name', '')} {item.get('dosage', '')}".lower()
            and "5" in f"{item.get('medicine_name', '')} {item.get('dosage', '')}"
            for item in medicines
        ), body

    def test_successful_extract_auto_writes_complete_session(self, backend_context, successful_ambient_extract):
        row = backend_context["db"].ambient_sessions.find_one(
            {
                "doctor_id": backend_context["ambient"]["user"]["id"],
                "transcript": successful_ambient_extract["transcript"],
            },
            {"_id": 0},
        )
        assert row is not None
        assert isinstance(row.get("id"), str) and row["id"]
        assert row["context"] == f"TEST Patient {backend_context['stamp']}"
        assert row["extracted"]["raw_transcript"] == successful_ambient_extract["transcript"]
        assert row["extracted"]["provisional_diagnosis"] == successful_ambient_extract["response"]["provisional_diagnosis"]
        datetime.fromisoformat(row["created_at"])

    def test_sessions_are_reverse_chronological_and_doctor_scoped(self, backend_context, controlled_sessions):
        response = requests.get(
            f"{API}/ambient/sessions",
            headers=backend_context["ambient"]["headers"],
            params={"limit": 100},
            timeout=TIMEOUT,
        )
        assert response.status_code == 200, response.text
        rows = response.json()
        assert isinstance(rows, list)
        ids = [row["id"] for row in rows]
        expected_ids = [row["id"] for row in reversed(controlled_sessions["rows"])]
        positions = [ids.index(item_id) for item_id in expected_ids]
        assert positions == sorted(positions), ids
        created_at = [datetime.fromisoformat(row["created_at"]) for row in rows]
        assert created_at == sorted(created_at, reverse=True)
        assert all(row.get("doctor_id") == backend_context["ambient"]["user"]["id"] for row in rows)
        assert all("_id" not in row for row in rows)

    @pytest.mark.parametrize("needle_index", [0, 1, 2])
    def test_sessions_case_insensitive_searches_transcript_context_and_diagnosis(
        self, backend_context, controlled_sessions, needle_index
    ):
        needle = controlled_sessions["needles"][needle_index]
        expected_id = controlled_sessions["rows"][needle_index]["id"]
        response = requests.get(
            f"{API}/ambient/sessions",
            headers=backend_context["ambient"]["headers"],
            params={"q": needle.swapcase()},
            timeout=TIMEOUT,
        )
        assert response.status_code == 200, response.text
        rows = response.json()
        assert expected_id in [row["id"] for row in rows]
        for row in rows:
            haystack = " ".join(
                [
                    row.get("transcript", ""),
                    row.get("context", ""),
                    (row.get("extracted") or {}).get("provisional_diagnosis", ""),
                ]
            ).lower()
            assert needle.lower() in haystack

    @pytest.mark.parametrize("role", ["assistant", "front_desk"])
    def test_extract_rejects_non_doctor_roles(self, backend_context, role):
        response = requests.post(
            f"{API}/ambient/extract",
            headers=backend_context[role]["headers"],
            json={"transcript": "TEST transcript must be rejected before any LLM call"},
            timeout=TIMEOUT,
        )
        _assert_clear_error(response, 403, ("only doctors", "doctor"))

    def test_transcribe_rejects_non_doctor(self, backend_context):
        response = requests.post(
            f"{API}/ambient/transcribe",
            headers=backend_context["assistant"]["headers"],
            files={"file": ("test.webm", b"TEST audio", "audio/webm")},
            timeout=TIMEOUT,
        )
        _assert_clear_error(response, 403, ("only doctors", "doctor"))

    def test_transcribe_rejects_upload_larger_than_24mb(self, backend_context):
        oversized = b"0" * (24 * 1024 * 1024 + 1)
        response = requests.post(
            f"{API}/ambient/transcribe",
            headers=backend_context["ambient"]["headers"],
            files={"file": ("test-too-large.webm", oversized, "audio/webm")},
            timeout=90,
        )
        detail = _assert_clear_error(response, 413, ("24 mb", "audio"))
        assert "24" in detail

    def test_sessions_malformed_regex_does_not_crash_server(self, backend_context):
        response = requests.get(
            f"{API}/ambient/sessions",
            headers=backend_context["ambient"]["headers"],
            params={"q": "["},
            timeout=TIMEOUT,
        )
        assert response.status_code == 200, response.text
        assert isinstance(response.json(), list)


# ---------- Requested endpoint regressions ----------

class TestExistingEndpointRegressions:
    def test_queue_today(self, backend_context):
        response = requests.get(
            f"{API}/queue/today", headers=backend_context["primary_doctor"]["headers"], timeout=TIMEOUT
        )
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["date"] == datetime.now(timezone.utc).strftime("%Y-%m-%d")
        assert isinstance(body.get("appointments"), list)
        assert isinstance(body.get("counts"), dict)
        assert isinstance(body.get("total"), int) and body["total"] == len(body["appointments"])
        assert set(("scheduled", "checked_in", "in_consultation", "completed", "no_show", "cancelled")).issubset(body["counts"])

    def test_letterhead(self, backend_context):
        response = requests.get(
            f"{API}/letterhead", headers=backend_context["primary_doctor"]["headers"], timeout=TIMEOUT
        )
        assert response.status_code == 200, response.text
        body = response.json()
        assert isinstance(body, dict)
        assert isinstance(body.get("logo_data_url"), str)
        assert isinstance(body.get("signature_data_url"), str)
        assert "_id" not in body

    def test_feedback_summary(self, backend_context):
        response = requests.get(
            f"{API}/feedback/summary", headers=backend_context["primary_doctor"]["headers"], timeout=TIMEOUT
        )
        assert response.status_code == 200, response.text
        body = response.json()
        assert isinstance(body.get("average"), (int, float))
        assert isinstance(body.get("count"), int) and body["count"] >= 0
        assert isinstance(body.get("positive_pct"), (int, float))
        assert isinstance(body.get("distribution"), dict)
        assert set(body["distribution"]) == {"1", "2", "3", "4", "5"}
        assert sum(body["distribution"].values()) == body["count"]
