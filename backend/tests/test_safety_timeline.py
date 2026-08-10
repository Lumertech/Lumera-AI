"""API coverage for patient safety allergies, drug checks, unified timeline, and regressions."""
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


def _doctor_credentials() -> dict[str, str]:
    path = Path("/app/memory/test_credentials.md")
    if not path.exists():
        pytest.skip("Missing /app/memory/test_credentials.md")
    content = path.read_text(encoding="utf-8")
    section = re.search(r"## Doctor / Test Professional.*?(?=\n##|\Z)", content, re.I | re.S)
    if not section:
        pytest.skip("Missing Doctor / Test Professional credentials")
    email = re.search(r"(?im)^\s*-\s*Email:\s*(\S+)", section.group(0))
    password = re.search(r"(?im)^\s*-\s*Password:\s*(\S+)", section.group(0))
    if not email or not password:
        pytest.skip("Incomplete Doctor / Test Professional credentials")
    return {"email": email.group(1), "password": password.group(1)}


@pytest.fixture(scope="module")
def safety_context():
    """Authenticate as the supplied doctor and create isolated aggregate timeline rows."""
    credentials = _doctor_credentials()
    login = requests.post(f"{API}/auth/login", json=credentials, timeout=TIMEOUT)
    assert login.status_code == 200, login.text
    login_body = login.json()
    assert isinstance(login_body.get("token"), str) and login_body["token"]
    assert login_body.get("user", {}).get("email") == credentials["email"]
    owner_id = login_body["user"]["id"]
    headers = {"Authorization": f"Bearer {login_body['token']}"}

    mongo_url = BACKEND_ENV.get("MONGO_URL")
    db_name = BACKEND_ENV.get("DB_NAME")
    assert mongo_url and db_name, "Mongo test setup variables are missing"
    mongo_client = MongoClient(mongo_url)
    db = mongo_client[db_name]

    stamp = f"{int(time.time())}_{uuid.uuid4().hex[:8]}"
    phone = f"+919{uuid.uuid4().int % 1_000_000_000:09d}"
    empty_phone = f"+918{uuid.uuid4().int % 1_000_000_000:09d}"
    ids = {
        "appointment": f"TEST-SAFETY-APPT-{stamp}",
        "prescription": f"TEST-SAFETY-RX-{stamp}",
        "invoice": f"TEST-SAFETY-INV-{stamp}",
        "ambient": f"TEST-SAFETY-AMBIENT-{stamp}",
    }
    now = datetime.now(timezone.utc)
    db.appointments.insert_one({
        "id": ids["appointment"],
        "professional_id": owner_id,
        "client_name": f"TEST Safety Patient {stamp}",
        "client_phone": phone,
        "start_time": "10:00",
        "status": "scheduled",
        "token_number": 91,
        "created_at": (now - timedelta(minutes=4)).isoformat(),
    })
    db.prescriptions.insert_one({
        "id": ids["prescription"],
        "professional_id": owner_id,
        "client_phone": phone,
        "medications": [{"medicine_name": "TEST Timeline Medicine"}],
        "vitals": {"pulse": "72"},
        "created_at": (now - timedelta(minutes=3)).isoformat(),
    })
    db.invoices.insert_one({
        "id": ids["invoice"],
        "doctor_id": owner_id,
        "client_phone": phone,
        "invoice_number": f"TEST-{stamp}",
        "total": 321,
        "status": "draft",
        "created_at": (now - timedelta(minutes=2)).isoformat(),
    })
    db.ambient_sessions.insert_one({
        "id": ids["ambient"],
        "doctor_id": owner_id,
        "context": f"Patient phone {phone} TEST timeline aggregate",
        "extracted": {"provisional_diagnosis": "TEST timeline diagnosis", "symptoms": "TEST symptom"},
        "created_at": (now - timedelta(minutes=1)).isoformat(),
    })

    yield {
        "credentials": credentials,
        "headers": headers,
        "owner_id": owner_id,
        "phone": phone,
        "empty_phone": empty_phone,
        "ids": ids,
        "db": db,
    }

    db.patient_safety.delete_many({"owner_id": owner_id, "client_phone": {"$in": [phone, empty_phone]}})
    db.appointments.delete_many({"id": ids["appointment"]})
    db.prescriptions.delete_many({"id": ids["prescription"]})
    db.invoices.delete_many({"id": ids["invoice"]})
    db.ambient_sessions.delete_many({"id": ids["ambient"]})
    mongo_client.close()


# Patient timeline must safely accept literal plus signs and aggregate all supported event kinds.
class TestSafetyTimeline:
    def test_plus_phone_without_history_does_not_crash(self, safety_context):
        phone = safety_context["empty_phone"]
        response = requests.get(
            f"{API}/safety/timeline/{phone}", headers=safety_context["headers"], timeout=TIMEOUT
        )
        assert response.status_code == 200, response.text
        body = response.json()
        assert body == {"client_phone": phone, "count": 0, "events": []}

    def test_timeline_aggregates_appointment_prescription_invoice_and_ambient(self, safety_context):
        phone = safety_context["phone"]
        response = requests.get(
            f"{API}/safety/timeline/{phone}", headers=safety_context["headers"], timeout=TIMEOUT
        )
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["client_phone"] == phone
        assert isinstance(body["count"], int)
        assert isinstance(body["events"], list)
        test_events = [event for event in body["events"] if event.get("id") in safety_context["ids"].values()]
        assert len(test_events) == 4, body
        assert {event["kind"] for event in test_events} == {"appointment", "prescription", "invoice", "ambient"}
        assert all(isinstance(event.get("title"), str) and event["title"] for event in test_events)
        assert all(isinstance(event.get("meta"), dict) for event in test_events)
        assert body["count"] == len(body["events"])
        when_values = [event.get("when", "") for event in body["events"]]
        assert when_values == sorted(when_values, reverse=True)


# Allergy upsert persistence and exact/sub-string safety conflict behavior.
class TestSafetyAllergiesAndDrugCheck:
    def test_allergy_upsert_persists_via_get(self, safety_context):
        phone = safety_context["phone"]
        saved = requests.put(
            f"{API}/safety/allergies",
            headers=safety_context["headers"],
            json={"client_phone": phone, "allergies": [" Penicillin ", ""]},
            timeout=TIMEOUT,
        )
        assert saved.status_code == 200, saved.text
        assert saved.json() == {"message": "Allergies saved", "allergies": ["Penicillin"]}

        fetched = requests.get(
            f"{API}/safety/allergies",
            headers=safety_context["headers"],
            params={"client_phone": phone},
            timeout=TIMEOUT,
        )
        assert fetched.status_code == 200, fetched.text
        body = fetched.json()
        assert body["allergies"] == ["Penicillin"]
        assert isinstance(body.get("updated_at"), str) and body["updated_at"]

    def test_amoxicillin_has_no_direct_allergy_conflict(self, safety_context):
        response = requests.post(
            f"{API}/safety/drug-check",
            headers=safety_context["headers"],
            json={"client_phone": safety_context["phone"], "medication_names": ["Amoxicillin"]},
            timeout=TIMEOUT,
        )
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["allergies"] == ["Penicillin"]
        assert body["allergy_conflicts"] == []
        assert isinstance(body["duplicates"], list)
        assert body["safe"] is True

    def test_penicillin_v_triggers_allergy_conflict(self, safety_context):
        response = requests.post(
            f"{API}/safety/drug-check",
            headers=safety_context["headers"],
            json={"client_phone": safety_context["phone"], "medication_names": ["Penicillin V"]},
            timeout=TIMEOUT,
        )
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["allergies"] == ["Penicillin"]
        assert body["allergy_conflicts"] == [{"medication": "Penicillin V", "allergy": "penicillin"}]
        assert isinstance(body["duplicates"], list)
        assert body["safe"] is False


# Requested health, auth, appointment, and client endpoint regressions.
class TestRequestedRegressions:
    def test_health(self):
        response = requests.get(f"{API}/health", timeout=TIMEOUT)
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["status"] == "healthy"
        assert body["components"]["database"] == "healthy"

    def test_login(self, safety_context):
        response = requests.post(f"{API}/auth/login", json=safety_context["credentials"], timeout=TIMEOUT)
        assert response.status_code == 200, response.text
        body = response.json()
        assert isinstance(body.get("token"), str) and body["token"]
        assert body["user"]["email"] == safety_context["credentials"]["email"]

    @pytest.mark.parametrize("resource", ["appointments", "clients"])
    def test_authenticated_list_endpoint(self, safety_context, resource):
        response = requests.get(f"{API}/{resource}", headers=safety_context["headers"], timeout=TIMEOUT)
        assert response.status_code == 200, response.text
        body = response.json()
        assert isinstance(body, list)
        assert all(isinstance(item, dict) and "_id" not in item for item in body)
