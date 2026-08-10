"""Phase 14 auth/appointments router extraction and seeded reviewer regression tests."""
from __future__ import annotations

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
BASE_URL = (FRONTEND_ENV.get("REACT_APP_BACKEND_URL") or "").rstrip("/")
if not BASE_URL:
    raise RuntimeError("REACT_APP_BACKEND_URL is missing from /app/frontend/.env")
API = f"{BASE_URL}/api"
TIMEOUT = 30


def _credentials(label: str) -> dict[str, str]:
    """Read the supplied account under test instead of embedding credentials."""
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


def _headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _assert_login(response: requests.Response, expected_email: str) -> dict:
    assert response.status_code == 200, response.text
    body = response.json()
    assert isinstance(body.get("token"), str) and body["token"]
    assert isinstance(body.get("user"), dict)
    assert body["user"]["email"] == expected_email
    assert "hashed_password" not in body["user"] and "_id" not in body["user"]
    return body


@pytest.fixture(scope="module")
def router_context():
    """Authenticate seeded users and track all isolated records for cleanup."""
    mongo_url = BACKEND_ENV.get("MONGO_URL")
    db_name = BACKEND_ENV.get("DB_NAME")
    assert mongo_url and db_name, "Mongo test setup variables are missing"
    mongo_client = MongoClient(mongo_url)
    db = mongo_client[db_name]
    doctor_credentials = _credentials("Doctor / Test Professional")
    reviewer_credentials = _credentials("Meta App Review Reviewer")

    # The limiter is intentionally exercised in dedicated tests. Remove stale preview hits first.
    db.login_ip_hits.delete_many({})
    db.login_attempts.delete_many({"email": {"$in": [doctor_credentials["email"], reviewer_credentials["email"]]}})

    doctor_response = requests.post(f"{API}/auth/login", json=doctor_credentials, timeout=TIMEOUT)
    doctor_login = _assert_login(doctor_response, doctor_credentials["email"])
    db.login_ip_hits.delete_many({})
    reviewer_response = requests.post(f"{API}/auth/login", json=reviewer_credentials, timeout=TIMEOUT)
    reviewer_login = _assert_login(reviewer_response, reviewer_credentials["email"])
    db.login_ip_hits.delete_many({})

    stamp = f"{int(time.time())}_{uuid.uuid4().hex[:8]}"
    context = {
        "db": db,
        "stamp": stamp,
        "doctor_credentials": doctor_credentials,
        "reviewer_credentials": reviewer_credentials,
        "doctor_login": doctor_login,
        "reviewer_login": reviewer_login,
        "doctor_headers": _headers(doctor_login["token"]),
        "reviewer_headers": _headers(reviewer_login["token"]),
        "created_appointment_ids": [],
        "created_client_ids": [],
        "created_user_ids": [],
        "deletion_ticket_ids": [],
    }

    reviewer_appt = db.appointments.find_one({"id": "appt-reviewer-demo-2026"})
    context["reviewer_vitals_original"] = {
        key: reviewer_appt[key]
        for key in (
            "vitals",
            "vitals_captured_by",
            "vitals_captured_by_role",
            "vitals_captured_at",
        )
        if reviewer_appt and key in reviewer_appt
    }
    yield context

    db.appointments.delete_many({"id": {"$in": context["created_appointment_ids"]}})
    db.clients.delete_many({"id": {"$in": context["created_client_ids"]}})
    db.users.delete_many({"id": {"$in": context["created_user_ids"]}})
    db.otp_codes.delete_many({"phone_number": {"$regex": "^\\+91911"}})
    db.login_attempts.delete_many({"email": {"$regex": "^test_router_"}})
    db.login_ip_hits.delete_many({})
    db.data_deletion_requests.delete_many({"ticket_id": {"$in": context["deletion_ticket_ids"]}})

    original = context["reviewer_vitals_original"]
    db.appointments.update_one(
        {"id": "appt-reviewer-demo-2026"},
        {
            "$unset": {
                "vitals": "",
                "vitals_captured_by": "",
                "vitals_captured_by_role": "",
                "vitals_captured_at": "",
            },
            **({"$set": original} if original else {}),
        },
    )
    mongo_client.close()


@pytest.fixture(scope="module")
def registered_user(router_context):
    """Register an isolated account through the extracted auth router."""
    email = f"test_router_{router_context['stamp']}@test.com"
    payload = {
        "name": "<b>TEST Router User</b>",
        "email": email,
        "password": "TestRouter@12345",
        "phone_number": f"+91911{uuid.uuid4().int % 10_000_000:07d}",
        "profession": "doctor",
    }
    response = requests.post(f"{API}/auth/register", json=payload, timeout=TIMEOUT)
    assert response.status_code == 200, response.text
    body = response.json()
    assert isinstance(body.get("token"), str) and body["token"]
    assert body["user"]["email"] == email
    assert body["user"]["name"] == "TEST Router User"
    assert body["user"]["role"] == "user"
    assert "hashed_password" not in body["user"] and "_id" not in body["user"]
    router_context["created_user_ids"].append(body["user"]["id"])
    return {"payload": payload, "body": body, "headers": _headers(body["token"])}


# Auth routes: registration, bcrypt login, identity, OTP persistence, and protections.
class TestAuthRouter:
    def test_register_returns_token_and_sanitized_user(self, registered_user):
        assert registered_user["body"]["user"]["profession"] == "doctor"

    def test_doctor_bcrypt_login(self, router_context):
        assert router_context["doctor_login"]["user"]["email"] == router_context["doctor_credentials"]["email"]

    def test_reviewer_bcrypt_login(self, router_context):
        assert router_context["reviewer_login"]["user"]["email"] == router_context["reviewer_credentials"]["email"]

    def test_bad_password_returns_401_invalid_credentials(self, router_context):
        router_context["db"].login_ip_hits.delete_many({})
        response = requests.post(
            f"{API}/auth/login",
            json={"email": router_context["doctor_credentials"]["email"], "password": "DefinitelyWrong@123"},
            timeout=TIMEOUT,
        )
        assert response.status_code == 401, response.text
        assert response.json()["detail"] == "Invalid credentials"
        router_context["db"].login_attempts.delete_many({"email": router_context["doctor_credentials"]["email"]})
        router_context["db"].login_ip_hits.delete_many({})

    def test_auth_me_excludes_password_hash(self, router_context):
        response = requests.get(f"{API}/auth/me", headers=router_context["doctor_headers"], timeout=TIMEOUT)
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["email"] == router_context["doctor_credentials"]["email"]
        assert body["id"] == router_context["doctor_login"]["user"]["id"]
        assert "hashed_password" not in body and "_id" not in body

    def test_send_otp_persists_row(self, router_context):
        phone = f"+91911{uuid.uuid4().int % 10_000_000:07d}"
        response = requests.post(f"{API}/auth/send-otp", json={"phone_number": phone}, timeout=TIMEOUT)
        assert response.status_code == 200, response.text
        assert response.json() == {"message": "OTP sent successfully", "phone_number": phone}
        row = router_context["db"].otp_codes.find_one({"phone_number": phone}, {"_id": 0})
        assert row and re.fullmatch(r"\d{6}", row["otp"])
        assert datetime.fromisoformat(row["expires_at"]) > datetime.now(timezone.utc)

    def test_verify_otp_existing_user_excludes_password_hash(self, router_context):
        user = router_context["db"].users.find_one({"id": router_context["doctor_login"]["user"]["id"]})
        phone = user["phone_number"]
        otp = "654321"
        router_context["db"].otp_codes.update_one(
            {"phone_number": phone},
            {"$set": {
                "otp": otp,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat(),
            }},
            upsert=True,
        )
        response = requests.post(
            f"{API}/auth/verify-otp", json={"phone_number": phone, "otp": otp}, timeout=TIMEOUT
        )
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["is_new_user"] is False and body["user"]["email"] == router_context["doctor_credentials"]["email"]
        assert "hashed_password" not in body["user"] and "_id" not in body["user"]

    def test_new_phone_otp_and_complete_registration(self, router_context):
        phone = f"+91911{uuid.uuid4().int % 10_000_000:07d}"
        sent = requests.post(f"{API}/auth/send-otp", json={"phone_number": phone}, timeout=TIMEOUT)
        assert sent.status_code == 200, sent.text
        otp_row = router_context["db"].otp_codes.find_one({"phone_number": phone}, {"_id": 0})
        verified = requests.post(
            f"{API}/auth/verify-otp",
            json={"phone_number": phone, "otp": otp_row["otp"]},
            timeout=TIMEOUT,
        )
        assert verified.status_code == 200, verified.text
        assert verified.json() == {"message": "Phone verified", "phone_number": phone, "is_new_user": True}
        completed = requests.post(
            f"{API}/auth/complete-registration",
            params={"name": "TEST OTP Router User", "profession": "doctor", "phone_number": phone},
            timeout=TIMEOUT,
        )
        assert completed.status_code == 200, completed.text
        body = completed.json()
        assert body["user"]["phone_number"] == phone and body["user"]["name"] == "TEST OTP Router User"
        assert isinstance(body.get("token"), str) and body["token"]
        router_context["created_user_ids"].append(body["user"]["id"])

    def test_google_login_returns_authorization_url(self):
        response = requests.get(f"{API}/auth/google/login", timeout=TIMEOUT)
        assert response.status_code == 200, response.text
        url = response.json().get("authorization_url")
        assert isinstance(url, str) and url.startswith("https://accounts.google.com/o/oauth2/auth?")
        assert "response_type=code" in url and "calendar" in url

    def test_fifth_failed_login_locks_same_email_with_429(self, router_context, registered_user):
        """The fifth failure itself must report the account lock, not a generic IP limit later."""
        db = router_context["db"]
        email = registered_user["payload"]["email"]
        db.login_ip_hits.delete_many({})
        db.login_attempts.delete_many({"email": email})
        with requests.Session() as session:
            responses = [
                session.post(
                    f"{API}/auth/login",
                    json={"email": email, "password": "WrongPassword@123"},
                    timeout=TIMEOUT,
                )
                for _ in range(5)
            ]
        assert [response.status_code for response in responses[:4]] == [401, 401, 401, 401]
        assert responses[4].status_code == 429, responses[4].text
        assert "temporarily locked" in responses[4].json().get("detail", "").lower()
        db.login_attempts.delete_many({"email": email})
        db.login_ip_hits.delete_many({})

    def test_sixth_bad_login_from_same_ip_is_rate_limited(self, router_context):
        db = router_context["db"]
        db.login_ip_hits.delete_many({})
        responses = []
        # The public ingress presents one client as either of two internal proxy IPs.
        # Continue past five so one backend-observed IP necessarily reaches its sixth hit.
        with requests.Session() as session:
            for index in range(15):
                email = f"test_router_rate_{index}_{router_context['stamp']}@test.com"
                response = session.post(
                    f"{API}/auth/login",
                    json={"email": email, "password": "WrongPassword@123"},
                    timeout=TIMEOUT,
                )
                responses.append(response)
                if index >= 5 and response.status_code != 401:
                    break
        assert [response.status_code for response in responses[:5]] == [401] * 5
        limited = next((response for response in responses[5:] if response.status_code != 401), None)
        assert limited is not None, [response.status_code for response in responses]
        assert limited.status_code == 429, limited.text
        assert "too many login attempts" in limited.json().get("detail", "").lower()
        db.login_attempts.delete_many({"email": {"$regex": "^test_router_rate_"}})
        db.login_ip_hits.delete_many({})


@pytest.fixture(scope="module")
def created_appointment(router_context):
    """Create an appointment and corresponding client through the extracted router."""
    phone = f"+91777{uuid.uuid4().int % 100_000_000:08d}"
    payload = {
        "client_name": f"TEST Router Patient {router_context['stamp']}",
        "client_phone": phone,
        "client_email": f"router_patient_{router_context['stamp']}@test.com",
        "appointment_date": (datetime.now(timezone.utc) + timedelta(days=20)).strftime("%Y-%m-%d"),
        "start_time": "14:00",
        "end_time": "14:30",
        "consultation_mode": "in-person",
        "notes": "TEST created through extracted router",
    }
    response = requests.post(
        f"{API}/appointments", headers=router_context["doctor_headers"], json=payload, timeout=TIMEOUT
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert isinstance(body.get("id"), str) and body["id"]
    assert body["client_name"] == payload["client_name"]
    assert body["professional_id"] == router_context["doctor_login"]["user"]["id"]
    router_context["created_appointment_ids"].append(body["id"])
    client = router_context["db"].clients.find_one(
        {"professional_id": body["professional_id"], "phone": phone}, {"_id": 0}
    )
    assert client and client["name"] == payload["client_name"] and client["total_appointments"] >= 1
    router_context["created_client_ids"].append(client["id"])
    return {"appointment": body, "payload": payload, "client": client}


# Appointments and clients: seeded reviewer data, CRUD persistence, ownership, and RBAC.
class TestAppointmentsAndClientsRouter:
    def test_doctor_appointments_list(self, router_context):
        response = requests.get(f"{API}/appointments", headers=router_context["doctor_headers"], timeout=TIMEOUT)
        assert response.status_code == 200, response.text
        assert isinstance(response.json(), list)
        assert all(item.get("professional_id") == router_context["doctor_login"]["user"]["id"] for item in response.json())

    def test_reviewer_has_named_appointment_on_expected_date(self, router_context):
        response = requests.get(f"{API}/appointments", headers=router_context["reviewer_headers"], timeout=TIMEOUT)
        assert response.status_code == 200, response.text
        rows = response.json()
        appointment = next(item for item in rows if item.get("id") == "appt-reviewer-demo-2026")
        assert appointment["client_name"] == "Reviewer Demo"
        assert appointment.get("appointment_date") == "2026-08-11", appointment

    def test_create_appointment_persists_and_creates_client(self, router_context, created_appointment):
        appointment_id = created_appointment["appointment"]["id"]
        response = requests.get(
            f"{API}/appointments/{appointment_id}", headers=router_context["doctor_headers"], timeout=TIMEOUT
        )
        assert response.status_code == 200, response.text
        assert response.json()["client_phone"] == created_appointment["payload"]["client_phone"]
        clients = requests.get(f"{API}/clients", headers=router_context["doctor_headers"], timeout=TIMEOUT)
        assert clients.status_code == 200
        assert created_appointment["client"]["id"] in [item["id"] for item in clients.json()]

    def test_other_doctor_cannot_read_reviewer_appointment(self, router_context):
        response = requests.get(
            f"{API}/appointments/appt-reviewer-demo-2026",
            headers=router_context["doctor_headers"],
            timeout=TIMEOUT,
        )
        assert response.status_code == 404, response.text
        assert response.json()["detail"] == "Appointment not found"

    def test_update_appointment_persists(self, router_context, created_appointment):
        appointment_id = created_appointment["appointment"]["id"]
        update = {"status": "confirmed", "notes": "TEST updated through extracted router"}
        response = requests.put(
            f"{API}/appointments/{appointment_id}",
            headers=router_context["doctor_headers"],
            json=update,
            timeout=TIMEOUT,
        )
        assert response.status_code == 200, response.text
        assert response.json() == {"message": "Updated successfully"}
        fetched = requests.get(
            f"{API}/appointments/{appointment_id}", headers=router_context["doctor_headers"], timeout=TIMEOUT
        )
        assert fetched.status_code == 200
        assert fetched.json()["status"] == "confirmed" and fetched.json()["notes"] == update["notes"]

    def test_patient_details_put_then_get(self, router_context, created_appointment):
        appointment_id = created_appointment["appointment"]["id"]
        details = {
            "name": f"TEST Detailed Patient {router_context['stamp']}",
            "age": 38,
            "sex": "female",
            "blood_group": "O+",
            "allergies": "None",
            "chronic_conditions": "None",
            "emergency_contact": "+919999999999",
            "abha_id": "TEST-ABHA-123",
        }
        updated = requests.put(
            f"{API}/appointments/{appointment_id}/patient-details",
            headers=router_context["doctor_headers"],
            json=details,
            timeout=TIMEOUT,
        )
        assert updated.status_code == 200, updated.text
        assert updated.json() == {"message": "Patient details updated successfully"}
        fetched = requests.get(
            f"{API}/appointments/{appointment_id}/patient-details",
            headers=router_context["doctor_headers"],
            timeout=TIMEOUT,
        )
        assert fetched.status_code == 200, fetched.text
        assert fetched.json() == details
        client = router_context["db"].clients.find_one({"id": created_appointment["client"]["id"]}, {"_id": 0})
        assert client["name"] == details["name"] and client["patient_details"] == details

    def test_update_rejects_immutable_ownership_fields(self, router_context, created_appointment):
        appointment_id = created_appointment["appointment"]["id"]
        try:
            response = requests.put(
                f"{API}/appointments/{appointment_id}",
                headers=router_context["doctor_headers"],
                json={"professional_id": "attacker-controlled-owner", "id": "attacker-controlled-id"},
                timeout=TIMEOUT,
            )
            assert response.status_code in (400, 403, 422), response.text
        finally:
            router_context["db"].appointments.update_one(
                {"$or": [{"id": appointment_id}, {"id": "attacker-controlled-id"}]},
                {"$set": {
                    "id": appointment_id,
                    "professional_id": router_context["doctor_login"]["user"]["id"],
                }},
            )

    def test_assistant_can_only_update_status(self, router_context, registered_user, created_appointment):
        user_id = registered_user["body"]["user"]["id"]
        router_context["db"].users.update_one(
            {"id": user_id},
            {"$set": {"role": "assistant", "profession": "assistant", "parent_user_id": router_context["doctor_login"]["user"]["id"]}},
        )
        appointment_id = created_appointment["appointment"]["id"]
        allowed = requests.put(
            f"{API}/appointments/{appointment_id}",
            headers=registered_user["headers"],
            json={"status": "arrived"},
            timeout=TIMEOUT,
        )
        assert allowed.status_code == 200, allowed.text
        fetched = requests.get(
            f"{API}/appointments/{appointment_id}", headers=registered_user["headers"], timeout=TIMEOUT
        )
        assert fetched.status_code == 200 and fetched.json()["status"] == "arrived"
        blocked = requests.put(
            f"{API}/appointments/{appointment_id}",
            headers=registered_user["headers"],
            json={"notes": "TEST forbidden assistant update"},
            timeout=TIMEOUT,
        )
        assert blocked.status_code == 403, blocked.text
        assert "only update appointment status" in blocked.json()["detail"].lower()

    def test_delete_appointment_and_verify_404(self, router_context):
        payload = {
            "client_name": f"TEST Router Delete {router_context['stamp']}",
            "client_phone": f"+91666{uuid.uuid4().int % 100_000_000:08d}",
            "appointment_date": "2030-01-01",
            "start_time": "09:00",
            "end_time": "09:30",
        }
        created = requests.post(
            f"{API}/appointments", headers=router_context["doctor_headers"], json=payload, timeout=TIMEOUT
        )
        assert created.status_code == 200, created.text
        appointment_id = created.json()["id"]
        client = router_context["db"].clients.find_one({"phone": payload["client_phone"]})
        if client:
            router_context["created_client_ids"].append(client["id"])
        deleted = requests.delete(
            f"{API}/appointments/{appointment_id}", headers=router_context["doctor_headers"], timeout=TIMEOUT
        )
        assert deleted.status_code == 200, deleted.text
        assert deleted.json() == {"message": "Deleted successfully"}
        gone = requests.get(
            f"{API}/appointments/{appointment_id}", headers=router_context["doctor_headers"], timeout=TIMEOUT
        )
        assert gone.status_code == 404

    def test_reviewer_clients_are_exact_seeded_demo_patients(self, router_context):
        response = requests.get(f"{API}/clients", headers=router_context["reviewer_headers"], timeout=TIMEOUT)
        assert response.status_code == 200, response.text
        clients = response.json()
        assert len(clients) == 3, clients
        assert {client["id"] for client in clients} == {"cli-0001", "cli-0002", "cli-0003"}
        assert {client["name"] for client in clients} == {"Reviewer Demo", "Priya Verma", "Rahul Iyer"}

    def test_reviewer_client_detail_has_appointments_and_empty_prescriptions(self, router_context):
        response = requests.get(f"{API}/clients/cli-0001", headers=router_context["reviewer_headers"], timeout=TIMEOUT)
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["name"] == "Reviewer Demo"
        assert "appt-reviewer-demo-2026" in [appointment["id"] for appointment in body["appointments"]]
        assert body["prescriptions"] == []
        assert "_id" not in body


# Vitals: empty seeded state, upsert metadata, and persisted retrieval.
class TestVitalsRouter:
    def test_reviewer_vitals_initially_empty(self, router_context):
        response = requests.get(
            f"{API}/appointments/appt-reviewer-demo-2026/vitals",
            headers=router_context["reviewer_headers"],
            timeout=TIMEOUT,
        )
        assert response.status_code == 200, response.text
        assert response.json() == {"vitals": {}, "captured_by": None, "captured_at": None}

    def test_reviewer_vitals_put_then_get(self, router_context):
        saved = requests.put(
            f"{API}/appointments/appt-reviewer-demo-2026/vitals",
            headers=router_context["reviewer_headers"],
            json={"bp": "120/80", "pulse": "72"},
            timeout=TIMEOUT,
        )
        assert saved.status_code == 200, saved.text
        body = saved.json()
        assert body["vitals"] == {"bp": "120/80", "pulse": "72"}
        assert isinstance(body.get("captured_by"), str) and body["captured_by"]
        fetched = requests.get(
            f"{API}/appointments/appt-reviewer-demo-2026/vitals",
            headers=router_context["reviewer_headers"],
            timeout=TIMEOUT,
        )
        assert fetched.status_code == 200, fetched.text
        fetched_body = fetched.json()
        assert fetched_body["vitals"] == {"bp": "120/80", "pulse": "72"}
        assert fetched_body["captured_by"] == body["captured_by"]
        assert datetime.fromisoformat(fetched_body["captured_at"])


# Untouched endpoint regressions requested for the router split.
class TestRequestedRegressions:
    def test_health(self):
        response = requests.get(f"{API}/health", timeout=TIMEOUT)
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["status"] == "healthy" and body["components"]["database"] == "healthy"

    def test_safety_timeline(self, router_context):
        phone = "+919000000001"
        response = requests.get(
            f"{API}/safety/timeline/{phone}", headers=router_context["reviewer_headers"], timeout=TIMEOUT
        )
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["client_phone"] == phone
        assert isinstance(body["events"], list) and body["count"] == len(body["events"])
        assert "appt-reviewer-demo-2026" in [event["id"] for event in body["events"]]

    def test_safety_drug_check(self, router_context):
        response = requests.post(
            f"{API}/safety/drug-check",
            headers=router_context["reviewer_headers"],
            json={"client_phone": "+919000000003", "medication_names": ["Paracetamol"]},
            timeout=TIMEOUT,
        )
        assert response.status_code == 200, response.text
        body = response.json()
        assert set(body) == {"allergies", "allergy_conflicts", "duplicates", "safe"}
        assert isinstance(body["safe"], bool)

    def test_data_deletion_request_persists(self, router_context):
        phone = f"+91555{uuid.uuid4().int % 100_000_000:08d}"
        response = requests.post(
            f"{API}/data-deletion/request",
            json={"phone": phone, "email": "test_router_deletion@example.test", "reason": "TEST regression"},
            timeout=TIMEOUT,
        )
        assert response.status_code == 200, response.text
        body = response.json()
        assert re.fullmatch(r"DEL-[A-F0-9]{10}", body["ticket_id"])
        assert body["status"] == "queued"
        router_context["deletion_ticket_ids"].append(body["ticket_id"])
        row = router_context["db"].data_deletion_requests.find_one({"ticket_id": body["ticket_id"]}, {"_id": 0})
        assert row and row["phone"] == phone and row["status"] == "queued"
