"""Iteration 14 P0 auth, appointment hardening, reviewer seed, and regression retests."""
from __future__ import annotations

import os
import re
import subprocess
import sys
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
BASE_URL = (
    os.environ.get("REACT_APP_BACKEND_URL")
    or FRONTEND_ENV.get("REACT_APP_BACKEND_URL")
    or ""
).rstrip("/")
if not BASE_URL:
    raise RuntimeError("REACT_APP_BACKEND_URL is missing")
API = f"{BASE_URL}/api"
TIMEOUT = 30


def _credentials(label: str) -> dict[str, str]:
    """Read required credentials from the shared credential file."""
    path = Path("/app/memory/test_credentials.md")
    if not path.exists():
        pytest.skip("Missing /app/memory/test_credentials.md")
    content = path.read_text(encoding="utf-8")
    section = re.search(rf"## {re.escape(label)}.*?(?=\n##|\Z)", content, re.I | re.S)
    if not section:
        pytest.skip(f"Missing credentials section: {label}")
    email = re.search(r"(?im)^\s*-\s*Email:\s*(\S+)", section.group(0))
    password = re.search(r"(?im)^\s*-\s*Password:\s*(\S+)", section.group(0))
    if not email or not password:
        pytest.skip(f"Incomplete credentials section: {label}")
    return {"email": email.group(1), "password": password.group(1)}


def _login(credentials: dict[str, str], forwarded_ip: str) -> dict:
    response = requests.post(
        f"{API}/auth/login",
        json=credentials,
        headers={"X-Forwarded-For": forwarded_ip},
        timeout=TIMEOUT,
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert isinstance(body.get("token"), str) and body["token"]
    assert body.get("user", {}).get("email") == credentials["email"]
    assert "hashed_password" not in body["user"] and "password" not in body["user"]
    return body


def _auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def retest_context():
    """Authenticate supplied users and track all isolated records for cleanup."""
    mongo_url = BACKEND_ENV.get("MONGO_URL")
    db_name = BACKEND_ENV.get("DB_NAME")
    assert mongo_url and db_name, "Mongo test setup variables are missing"
    mongo_client = MongoClient(mongo_url)
    db = mongo_client[db_name]
    doctor_credentials = _credentials("Doctor / Test Professional")
    reviewer_credentials = _credentials("Meta App Review Reviewer")

    db.login_ip_hits.delete_many({})
    db.login_attempts.delete_many(
        {"email": {"$in": [doctor_credentials["email"], reviewer_credentials["email"]]}}
    )
    doctor_login = _login(doctor_credentials, "198.51.100.10")
    reviewer_login = _login(reviewer_credentials, "198.51.100.11")
    db.login_ip_hits.delete_many({})

    context = {
        "db": db,
        "doctor_credentials": doctor_credentials,
        "reviewer_credentials": reviewer_credentials,
        "doctor_login": doctor_login,
        "reviewer_login": reviewer_login,
        "doctor_headers": _auth_headers(doctor_login["token"]),
        "reviewer_headers": _auth_headers(reviewer_login["token"]),
        "stamp": f"{int(time.time())}_{uuid.uuid4().hex[:8]}",
        "appointment_ids": [],
        "client_ids": [],
        "deletion_ticket_ids": [],
        "rate_emails": [],
    }
    yield context

    db.appointments.delete_many({"id": {"$in": context["appointment_ids"]}})
    db.clients.delete_many({"id": {"$in": context["client_ids"]}})
    db.data_deletion_requests.delete_many(
        {"ticket_id": {"$in": context["deletion_ticket_ids"]}}
    )
    db.otp_codes.delete_many({"phone_number": {"$in": context.get("otp_phones", [])}})
    db.login_attempts.delete_many({"email": {"$in": context["rate_emails"]}})
    db.login_ip_hits.delete_many({})
    mongo_client.close()


@pytest.fixture(scope="module")
def created_appointment(retest_context):
    """Create an isolated appointment and verify its client side effect."""
    phone = f"+91776{uuid.uuid4().int % 10_000_000:07d}"
    payload = {
        "client_name": f"TEST Iteration14 Patient {retest_context['stamp']}",
        "client_phone": phone,
        "client_email": f"iter14_{retest_context['stamp']}@test.com",
        "appointment_date": "2030-03-15",
        "start_time": "11:00",
        "end_time": "11:30",
        "consultation_mode": "in-person",
        "notes": "TEST iteration 14 original",
    }
    response = requests.post(
        f"{API}/appointments",
        headers=retest_context["doctor_headers"],
        json=payload,
        timeout=TIMEOUT,
    )
    assert response.status_code == 200, response.text
    appointment = response.json()
    assert isinstance(appointment.get("id"), str) and appointment["id"]
    assert appointment["professional_id"] == retest_context["doctor_login"]["user"]["id"]
    assert appointment["client_name"] == payload["client_name"]
    retest_context["appointment_ids"].append(appointment["id"])

    client = retest_context["db"].clients.find_one(
        {"professional_id": appointment["professional_id"], "phone": phone}, {"_id": 0}
    )
    assert client and client["name"] == payload["client_name"]
    retest_context["client_ids"].append(client["id"])
    return {"appointment": appointment, "payload": payload, "client": client}


# Reviewer seed schema and idempotency.
class TestReviewerSeed:
    def test_seed_is_idempotent_and_uses_current_appointment_schema(self, retest_context):
        db = retest_context["db"]
        expected_date = (datetime.now(timezone.utc) + timedelta(days=1)).strftime("%Y-%m-%d")
        assert expected_date == "2026-08-11"

        for _ in range(2):
            result = subprocess.run(
                [sys.executable, "/app/backend/seed_reviewer.py"],
                cwd="/app/backend",
                capture_output=True,
                text=True,
                timeout=60,
                check=False,
            )
            assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
            assert db.users.count_documents({"email": "reviewer@lumer.me"}) == 1
            assert db.appointments.count_documents({"id": "appt-reviewer-demo-2026"}) == 1
            assert db.clients.count_documents({"professional_id": "reviewer-meta-review-2026"}) == 3

        row = db.appointments.find_one({"id": "appt-reviewer-demo-2026"}, {"_id": 0})
        assert row["appointment_date"] == expected_date
        assert row["consultation_mode"] == "in-person"
        assert row["payment_status"] == "pending"

    def test_reviewer_list_returns_seeded_appointment_date(self, retest_context):
        response = requests.get(
            f"{API}/appointments", headers=retest_context["reviewer_headers"], timeout=TIMEOUT
        )
        assert response.status_code == 200, response.text
        rows = response.json()
        seeded = [row for row in rows if row.get("id") == "appt-reviewer-demo-2026"]
        assert len(seeded) == 1
        assert seeded[0]["appointment_date"] == "2026-08-11"


# P0 auth privacy, IP rate limiting, and same-account lockout.
class TestAuthP0:
    def test_auth_me_excludes_all_password_fields(self, retest_context):
        response = requests.get(
            f"{API}/auth/me", headers=retest_context["doctor_headers"], timeout=TIMEOUT
        )
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["email"] == retest_context["doctor_credentials"]["email"]
        assert "hashed_password" not in body
        assert "password" not in body
        assert "_id" not in body

    def test_verify_otp_existing_user_excludes_password_hash(self, retest_context):
        db = retest_context["db"]
        user = db.users.find_one({"id": retest_context["doctor_login"]["user"]["id"]})
        phone = user["phone_number"]
        retest_context.setdefault("otp_phones", []).append(phone)
        otp = "714205"
        db.otp_codes.update_one(
            {"phone_number": phone},
            {"$set": {
                "otp": otp,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat(),
            }},
            upsert=True,
        )
        response = requests.post(
            f"{API}/auth/verify-otp",
            json={"phone_number": phone, "otp": otp},
            timeout=TIMEOUT,
        )
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["is_new_user"] is False
        assert body["user"]["email"] == retest_context["doctor_credentials"]["email"]
        assert "hashed_password" not in body["user"]
        assert "password" not in body["user"]
        assert "_id" not in body["user"]

    def test_sixth_bad_login_same_forwarded_ip_returns_json_429(self, retest_context):
        db = retest_context["db"]
        forwarded_ip = "203.0.113.140"
        emails = [f"test_iter14_ip_{i}_{retest_context['stamp']}@test.com" for i in range(6)]
        retest_context["rate_emails"].extend(emails)
        db.login_ip_hits.delete_many({"ip": forwarded_ip})
        try:
            responses = [
                requests.post(
                    f"{API}/auth/login",
                    json={"email": email, "password": "WrongPassword@123"},
                    headers={"X-Forwarded-For": forwarded_ip},
                    timeout=TIMEOUT,
                )
                for email in emails
            ]
            assert [response.status_code for response in responses[:5]] == [401] * 5
            assert responses[5].status_code == 429, responses[5].text
            assert responses[5].json() == {
                "detail": "Too many login attempts. Please wait a minute and retry."
            }
        finally:
            db.login_attempts.delete_many({"email": {"$in": emails}})
            db.login_ip_hits.delete_many({"ip": forwarded_ip})

    def test_fifth_same_email_failure_and_subsequent_attempt_return_account_429(self, retest_context):
        db = retest_context["db"]
        email = f"test_iter14_lock_{retest_context['stamp']}@test.com"
        retest_context["rate_emails"].append(email)
        db.login_attempts.delete_many({"email": email})
        try:
            responses = []
            for index in range(5):
                responses.append(
                    requests.post(
                        f"{API}/auth/login",
                        json={"email": email, "password": "WrongPassword@123"},
                        headers={"X-Forwarded-For": f"198.18.0.{index + 1}"},
                        timeout=TIMEOUT,
                    )
                )
            assert [response.status_code for response in responses[:4]] == [401] * 4
            assert responses[4].status_code == 429, responses[4].text
            assert responses[4].json() == {
                "detail": "Account temporarily locked. Try again in 15 minutes."
            }

            subsequent = requests.post(
                f"{API}/auth/login",
                json={"email": email, "password": "WrongPassword@123"},
                headers={"X-Forwarded-For": "198.18.0.99"},
                timeout=TIMEOUT,
            )
            assert subsequent.status_code == 429, subsequent.text
            assert subsequent.json()["detail"].startswith("Account temporarily locked. Try again in ")
        finally:
            db.login_attempts.delete_many({"email": email})
            db.login_ip_hits.delete_many({"ip": {"$regex": "^198\\.18\\.0\\."}})


# Appointment mass-assignment protection and requested CRUD/client/vitals regressions.
class TestAppointmentP0AndRegressions:
    def test_mass_assignment_fields_are_stripped_while_notes_update(
        self, retest_context, created_appointment
    ):
        original = created_appointment["appointment"]
        update = {
            "id": "attacker-controlled-id",
            "professional_id": "attacker-controlled-owner",
            "created_at": "1999-01-01T00:00:00+00:00",
            "created_by": "attacker-controlled-creator",
            "notes": "TEST legitimate note survived immutable stripping",
        }
        response = requests.put(
            f"{API}/appointments/{original['id']}",
            headers=retest_context["doctor_headers"],
            json=update,
            timeout=TIMEOUT,
        )
        assert response.status_code == 200, response.text
        assert response.json() == {"message": "Updated successfully"}

        fetched = requests.get(
            f"{API}/appointments/{original['id']}",
            headers=retest_context["doctor_headers"],
            timeout=TIMEOUT,
        )
        assert fetched.status_code == 200, fetched.text
        body = fetched.json()
        assert body["id"] == original["id"]
        assert body["professional_id"] == original["professional_id"]
        assert body["created_at"] == original["created_at"]
        assert body["created_by"] == original["created_by"]
        assert body["notes"] == update["notes"]

    def test_clients_get_contains_created_client(self, retest_context, created_appointment):
        response = requests.get(
            f"{API}/clients", headers=retest_context["doctor_headers"], timeout=TIMEOUT
        )
        assert response.status_code == 200, response.text
        rows = response.json()
        assert created_appointment["client"]["id"] in [row["id"] for row in rows]
        assert all("_id" not in row for row in rows)

    def test_vitals_put_then_get_persists(self, retest_context, created_appointment):
        appointment_id = created_appointment["appointment"]["id"]
        payload = {"bp": "118/76", "pulse": "69", "spo2": "99"}
        saved = requests.put(
            f"{API}/appointments/{appointment_id}/vitals",
            headers=retest_context["doctor_headers"],
            json=payload,
            timeout=TIMEOUT,
        )
        assert saved.status_code == 200, saved.text
        assert saved.json()["vitals"] == payload

        fetched = requests.get(
            f"{API}/appointments/{appointment_id}/vitals",
            headers=retest_context["doctor_headers"],
            timeout=TIMEOUT,
        )
        assert fetched.status_code == 200, fetched.text
        body = fetched.json()
        assert body["vitals"] == payload
        assert isinstance(body["captured_by"], str) and body["captured_by"]
        datetime.fromisoformat(body["captured_at"])

    def test_appointment_delete_then_get_returns_404(self, retest_context):
        payload = {
            "client_name": f"TEST Iteration14 Delete {retest_context['stamp']}",
            "client_phone": f"+91775{uuid.uuid4().int % 10_000_000:07d}",
            "appointment_date": "2030-04-01",
            "start_time": "09:00",
            "end_time": "09:30",
        }
        created = requests.post(
            f"{API}/appointments",
            headers=retest_context["doctor_headers"],
            json=payload,
            timeout=TIMEOUT,
        )
        assert created.status_code == 200, created.text
        appointment_id = created.json()["id"]
        client = retest_context["db"].clients.find_one({"phone": payload["client_phone"]})
        if client:
            retest_context["client_ids"].append(client["id"])

        deleted = requests.delete(
            f"{API}/appointments/{appointment_id}",
            headers=retest_context["doctor_headers"],
            timeout=TIMEOUT,
        )
        assert deleted.status_code == 200, deleted.text
        assert deleted.json() == {"message": "Deleted successfully"}
        gone = requests.get(
            f"{API}/appointments/{appointment_id}",
            headers=retest_context["doctor_headers"],
            timeout=TIMEOUT,
        )
        assert gone.status_code == 404
        assert gone.json()["detail"] == "Appointment not found"


# Untouched endpoint regression checks requested for the router refactor.
class TestRequestedRegressions:
    def test_sarah_login_and_me_still_work(self, retest_context):
        db = retest_context["db"]
        db.login_ip_hits.delete_many({"ip": "192.0.2.200"})
        login = _login(retest_context["doctor_credentials"], "192.0.2.200")
        me = requests.get(
            f"{API}/auth/me", headers=_auth_headers(login["token"]), timeout=TIMEOUT
        )
        assert me.status_code == 200, me.text
        assert me.json()["email"] == retest_context["doctor_credentials"]["email"]

    def test_health(self):
        response = requests.get(f"{API}/health", timeout=TIMEOUT)
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["status"] == "healthy"
        assert body["components"]["database"] == "healthy"

    def test_safety_timeline(self, retest_context):
        response = requests.get(
            f"{API}/safety/timeline/+919000000001",
            headers=retest_context["reviewer_headers"],
            timeout=TIMEOUT,
        )
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["client_phone"] == "+919000000001"
        assert body["count"] == len(body["events"])
        assert "appt-reviewer-demo-2026" in [event["id"] for event in body["events"]]

    def test_safety_drug_check(self, retest_context):
        response = requests.post(
            f"{API}/safety/drug-check",
            headers=retest_context["reviewer_headers"],
            json={"client_phone": "+919000000003", "medication_names": ["Paracetamol"]},
            timeout=TIMEOUT,
        )
        assert response.status_code == 200, response.text
        body = response.json()
        assert set(body) == {"allergies", "allergy_conflicts", "duplicates", "safe"}
        assert isinstance(body["safe"], bool)

    def test_data_deletion_request(self, retest_context):
        phone = f"+91554{uuid.uuid4().int % 10_000_000:07d}"
        response = requests.post(
            f"{API}/data-deletion/request",
            json={
                "phone": phone,
                "email": f"iter14_delete_{retest_context['stamp']}@test.com",
                "reason": "TEST iteration 14 regression",
            },
            timeout=TIMEOUT,
        )
        assert response.status_code == 200, response.text
        body = response.json()
        assert re.fullmatch(r"DEL-[A-F0-9]{10}", body["ticket_id"])
        assert body["status"] == "queued"
        retest_context["deletion_ticket_ids"].append(body["ticket_id"])
        persisted = retest_context["db"].data_deletion_requests.find_one(
            {"ticket_id": body["ticket_id"]}, {"_id": 0}
        )
        assert persisted and persisted["phone"] == phone and persisted["status"] == "queued"
