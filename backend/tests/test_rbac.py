"""RBAC regression coverage for Admin, Doctor, Front Desk, Assistant, and legacy Receptionist."""
import io
import os
import re
import time
import uuid
import wave
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values
from passlib.context import CryptContext
from pymongo import MongoClient


FRONTEND_ENV = dotenv_values("/app/frontend/.env")
BACKEND_ENV = dotenv_values("/app/backend/.env")
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or FRONTEND_ENV.get("REACT_APP_BACKEND_URL") or "").rstrip("/")
if not BASE_URL:
    raise RuntimeError("REACT_APP_BACKEND_URL is missing")
API = f"{BASE_URL}/api"
TIMEOUT = 30
PWD_CONTEXT = CryptContext(schemes=["bcrypt"], deprecated="auto")


def _credentials():
    path = Path("/app/memory/test_credentials.md")
    if not path.exists():
        pytest.skip("Missing /app/memory/test_credentials.md")
    text = path.read_text(encoding="utf-8")
    sections = {}
    for label, section_pattern in {
        "doctor": r"## Doctor.*?(?=\n##|\Z)",
        "admin": r"## Admin.*?(?=\n##|\Z)",
    }.items():
        section_match = re.search(section_pattern, text, re.I | re.S)
        if not section_match:
            pytest.skip(f"Missing {label} credentials section")
        section = section_match.group(0)
        email = re.search(r"(?im)^\s*-\s*Email:\s*(\S+)", section)
        password = re.search(r"(?im)^\s*-\s*Password:\s*(\S+)", section)
        if not email or not password:
            pytest.skip(f"Incomplete {label} credentials")
        sections[label] = {"email": email.group(1), "password": password.group(1)}
    return sections


def _login(creds):
    response = requests.post(f"{API}/auth/login", json=creds, timeout=TIMEOUT)
    if response.status_code == 429:
        retry_after = int(response.headers.get("Retry-After", "60"))
        time.sleep(max(61, retry_after + 1))
        response = requests.post(f"{API}/auth/login", json=creds, timeout=TIMEOUT)
    assert response.status_code == 200, f"Login failed for {creds['email']}: {response.status_code} {response.text}"
    data = response.json()
    assert isinstance(data.get("token"), str) and data["token"]
    assert data.get("user", {}).get("email") == creds["email"]
    return data


def _headers(token):
    return {"Authorization": f"Bearer {token}"}


def _assert_error(response, status=403):
    assert response.status_code == status, f"Expected {status}, got {response.status_code}: {response.text}"
    body = response.json()
    assert isinstance(body.get("detail"), str) and body["detail"]


@pytest.fixture(scope="module")
def rbac_context():
    """Create isolated clinic, role users, shared appointment/invoice, and legacy receptionist."""
    creds = _credentials()
    doctor_login = _login(creds["doctor"])
    doctor_headers = _headers(doctor_login["token"])
    admin_login = _login(creds["admin"])
    admin_headers = _headers(admin_login["token"])
    doctor_id = doctor_login["user"]["id"]
    stamp = f"{int(time.time())}_{uuid.uuid4().hex[:6]}"
    created_sub_ids = []
    created_appointment_ids = []
    created_invoice_ids = []

    clinic_response = requests.post(
        f"{API}/clinics",
        headers=doctor_headers,
        json={"name": f"TEST_RBAC_Clinic_{stamp}", "address": "QA Address"},
        timeout=TIMEOUT,
    )
    assert clinic_response.status_code == 200, clinic_response.text
    clinic = clinic_response.json()
    assert clinic["name"] == f"TEST_RBAC_Clinic_{stamp}"
    clinic_id = clinic["id"]

    role_users = {}
    role_passwords = {"assistant": "Asst@12345", "front_desk": "Fd@12345"}
    for role in ("assistant", "front_desk"):
        user_creds = {
            "email": f"test_rbac_{role}_{stamp}@test.com",
            "password": role_passwords[role],
        }
        create_response = requests.post(
            f"{API}/clinics/sub-users",
            headers=doctor_headers,
            json={
                "name": f"TEST RBAC {role}",
                "email": user_creds["email"],
                "password": user_creds["password"],
                "phone_number": f"+9198{uuid.uuid4().int % 100000000:08d}",
                "clinic_id": clinic_id,
                "role": role,
            },
            timeout=TIMEOUT,
        )
        assert create_response.status_code == 200, create_response.text
        user = create_response.json()
        created_sub_ids.append(user["id"])
        login = _login(user_creds)
        role_users[role] = {
            "user": user,
            "creds": user_creds,
            "headers": _headers(login["token"]),
            "login_user": login["user"],
        }

    # Seed a legacy receptionist because the new API intentionally accepts only new role names.
    mongo_url = BACKEND_ENV.get("MONGO_URL")
    db_name = BACKEND_ENV.get("DB_NAME")
    assert mongo_url and db_name, "Mongo test setup variables are missing"
    mongo_client = MongoClient(mongo_url)
    db = mongo_client[db_name]
    legacy_id = str(uuid.uuid4())
    legacy_creds = {"email": f"test_rbac_legacy_{stamp}@test.com", "password": "Xxx@12345"}
    db.users.insert_one({
        "id": legacy_id,
        "name": "TEST RBAC Legacy Receptionist",
        "email": legacy_creds["email"],
        "hashed_password": PWD_CONTEXT.hash(legacy_creds["password"]),
        "phone_number": f"+9197{uuid.uuid4().int % 100000000:08d}",
        "profession": "receptionist",
        "role": "receptionist",
        "parent_user_id": doctor_id,
        "clinic_id": clinic_id,
        "whatsapp_verified": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    legacy_login = _login(legacy_creds)

    appointment_payload = {
        "client_name": f"TEST_RBAC_Shared_{stamp}",
        "client_phone": f"+9196{uuid.uuid4().int % 100000000:08d}",
        "client_email": f"rbac_patient_{stamp}@test.com",
        "appointment_date": (datetime.now(timezone.utc) + timedelta(days=10)).strftime("%Y-%m-%d"),
        "start_time": "10:00",
        "end_time": "10:30",
        "consultation_mode": "in-person",
        "notes": "TEST RBAC shared appointment",
    }
    appointment_response = requests.post(
        f"{API}/appointments", headers=doctor_headers, json=appointment_payload, timeout=TIMEOUT
    )
    assert appointment_response.status_code == 200, appointment_response.text
    appointment = appointment_response.json()
    created_appointment_ids.append(appointment["id"])

    invoice_response = requests.post(
        f"{API}/invoices",
        headers=doctor_headers,
        json={
            "client_name": f"TEST_RBAC_Invoice_{stamp}",
            "client_phone": appointment_payload["client_phone"],
            "items": [{"description": "TEST RBAC consult", "qty": 1, "rate": 100}],
            "payment_status": "pending",
        },
        timeout=TIMEOUT,
    )
    assert invoice_response.status_code == 200, invoice_response.text
    invoice = invoice_response.json()
    created_invoice_ids.append(invoice["id"])

    context = {
        "stamp": stamp,
        "doctor": {"headers": doctor_headers, "user": doctor_login["user"]},
        "admin": {"headers": admin_headers, "user": admin_login["user"]},
        "assistant": role_users["assistant"],
        "front_desk": role_users["front_desk"],
        "legacy": {"headers": _headers(legacy_login["token"]), "user": legacy_login["user"], "id": legacy_id},
        "clinic_id": clinic_id,
        "appointment": appointment,
        "appointment_payload": appointment_payload,
        "invoice": invoice,
        "created_sub_ids": created_sub_ids,
        "created_appointment_ids": created_appointment_ids,
        "created_invoice_ids": created_invoice_ids,
        "db": db,
    }
    yield context

    for invoice_id in created_invoice_ids:
        requests.delete(f"{API}/invoices/{invoice_id}", headers=doctor_headers, timeout=TIMEOUT)
    for appointment_id in created_appointment_ids:
        requests.delete(f"{API}/appointments/{appointment_id}", headers=doctor_headers, timeout=TIMEOUT)
    db.consultation_notes.delete_many({"client_name": {"$regex": f"^TEST_RBAC.*{re.escape(stamp)}"}})
    db.invoices.delete_many({"client_name": {"$regex": f"^TEST_RBAC.*{re.escape(stamp)}"}})
    db.appointments.delete_many({"client_name": {"$regex": f"^TEST_RBAC.*{re.escape(stamp)}"}})
    db.clients.delete_many({"name": {"$regex": f"^TEST_RBAC.*{re.escape(stamp)}"}})
    for sub_id in created_sub_ids:
        requests.delete(f"{API}/clinics/sub-users/{sub_id}", headers=doctor_headers, timeout=TIMEOUT)
    db.users.delete_one({"id": legacy_id})
    requests.delete(f"{API}/clinics/{clinic_id}", headers=doctor_headers, timeout=TIMEOUT)
    mongo_client.close()


class TestSubUserCreation:
    """Validate accepted role names, persisted fields, invalid roles, and per-clinic limits."""

    @pytest.mark.parametrize("role", ["assistant", "front_desk"])
    def test_role_fields_and_list_persistence(self, rbac_context, role):
        role_user = rbac_context[role]["user"]
        assert role_user["role"] == role
        assert role_user["profession"] == role
        assert role_user["parent_user_id"] == rbac_context["doctor"]["user"]["id"]
        assert role_user["clinic_id"] == rbac_context["clinic_id"]
        response = requests.get(
            f"{API}/clinics/sub-users", headers=rbac_context["doctor"]["headers"], timeout=TIMEOUT
        )
        assert response.status_code == 200
        matched = next(item for item in response.json() if item["id"] == role_user["id"])
        assert matched["role"] == role and matched["profession"] == role

    @pytest.mark.parametrize("role", ["admin", "doctor", "invalid"])
    def test_invalid_roles_rejected(self, rbac_context, role):
        response = requests.post(
            f"{API}/clinics/sub-users",
            headers=rbac_context["doctor"]["headers"],
            json={
                "name": "TEST Invalid Role",
                "email": f"invalid_{role}_{rbac_context['stamp']}@test.com",
                "phone_number": "+919500000000",
                "password": "Xxx@12345",
                "clinic_id": rbac_context["clinic_id"],
                "role": role,
            },
            timeout=TIMEOUT,
        )
        _assert_error(response, 400)

    @pytest.mark.parametrize("role", ["assistant", "front_desk"])
    def test_max_two_per_role_per_clinic(self, rbac_context, role):
        doctor_headers = rbac_context["doctor"]["headers"]
        second_email = f"test_rbac_{role}_second_{rbac_context['stamp']}@test.com"
        second = requests.post(
            f"{API}/clinics/sub-users",
            headers=doctor_headers,
            json={
                "name": f"TEST RBAC second {role}",
                "email": second_email,
                "phone_number": f"+9194{uuid.uuid4().int % 100000000:08d}",
                "password": "Xxx@12345",
                "clinic_id": rbac_context["clinic_id"],
                "role": role,
            },
            timeout=TIMEOUT,
        )
        assert second.status_code == 200, second.text
        rbac_context["created_sub_ids"].append(second.json()["id"])
        assert second.json()["role"] == role

        third = requests.post(
            f"{API}/clinics/sub-users",
            headers=doctor_headers,
            json={
                "name": f"TEST RBAC third {role}",
                "email": f"test_rbac_{role}_third_{rbac_context['stamp']}@test.com",
                "phone_number": f"+9193{uuid.uuid4().int % 100000000:08d}",
                "password": "Xxx@12345",
                "clinic_id": rbac_context["clinic_id"],
                "role": role,
            },
            timeout=TIMEOUT,
        )
        _assert_error(third, 400)
        assert "Maximum 2" in third.json()["detail"]


class TestAssistantPermissions:
    """Assistant can read clinic schedules/clients but cannot use write or sensitive APIs."""

    def test_read_appointments_and_clients_scoped_to_parent(self, rbac_context):
        headers = rbac_context["assistant"]["headers"]
        appointments = requests.get(f"{API}/appointments", headers=headers, timeout=TIMEOUT)
        clients = requests.get(f"{API}/clients", headers=headers, timeout=TIMEOUT)
        assert appointments.status_code == 200 and isinstance(appointments.json(), list)
        assert clients.status_code == 200 and isinstance(clients.json(), list)
        assert rbac_context["appointment"]["id"] in [item["id"] for item in appointments.json()]
        assert rbac_context["appointment_payload"]["client_phone"] in [item["phone"] for item in clients.json()]

    @pytest.mark.parametrize(
        "method,path,payload",
        [
            ("post", "/appointments", {
                "client_name": "TEST_RBAC_Assistant_Blocked",
                "client_phone": "+919200000001",
                "appointment_date": "2030-01-01",
                "start_time": "09:00",
                "end_time": "09:30",
            }),
            ("post", "/prescriptions/drug-interactions", {"medications": [{"medicine_name": "Aspirin"}]}),
            ("post", "/invoices", {"client_name": "TEST_RBAC_Assistant_Invoice", "items": [{"description": "x", "qty": 1, "rate": 1}]}),
            ("post", "/clinics", {"name": "TEST_RBAC_Assistant_Clinic"}),
            ("get", "/analytics/opd", None),
            ("post", "/hexa/command", {"text": "show today's appointments"}),
            ("post", "/clinics/sub-users", {
                "name": "Blocked", "email": "blocked_assistant@test.com", "phone_number": "+919100000001",
                "password": "Xxx@12345", "role": "assistant",
            }),
        ],
    )
    def test_blocked_endpoints(self, rbac_context, method, path, payload):
        response = requests.request(
            method,
            f"{API}{path}",
            headers=rbac_context["assistant"]["headers"],
            json=payload,
            timeout=TIMEOUT,
        )
        _assert_error(response, 403)
        if response.status_code != 403 and isinstance(response.json(), dict):
            created_id = response.json().get("id")
            if path == "/appointments" and created_id:
                rbac_context["created_appointment_ids"].append(created_id)
            if path == "/invoices" and created_id:
                rbac_context["created_invoice_ids"].append(created_id)

    def test_consultation_notes_post_blocked(self, rbac_context):
        response = requests.post(
            f"{API}/consultation-notes",
            headers=rbac_context["assistant"]["headers"],
            json={
                "appointment_id": rbac_context["appointment"]["id"],
                "client_name": f"TEST_RBAC_Assistant_Note_{rbac_context['stamp']}",
                "summary": "Must be forbidden",
                "send_to_client": False,
            },
            timeout=TIMEOUT,
        )
        _assert_error(response, 403)

    def test_status_only_update_allowed_but_notes_update_blocked(self, rbac_context):
        headers = rbac_context["assistant"]["headers"]
        appointment_id = rbac_context["appointment"]["id"]

        status_update = requests.put(
            f"{API}/appointments/{appointment_id}",
            headers=headers,
            json={"status": "arrived"},
            timeout=TIMEOUT,
        )
        assert status_update.status_code == 200, status_update.text
        persisted = requests.get(f"{API}/appointments/{appointment_id}", headers=headers, timeout=TIMEOUT)
        assert persisted.status_code == 200
        assert persisted.json()["status"] == "arrived"

        notes_update = requests.put(
            f"{API}/appointments/{appointment_id}",
            headers=headers,
            json={"notes": "TEST assistant must not write this"},
            timeout=TIMEOUT,
        )
        _assert_error(notes_update, 403)

    def test_appointment_delete_blocked(self, rbac_context):
        appointment_id = rbac_context["appointment"]["id"]
        response = requests.delete(
            f"{API}/appointments/{appointment_id}",
            headers=rbac_context["assistant"]["headers"],
            timeout=TIMEOUT,
        )
        _assert_error(response, 403)
        still_exists = requests.get(
            f"{API}/appointments/{appointment_id}",
            headers=rbac_context["doctor"]["headers"],
            timeout=TIMEOUT,
        )
        assert still_exists.status_code == 200

    def test_invoice_update_blocked(self, rbac_context):
        response = requests.put(
            f"{API}/invoices/{rbac_context['invoice']['id']}",
            headers=rbac_context["assistant"]["headers"],
            json={"notes": "TEST assistant forbidden"},
            timeout=TIMEOUT,
        )
        _assert_error(response, 403)

    @pytest.mark.parametrize(
        "method,path,payload",
        [
            ("get", "/consultation-notes", None),
            ("get", "/consultation-notes/by-appointment/fake-id", None),
            ("put", "/consultation-notes/fake-id", {"summary": "forbidden"}),
        ],
    )
    def test_consultation_notes_read_and_update_blocked(self, rbac_context, method, path, payload):
        response = requests.request(
            method,
            f"{API}{path}",
            headers=rbac_context["assistant"]["headers"],
            json=payload,
            timeout=TIMEOUT,
        )
        _assert_error(response, 403)


class TestFrontDeskPermissions:
    """Front desk has appointment CRUD and client read, but sensitive routes remain blocked."""

    def test_parent_scoped_listing(self, rbac_context):
        headers = rbac_context["front_desk"]["headers"]
        listing = requests.get(f"{API}/appointments", headers=headers, timeout=TIMEOUT)
        assert listing.status_code == 200
        assert rbac_context["appointment"]["id"] in [item["id"] for item in listing.json()]

    def test_appointment_full_crud(self, rbac_context):
        headers = rbac_context["front_desk"]["headers"]
        payload = {
            "client_name": f"TEST_RBAC_Front_CRUD_{rbac_context['stamp']}",
            "client_phone": "+919200000002",
            "appointment_date": "2030-01-02",
            "start_time": "11:00",
            "end_time": "11:30",
            "notes": "created by front desk",
        }
        created = requests.post(f"{API}/appointments", headers=headers, json=payload, timeout=TIMEOUT)
        assert created.status_code == 200, created.text
        body = created.json()
        appointment_id = body["id"]
        rbac_context["created_appointment_ids"].append(appointment_id)

        fetched = requests.get(f"{API}/appointments/{appointment_id}", headers=headers, timeout=TIMEOUT)
        assert fetched.status_code == 200 and fetched.json()["client_name"] == payload["client_name"]
        updated = requests.put(
            f"{API}/appointments/{appointment_id}",
            headers=headers,
            json={"status": "completed", "notes": "TEST updated by front desk"},
            timeout=TIMEOUT,
        )
        assert updated.status_code == 200
        persisted = requests.get(f"{API}/appointments/{appointment_id}", headers=headers, timeout=TIMEOUT)
        assert persisted.status_code == 200
        assert persisted.json()["status"] == "completed"
        assert persisted.json()["notes"] == "TEST updated by front desk"
        deleted = requests.delete(f"{API}/appointments/{appointment_id}", headers=headers, timeout=TIMEOUT)
        assert deleted.status_code == 200
        gone = requests.get(f"{API}/appointments/{appointment_id}", headers=headers, timeout=TIMEOUT)
        assert gone.status_code == 404
        rbac_context["created_appointment_ids"].remove(appointment_id)
        assert body["professional_id"] == rbac_context["doctor"]["user"]["id"]
        assert body["created_by"] == rbac_context["front_desk"]["user"]["id"]

    def test_clients_read_allowed(self, rbac_context):
        response = requests.get(f"{API}/clients", headers=rbac_context["front_desk"]["headers"], timeout=TIMEOUT)
        assert response.status_code == 200 and isinstance(response.json(), list)
        assert rbac_context["appointment_payload"]["client_phone"] in [item["phone"] for item in response.json()]

    @pytest.mark.parametrize(
        "method,path,payload",
        [
            ("post", "/prescriptions/drug-interactions", {"medications": [{"medicine_name": "Aspirin"}]}),
            ("post", "/prescriptions", {"appointment_id": "x", "client_name": "x", "medications": [], "instructions": "x"}),
            ("post", "/hexa/command", {"text": "show today's appointments"}),
            ("post", "/clinics", {"name": "TEST_RBAC_Front_Clinic"}),
        ],
    )
    def test_sensitive_posts_blocked(self, rbac_context, method, path, payload):
        response = requests.request(
            method, f"{API}{path}", headers=rbac_context["front_desk"]["headers"], json=payload, timeout=TIMEOUT
        )
        _assert_error(response, 403)

    def test_consultation_notes_blocked(self, rbac_context):
        response = requests.post(
            f"{API}/consultation-notes",
            headers=rbac_context["front_desk"]["headers"],
            json={
                "appointment_id": rbac_context["appointment"]["id"],
                "client_name": f"TEST_RBAC_Front_Note_{rbac_context['stamp']}",
                "summary": "Must be forbidden",
                "send_to_client": False,
            },
            timeout=TIMEOUT,
        )
        _assert_error(response, 403)
        for method, path, payload in [
            ("get", "/consultation-notes", None),
            ("get", "/consultation-notes/by-appointment/fake-id", None),
            ("put", "/consultation-notes/fake-id", {"summary": "forbidden"}),
        ]:
            blocked = requests.request(
                method,
                f"{API}{path}",
                headers=rbac_context["front_desk"]["headers"],
                json=payload,
                timeout=TIMEOUT,
            )
            _assert_error(blocked, 403)

    def test_invoice_create_allowed_and_parent_scoped(self, rbac_context):
        response = requests.post(
            f"{API}/invoices",
            headers=rbac_context["front_desk"]["headers"],
            json={
                "client_name": f"TEST_RBAC_Front_Invoice_{rbac_context['stamp']}",
                "client_phone": rbac_context["appointment_payload"]["client_phone"],
                "items": [{"description": "TEST front desk consult", "qty": 1, "rate": 125}],
                "payment_status": "pending",
            },
            timeout=TIMEOUT,
        )
        assert response.status_code == 200, response.text
        body = response.json()
        rbac_context["created_invoice_ids"].append(body["id"])
        assert body["owner_id"] == rbac_context["doctor"]["user"]["id"]
        assert body["created_by"] == rbac_context["front_desk"]["user"]["id"]
        persisted = requests.get(
            f"{API}/invoices/{body['id']}",
            headers=rbac_context["doctor"]["headers"],
            timeout=TIMEOUT,
        )
        assert persisted.status_code == 200
        assert persisted.json()["client_name"] == body["client_name"]

    def test_invoice_delete_blocked(self, rbac_context):
        response = requests.delete(
            f"{API}/invoices/{rbac_context['invoice']['id']}",
            headers=rbac_context["front_desk"]["headers"],
            timeout=TIMEOUT,
        )
        _assert_error(response, 403)
        still_exists = requests.get(
            f"{API}/invoices/{rbac_context['invoice']['id']}",
            headers=rbac_context["doctor"]["headers"],
            timeout=TIMEOUT,
        )
        assert still_exists.status_code == 200


class TestSubUserClientPrivacy:
    """Sub-users can read client demographics but must not receive doctor prescriptions/private notes."""

    @pytest.mark.parametrize("role", ["assistant", "front_desk", "legacy"])
    def test_client_detail_does_not_expose_prescriptions(self, rbac_context, role):
        response = requests.post(
            f"{API}/prescriptions",
            headers=rbac_context["doctor"]["headers"],
            json={
                "appointment_id": rbac_context["appointment"]["id"],
                "client_name": rbac_context["appointment_payload"]["client_name"],
                "medications": [],
                "instructions": "TEST private prescription",
                "private_doctor_notes": "TEST highly sensitive doctor-only note",
            },
            timeout=TIMEOUT,
        )
        assert response.status_code == 200, response.text
        prescription_id = response.json()["id"]
        try:
            client = rbac_context["db"].clients.find_one({
                "professional_id": rbac_context["doctor"]["user"]["id"],
                "phone": rbac_context["appointment_payload"]["client_phone"],
            })
            assert client and client.get("id")
            details = requests.get(
                f"{API}/clients/{client['id']}",
                headers=rbac_context[role]["headers"],
                timeout=TIMEOUT,
            )
            assert details.status_code == 200, details.text
            body = details.json()
            assert not body.get("prescriptions"), (
                f"{role} received doctor prescriptions/private notes through client detail"
            )
        finally:
            rbac_context["db"].prescriptions.delete_one({"id": prescription_id})
            rbac_context["db"].medication_reminders.delete_many({"prescription_id": prescription_id})


    def test_doctor_client_detail_includes_prescriptions(self, rbac_context):
        response = requests.post(
            f"{API}/prescriptions",
            headers=rbac_context["doctor"]["headers"],
            json={
                "appointment_id": rbac_context["appointment"]["id"],
                "client_name": rbac_context["appointment_payload"]["client_name"],
                "medications": [],
                "instructions": "TEST doctor-visible prescription",
                "private_doctor_notes": "TEST doctor-only note",
            },
            timeout=TIMEOUT,
        )
        assert response.status_code == 200, response.text
        prescription_id = response.json()["id"]
        try:
            client = rbac_context["db"].clients.find_one({
                "professional_id": rbac_context["doctor"]["user"]["id"],
                "phone": rbac_context["appointment_payload"]["client_phone"],
            })
            details = requests.get(
                f"{API}/clients/{client['id']}",
                headers=rbac_context["doctor"]["headers"],
                timeout=TIMEOUT,
            )
            assert details.status_code == 200, details.text
            prescription = next(
                item for item in details.json()["prescriptions"] if item["id"] == prescription_id
            )
            assert prescription["private_doctor_notes"] == "TEST doctor-only note"
        finally:
            rbac_context["db"].prescriptions.delete_one({"id": prescription_id})
            rbac_context["db"].medication_reminders.delete_many({"prescription_id": prescription_id})


class TestLegacyReceptionist:
    """Legacy receptionist accounts retain parent-scoped appointment/client access and restrictions."""

    def test_login_role_and_parent_scoped_reads(self, rbac_context):
        assert rbac_context["legacy"]["user"]["role"] == "receptionist"
        headers = rbac_context["legacy"]["headers"]
        appointments = requests.get(f"{API}/appointments", headers=headers, timeout=TIMEOUT)
        clients = requests.get(f"{API}/clients", headers=headers, timeout=TIMEOUT)
        assert appointments.status_code == 200 and clients.status_code == 200
        assert rbac_context["appointment"]["id"] in [item["id"] for item in appointments.json()]
        assert rbac_context["appointment_payload"]["client_phone"] in [item["phone"] for item in clients.json()]

    def test_sensitive_routes_still_blocked(self, rbac_context):
        headers = rbac_context["legacy"]["headers"]
        hexa = requests.post(f"{API}/hexa/command", headers=headers, json={"text": "show today"}, timeout=TIMEOUT)
        prescription = requests.post(
            f"{API}/prescriptions/drug-interactions",
            headers=headers,
            json={"medications": [{"medicine_name": "Aspirin"}]},
            timeout=TIMEOUT,
        )
        _assert_error(hexa, 403)
        _assert_error(prescription, 403)

    @pytest.mark.parametrize(
        "method,path,payload",
        [
            ("post", "/consultation-notes", {
                "appointment_id": "fake-id",
                "client_name": "TEST legacy blocked",
                "summary": "forbidden",
                "send_to_client": False,
            }),
            ("get", "/consultation-notes", None),
            ("get", "/consultation-notes/by-appointment/fake-id", None),
            ("put", "/consultation-notes/fake-id", {"summary": "forbidden"}),
        ],
    )
    def test_consultation_notes_all_endpoints_blocked(self, rbac_context, method, path, payload):
        response = requests.request(
            method,
            f"{API}{path}",
            headers=rbac_context["legacy"]["headers"],
            json=payload,
            timeout=TIMEOUT,
        )
        _assert_error(response, 403)


class TestAdminLicenses:
    """Admin login and license APIs require admin and return typed data."""

    def test_admin_login_response(self):
        credentials = _credentials()["admin"]
        response = requests.post(f"{API}/admin/login", json=credentials, timeout=TIMEOUT)
        assert response.status_code == 200, response.text
        body = response.json()
        assert isinstance(body.get("token"), str) and body["token"]
        assert body.get("user", {}).get("email") == credentials["email"]
        assert body["user"].get("role") == "admin"

    def test_admin_list_and_summary(self, rbac_context):
        headers = rbac_context["admin"]["headers"]
        listing = requests.get(f"{API}/admin/licenses", headers=headers, timeout=TIMEOUT)
        summary = requests.get(f"{API}/admin/licenses/summary", headers=headers, timeout=TIMEOUT)
        assert listing.status_code == 200 and isinstance(listing.json(), list)
        assert summary.status_code == 200
        body = summary.json()
        assert isinstance(body.get("counts"), dict)
        assert set(["trial", "active", "suspended", "cancelled", "expired"]).issubset(body["counts"])
        assert isinstance(body.get("total_users"), int)
        assert isinstance(body.get("total_subscriptions"), int)
        assert isinstance(body.get("mrr"), (int, float))

    @pytest.mark.parametrize("path", ["/admin/licenses", "/admin/licenses/summary"])
    def test_non_admin_forbidden(self, rbac_context, path):
        response = requests.get(f"{API}{path}", headers=rbac_context["doctor"]["headers"], timeout=TIMEOUT)
        _assert_error(response, 403)


class TestDoctorRegression:
    """Doctor-only regression smoke for Hexa, reminders, patient portal, invoices, and transcription."""

    @pytest.mark.parametrize(
        "path,expected_type",
        [
            ("/medication-reminders", list),
            ("/patient-portal/links", list),
            ("/invoices", list),
        ],
    )
    def test_doctor_get_regressions(self, rbac_context, path, expected_type):
        response = requests.get(f"{API}{path}", headers=rbac_context["doctor"]["headers"], timeout=TIMEOUT)
        assert response.status_code == 200, response.text
        assert isinstance(response.json(), expected_type)

    def test_doctor_account_has_doctor_role(self, rbac_context):
        assert rbac_context["doctor"]["user"].get("role") == "doctor"
        assert rbac_context["doctor"]["user"].get("profession") == "doctor"
        response = requests.get(
            f"{API}/auth/me",
            headers=rbac_context["doctor"]["headers"],
            timeout=TIMEOUT,
        )
        assert response.status_code == 200, response.text
        assert response.json()["email"] == rbac_context["doctor"]["user"]["email"]
        assert response.json()["role"] == "doctor"
        assert response.json()["profession"] == "doctor"

    def test_doctor_consultation_note_create(self, rbac_context):
        response = requests.post(
            f"{API}/consultation-notes",
            headers=rbac_context["doctor"]["headers"],
            json={
                "appointment_id": rbac_context["appointment"]["id"],
                "client_name": f"TEST_RBAC_Doctor_Note_{rbac_context['stamp']}",
                "summary": "TEST doctor note allowed",
                "recommendations": "Continue care",
                "send_to_client": False,
            },
            timeout=TIMEOUT,
        )
        assert response.status_code == 200, response.text
        body = response.json()
        assert isinstance(body["id"], str) and body["id"]
        assert body["professional_id"] == rbac_context["doctor"]["user"]["id"]
        assert body["summary"] == "TEST doctor note allowed"

    def test_doctor_hexa_command(self, rbac_context):
        response = requests.post(
            f"{API}/hexa/command",
            headers=rbac_context["doctor"]["headers"],
            json={"text": "show today's appointments"},
            timeout=60,
        )
        assert response.status_code == 200, response.text
        body = response.json()
        assert isinstance(body.get("action"), dict)
        assert isinstance(body.get("executed"), bool)

    def test_doctor_drug_interactions(self, rbac_context):
        response = requests.post(
            f"{API}/prescriptions/drug-interactions",
            headers=rbac_context["doctor"]["headers"],
            json={"medications": []},
            timeout=TIMEOUT,
        )
        assert response.status_code == 200, response.text
        assert response.json() == {"alerts": [], "summary": "No medications to analyze."}

    def test_doctor_prescription_transcribe(self, rbac_context):
        audio = io.BytesIO()
        with wave.open(audio, "wb") as wav_file:
            wav_file.setnchannels(1)
            wav_file.setsampwidth(2)
            wav_file.setframerate(8000)
            wav_file.writeframes(b"\x00\x00" * 8000)
        audio.seek(0)
        response = requests.post(
            f"{API}/prescriptions/transcribe",
            headers=rbac_context["doctor"]["headers"],
            files={"audio": ("test_rbac_silence.wav", audio.getvalue(), "audio/wav")},
            data={"language": "en"},
            timeout=60,
        )
        assert response.status_code == 200, response.text
        assert isinstance(response.json().get("text"), str)
