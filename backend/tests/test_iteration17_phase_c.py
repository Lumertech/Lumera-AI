"""Phase C backend tests: pre-intake WhatsApp, review loop, public UPI links, and regressions."""
from __future__ import annotations

import base64
import json
import os
import re
import sys
import time
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values
from pymongo import MongoClient


if "/app/backend" not in sys.path:
    sys.path.insert(0, "/app/backend")

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
TIMEOUT = 35


def _credentials(section_name: str) -> dict[str, str]:
    """Load supplied credentials from the shared credential file."""
    path = Path("/app/memory/test_credentials.md")
    if not path.exists():
        pytest.skip("Missing /app/memory/test_credentials.md")
    content = path.read_text(encoding="utf-8")
    section = re.search(
        rf"## {re.escape(section_name)}.*?(?=\n##|\Z)", content, re.I | re.S
    )
    if not section:
        pytest.skip(f"Missing credentials section: {section_name}")
    email = re.search(r"(?im)^\s*-\s*Email:\s*(\S+)", section.group(0))
    password = re.search(r"(?im)^\s*-\s*Password:\s*(\S+)", section.group(0))
    if not email or not password:
        pytest.skip(f"Incomplete credentials section: {section_name}")
    return {"email": email.group(1), "password": password.group(1)}


def _headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _assert_login(response: requests.Response, expected_email: str) -> dict:
    assert response.status_code == 200, response.text
    body = response.json()
    assert isinstance(body.get("token"), str) and body["token"]
    assert body.get("user", {}).get("email") == expected_email
    assert "hashed_password" not in body["user"] and "_id" not in body["user"]
    return body


def _assert_error(response: requests.Response, status: int, term: str) -> None:
    assert response.status_code == status, response.text
    detail = response.json().get("detail")
    if isinstance(detail, list):
        detail = json.dumps(detail)
    assert isinstance(detail, str) and term.lower() in detail.lower(), response.text


def _create_invoice(context: dict, *, total: float, status: str, label: str) -> dict:
    response = requests.post(
        f"{API}/invoices",
        headers=context["fresh_headers"],
        json={
            "client_name": f"TEST {label}",
            "client_phone": context["phone"],
            "items": [{"description": label, "qty": 1, "rate": total}],
            "payment_status": status,
            "amount_paid": total if status == "paid" else 0,
        },
        timeout=TIMEOUT,
    )
    assert response.status_code == 200, response.text
    invoice = response.json()
    context["invoice_ids"].append(invoice["id"])
    assert invoice["total"] == total
    assert invoice["payment_status"] == status
    return invoice


@pytest.fixture(scope="module")
def phase_c_context():
    """Authenticate supplied accounts, register an isolated doctor, and clean test rows."""
    mongo_url = BACKEND_ENV.get("MONGO_URL")
    db_name = BACKEND_ENV.get("DB_NAME")
    assert mongo_url and db_name, "Mongo test setup variables are missing"
    mongo_client = MongoClient(mongo_url)
    db = mongo_client[db_name]

    sarah_credentials = _credentials("Doctor / Test Professional")
    reviewer_credentials = _credentials("Meta App Review Reviewer")
    supplied_emails = [sarah_credentials["email"], reviewer_credentials["email"]]
    login_ips = ["198.51.100.170", "198.51.100.171"]
    db.login_attempts.delete_many({"email": {"$in": supplied_emails}})
    db.login_ip_hits.delete_many({"ip": {"$in": login_ips}})

    sarah = _assert_login(
        requests.post(
            f"{API}/auth/login",
            headers={"X-Forwarded-For": login_ips[0]},
            json=sarah_credentials,
            timeout=TIMEOUT,
        ),
        sarah_credentials["email"],
    )
    reviewer = _assert_login(
        requests.post(
            f"{API}/auth/login",
            headers={"X-Forwarded-For": login_ips[1]},
            json=reviewer_credentials,
            timeout=TIMEOUT,
        ),
        reviewer_credentials["email"],
    )

    stamp = f"{int(time.time())}_{uuid.uuid4().hex[:8]}"
    fresh_credentials = {
        "email": f"test_phase_c_{stamp}@test.com",
        "password": "PhaseCTest@12345",
    }
    registration = requests.post(
        f"{API}/auth/register",
        json={
            "name": f"TEST Phase C Doctor {stamp}",
            "email": fresh_credentials["email"],
            "password": fresh_credentials["password"],
            "phone_number": f"+919{uuid.uuid4().int % 1_000_000_000:09d}",
            "profession": "doctor",
        },
        timeout=TIMEOUT,
    )
    assert registration.status_code == 200, registration.text
    fresh = registration.json()
    assert fresh["user"]["email"] == fresh_credentials["email"]
    assert fresh["user"]["profession"] == "doctor"

    context = {
        "db": db,
        "stamp": stamp,
        "phone": f"+917{uuid.uuid4().int % 1_000_000_000:09d}",
        "fresh": fresh,
        "fresh_headers": _headers(fresh["token"]),
        "sarah": sarah,
        "sarah_headers": _headers(sarah["token"]),
        "reviewer": reviewer,
        "reviewer_headers": _headers(reviewer["token"]),
        "supplied_credentials": [sarah_credentials, reviewer_credentials],
        "fresh_credentials": fresh_credentials,
        "login_ips": login_ips,
        "appointment_ids": [],
        "feedback_ids": [],
        "intent_ids": [],
        "invoice_ids": [],
    }
    yield context

    owner_id = fresh["user"]["id"]
    db.feedback_triggers.delete_many(
        {"$or": [{"id": {"$in": context["feedback_ids"]}}, {"doctor_id": owner_id}]}
    )
    db.pay_intents.delete_many(
        {"$or": [{"id": {"$in": context["intent_ids"]}}, {"owner_id": owner_id}]}
    )
    db.review_settings.delete_many({"owner_id": owner_id})
    db.payment_settings.delete_many({"owner_id": owner_id})
    db.appointments.delete_many({"id": {"$in": context["appointment_ids"]}})
    db.clients.delete_many({"professional_id": owner_id})
    db.invoices.delete_many({"id": {"$in": context["invoice_ids"]}})
    db.counters.delete_many({"id": {"$regex": f"^invoice:{re.escape(owner_id)}:"}})
    db.users.delete_one({"id": owner_id})
    db.login_attempts.delete_many(
        {"email": {"$in": supplied_emails + [fresh_credentials["email"]]}}
    )
    db.login_ip_hits.delete_many({"ip": {"$in": login_ips}})
    mongo_client.close()


# Appointment creation dispatch audit and pre-consultation intake capture.
class TestPreConsultationIntake:
    def test_01_create_appointment_records_pre_intake_dispatch(self, phase_c_context):
        context = phase_c_context
        payload = {
            "client_name": "TEST Phase C Patient",
            "client_phone": context["phone"],
            "client_email": f"patient_{context['stamp']}@test.com",
            "appointment_date": (datetime.now(timezone.utc) + timedelta(days=3)).strftime("%Y-%m-%d"),
            "start_time": "10:00",
            "end_time": "10:30",
            "consultation_mode": "in-person",
            "notes": "TEST pre-intake dispatch",
        }
        response = requests.post(
            f"{API}/appointments",
            headers=context["fresh_headers"],
            json=payload,
            timeout=TIMEOUT,
        )
        assert response.status_code == 200, response.text
        appointment = response.json()
        context["appointment_ids"].append(appointment["id"])
        context["appointment_id"] = appointment["id"]
        for field, expected in payload.items():
            assert appointment[field] == expected
        assert appointment["professional_id"] == context["fresh"]["user"]["id"]
        assert appointment["status"] == "scheduled"
        assert "_id" not in appointment
        datetime.fromisoformat(appointment["created_at"])

        persisted = context["db"].appointments.find_one(
            {"id": appointment["id"]}, {"_id": 0}
        )
        assert persisted is not None
        assert persisted["pre_intake_status"] == "sent"
        dispatched_at = datetime.fromisoformat(persisted["pre_intake_dispatched_at"])
        assert dispatched_at.tzinfo is not None
        assert persisted["client_phone"] == context["phone"]

        fetched = requests.get(
            f"{API}/appointments/{appointment['id']}",
            headers=context["fresh_headers"],
            timeout=TIMEOUT,
        )
        assert fetched.status_code == 200, fetched.text
        assert fetched.json()["pre_intake_status"] == "sent"
        assert fetched.json()["pre_intake_dispatched_at"] == persisted["pre_intake_dispatched_at"]

    def test_02_save_pre_intake_persists_capture_metadata(self, phase_c_context):
        context = phase_c_context
        payload = {
            "symptoms": "headache",
            "duration": "3 days",
            "medications_allergies": "penicillin",
        }
        response = requests.put(
            f"{API}/appointments/{context['appointment_id']}/pre-intake",
            headers=context["fresh_headers"],
            json=payload,
            timeout=TIMEOUT,
        )
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["message"] == "Pre-intake saved"
        assert {key: body["pre_intake"][key] for key in payload} == payload
        assert body["pre_intake"]["captured_by"] == context["fresh"]["user"]["name"]
        datetime.fromisoformat(body["pre_intake"]["captured_at"])

        fetched = requests.get(
            f"{API}/appointments/{context['appointment_id']}",
            headers=context["fresh_headers"],
            timeout=TIMEOUT,
        )
        assert fetched.status_code == 200, fetched.text
        saved = fetched.json()
        assert saved["pre_intake"] == body["pre_intake"]
        assert saved["pre_intake_status"] == "captured"

    def test_03_wrong_owner_cannot_capture_pre_intake(self, phase_c_context):
        response = requests.put(
            f"{API}/appointments/{phase_c_context['appointment_id']}/pre-intake",
            headers=phase_c_context["reviewer_headers"],
            json={"symptoms": "wrong owner", "duration": "1 day", "medications_allergies": "none"},
            timeout=TIMEOUT,
        )
        _assert_error(response, 404, "Appointment not found")

    def test_04_non_string_pre_intake_is_validation_error(self, phase_c_context):
        response = requests.put(
            f"{API}/appointments/{phase_c_context['appointment_id']}/pre-intake",
            headers=phase_c_context["fresh_headers"],
            json={"symptoms": 42, "duration": "3 days", "medications_allergies": "none"},
            timeout=TIMEOUT,
        )
        assert response.status_code in (400, 422), response.text


# Google Review Loop settings defaults, persistence, validation, and message composition.
class TestGoogleReviewLoop:
    def test_01_initial_review_settings_defaults(self, phase_c_context):
        context = phase_c_context
        context["db"].review_settings.delete_many(
            {"owner_id": context["fresh"]["user"]["id"]}
        )
        response = requests.get(
            f"{API}/settings/reviews",
            headers=context["fresh_headers"],
            timeout=TIMEOUT,
        )
        assert response.status_code == 200, response.text
        assert response.json() == {
            "google_review_url": "",
            "enabled": True,
            "delay_hours": 2,
        }

    def test_02_save_and_fetch_review_settings(self, phase_c_context):
        context = phase_c_context
        payload = {
            "google_review_url": "https://g.page/r/abc/review",
            "enabled": True,
            "delay_hours": 2,
        }
        saved = requests.put(
            f"{API}/settings/reviews",
            headers=context["fresh_headers"],
            json=payload,
            timeout=TIMEOUT,
        )
        assert saved.status_code == 200, saved.text
        assert saved.json() == {"message": "Review loop settings saved"}

        fetched = requests.get(
            f"{API}/settings/reviews",
            headers=context["fresh_headers"],
            timeout=TIMEOUT,
        )
        assert fetched.status_code == 200, fetched.text
        assert fetched.json() == payload
        persisted = context["db"].review_settings.find_one(
            {"owner_id": context["fresh"]["user"]["id"]}, {"_id": 0}
        )
        assert persisted is not None
        assert {key: persisted[key] for key in payload} == payload
        datetime.fromisoformat(persisted["updated_at"])

    def test_03_review_settings_reject_invalid_url_and_delay(self, phase_c_context):
        context = phase_c_context
        invalid_url = requests.put(
            f"{API}/settings/reviews",
            headers=context["fresh_headers"],
            json={"google_review_url": "notaurl", "enabled": True, "delay_hours": 2},
            timeout=TIMEOUT,
        )
        _assert_error(invalid_url, 400, "must start with http:// or https://")

        invalid_delay = requests.put(
            f"{API}/settings/reviews",
            headers=context["fresh_headers"],
            json={
                "google_review_url": "https://g.page/r/abc/review",
                "enabled": True,
                "delay_hours": 999,
            },
            timeout=TIMEOUT,
        )
        _assert_error(invalid_delay, 400, "between 0 and 168 hours")

        fetched = requests.get(
            f"{API}/settings/reviews",
            headers=context["fresh_headers"],
            timeout=TIMEOUT,
        )
        assert fetched.status_code == 200, fetched.text
        assert fetched.json()["google_review_url"] == "https://g.page/r/abc/review"
        assert fetched.json()["delay_hours"] == 2

    @pytest.mark.asyncio
    async def test_04_feedback_prompt_contains_configured_review_link(
        self, phase_c_context, monkeypatch
    ):
        context = phase_c_context
        scheduled = requests.post(
            f"{API}/feedback/schedule",
            headers=context["fresh_headers"],
            json={
                "appointment_id": context["appointment_id"],
                "client_phone": context["phone"],
                "client_name": "TEST Phase C Patient",
                "delay_hours": 0,
            },
            timeout=TIMEOUT,
        )
        assert scheduled.status_code == 200, scheduled.text
        trigger = scheduled.json()["trigger"]
        context["feedback_ids"].append(trigger["id"])
        assert trigger["status"] == "pending"

        import routes.feedback as feedback_route

        sent_messages: list[tuple[str, str]] = []

        async def fake_send(to_number: str, message: str):
            sent_messages.append((to_number, message))
            return {"sid": "TEST_MESSAGE"}

        monkeypatch.setattr(feedback_route, "send_whatsapp_message", fake_send)
        result = await feedback_route._send_feedback_message(trigger)
        assert result is True
        assert len(sent_messages) == 1
        assert sent_messages[0][0] == context["phone"]
        assert "https://g.page/r/abc/review" in sent_messages[0][1]
        assert "Google Review" in sent_messages[0][1]
        persisted = context["db"].feedback_triggers.find_one(
            {"id": trigger["id"]}, {"_id": 0}
        )
        assert persisted["status"] == "sent"
        assert persisted["review_link_included"] is True
        datetime.fromisoformat(persisted["sent_at"])


# Authenticated UPI intent generation, database persistence, and public retrieval.
class TestPublicUPIPaymentIntent:
    def test_01_post_intent_requires_authentication(self):
        response = requests.post(
            f"{API}/payments/upi/intent",
            json={"amount": 100, "note": "TEST unauthenticated"},
            timeout=TIMEOUT,
        )
        _assert_error(response, 401, "Not authenticated")

    def test_02_create_and_persist_upi_intent(self, phase_c_context):
        context = phase_c_context
        upi_payload = {
            "upi_id": "phasec@okaxis",
            "display_name": "TEST Phase C Clinic",
        }
        configured = requests.put(
            f"{API}/settings/payment/upi",
            headers=context["fresh_headers"],
            json=upi_payload,
            timeout=TIMEOUT,
        )
        assert configured.status_code == 200, configured.text
        assert configured.json()["upi_id"] == upi_payload["upi_id"]

        payload = {
            "amount": 349.75,
            "note": "TEST Phase C consultation",
            "invoice_id": "TEST-INVOICE-PHASE-C",
        }
        response = requests.post(
            f"{API}/payments/upi/intent",
            headers=context["fresh_headers"],
            json=payload,
            timeout=TIMEOUT,
        )
        assert response.status_code == 200, response.text
        body = response.json()
        assert re.fullmatch(r"[0-9a-f]{12}", body["intent_id"])
        context["intent_ids"].append(body["intent_id"])
        context["intent_id"] = body["intent_id"]
        assert "/pay/" in body["payment_page_url"]
        assert body["payment_page_url"].endswith(f"/pay/{body['intent_id']}")
        assert body["payment_page_url"].startswith(BASE_URL)
        assert body["upi_intent"].startswith("upi://pay?")
        assert body["qr_png_data_url"].startswith("data:image/png;base64,")
        png = base64.b64decode(body["qr_png_data_url"].split(",", 1)[1])
        assert png.startswith(b"\x89PNG\r\n\x1a\n")
        assert body["vpa"] == upi_payload["upi_id"]
        assert body["display_name"] == upi_payload["display_name"]

        persisted = context["db"].pay_intents.find_one(
            {"id": body["intent_id"]}, {"_id": 0}
        )
        assert persisted is not None
        assert persisted["owner_id"] == context["fresh"]["user"]["id"]
        assert persisted["amount"] == payload["amount"]
        assert persisted["vpa"] == upi_payload["upi_id"]
        assert persisted["display_name"] == upi_payload["display_name"]
        assert persisted["upi_intent"] == body["upi_intent"]
        assert persisted["invoice_id"] == payload["invoice_id"]
        assert datetime.fromisoformat(persisted["expires_at"]) > datetime.now(timezone.utc)

    def test_03_public_get_intent_without_bearer_header(self, phase_c_context):
        context = phase_c_context
        response = requests.get(
            f"{API}/payments/upi/intent/{context['intent_id']}",
            timeout=TIMEOUT,
        )
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["id"] == context["intent_id"]
        assert body["amount"] == 349.75
        assert body["vpa"] == "phasec@okaxis"
        assert body["display_name"] == "TEST Phase C Clinic"
        assert body["upi_intent"].startswith("upi://pay?")
        assert body["qr_png_data_url"].startswith("data:image/png;base64,")
        assert "owner_id" not in body and "_id" not in body

    def test_04_public_get_nonexistent_is_404(self):
        response = requests.get(
            f"{API}/payments/upi/intent/nonexistent",
            timeout=TIMEOUT,
        )
        _assert_error(response, 404, "Payment link not found or expired")


# Requested login, health, resource, payment settings, and invoice regressions.
class TestPhaseCRegressions:
    def test_01_health_and_supplied_logins(self, phase_c_context):
        response = requests.get(f"{API}/health", timeout=TIMEOUT)
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["status"] == "healthy"
        assert body["components"]["database"] == "healthy"
        datetime.fromisoformat(body["timestamp"])
        assert phase_c_context["sarah"]["user"]["email"] == phase_c_context["supplied_credentials"][0]["email"]
        assert phase_c_context["reviewer"]["user"]["email"] == phase_c_context["supplied_credentials"][1]["email"]

    @pytest.mark.parametrize("resource", ["appointments", "clients"])
    def test_02_authenticated_list_endpoints(self, phase_c_context, resource):
        response = requests.get(
            f"{API}/{resource}",
            headers=phase_c_context["fresh_headers"],
            timeout=TIMEOUT,
        )
        assert response.status_code == 200, response.text
        assert isinstance(response.json(), list)
        assert all("_id" not in row for row in response.json())

    def test_03_payment_settings_get(self, phase_c_context):
        response = requests.get(
            f"{API}/settings/payment",
            headers=phase_c_context["fresh_headers"],
            timeout=TIMEOUT,
        )
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["method"] == "upi"
        assert body["upi"] == {
            "upi_id": "phasec@okaxis",
            "display_name": "TEST Phase C Clinic",
        }
        assert body["configured"]["upi"] is True
        assert "gateway" in body and "configured" in body

    def test_04_paid_receipt_reports_false_without_twilio(self, phase_c_context):
        context = phase_c_context
        assert BACKEND_ENV.get("TWILIO_ACCOUNT_SID") == "your_twilio_account_sid"
        invoice = _create_invoice(context, total=320, status="paid", label="Phase C Receipt")
        response = requests.post(
            f"{API}/invoices/{invoice['id']}/send-receipt",
            headers=context["fresh_headers"],
            timeout=TIMEOUT,
        )
        assert response.status_code == 200, response.text
        assert response.json() == {"invoice_id": invoice["id"], "receipt_sent": False}
        fetched = requests.get(
            f"{API}/invoices/{invoice['id']}",
            headers=context["fresh_headers"],
            timeout=TIMEOUT,
        )
        assert fetched.status_code == 200, fetched.text
        assert fetched.json()["receipt_status"] == "failed"
        assert fetched.json()["receipt_sent_at"] is None

    def test_05_cash_overpayment_is_400_and_not_persisted(self, phase_c_context):
        context = phase_c_context
        invoice = _create_invoice(context, total=100, status="pending", label="Phase C Overpayment")
        response = requests.post(
            f"{API}/invoices/{invoice['id']}/mark-cash-paid",
            headers=context["fresh_headers"],
            json={"amount_paid": 101, "send_whatsapp_receipt": False},
            timeout=TIMEOUT,
        )
        _assert_error(response, 400, "exceeds invoice total")
        fetched = requests.get(
            f"{API}/invoices/{invoice['id']}",
            headers=context["fresh_headers"],
            timeout=TIMEOUT,
        )
        assert fetched.status_code == 200, fetched.text
        assert fetched.json()["payment_status"] == "pending"
        assert fetched.json()["amount_paid"] == 0
