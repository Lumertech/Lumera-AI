"""UX Phase A API tests: last Rx, balances, payment verification, receipts, and regressions."""
from __future__ import annotations

import json
import os
import re
import time
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import quote

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
TIMEOUT = 35


def _credentials(section_name: str) -> dict[str, str]:
    """Load only credentials supplied in the shared credentials file."""
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


def _assert_login(response: requests.Response, email: str) -> dict:
    assert response.status_code == 200, response.text
    body = response.json()
    assert isinstance(body.get("token"), str) and body["token"]
    assert body.get("user", {}).get("email") == email
    assert "hashed_password" not in body["user"] and "_id" not in body["user"]
    return body


def _assert_error(response: requests.Response, status: int, term: str) -> None:
    assert response.status_code == status, response.text
    detail = response.json().get("detail")
    if isinstance(detail, list):
        detail = json.dumps(detail)
    assert isinstance(detail, str) and term.lower() in detail.lower(), response.text


def _create_invoice(context: dict, *, total: float, status: str, amount_paid: float, label: str) -> dict:
    response = requests.post(
        f"{API}/invoices",
        headers=context["fresh_headers"],
        json={
            "client_name": f"TEST {label}",
            "client_phone": context["phone"],
            "items": [{"description": label, "qty": 1, "rate": total}],
            "payment_status": status,
            "amount_paid": amount_paid,
        },
        timeout=TIMEOUT,
    )
    assert response.status_code == 200, response.text
    invoice = response.json()
    context["invoice_ids"].append(invoice["id"])
    assert invoice["total"] == total
    assert invoice["payment_status"] == status
    assert invoice["amount_paid"] == amount_paid

    fetched = requests.get(
        f"{API}/invoices/{invoice['id']}",
        headers=context["fresh_headers"],
        timeout=TIMEOUT,
    )
    assert fetched.status_code == 200, fetched.text
    assert fetched.json()["total"] == total
    assert fetched.json()["payment_status"] == status
    assert fetched.json()["amount_paid"] == amount_paid
    return invoice


@pytest.fixture(scope="module")
def phase_a_context():
    """Authenticate supplied accounts, create an isolated doctor, and clean QA records."""
    mongo_url = BACKEND_ENV.get("MONGO_URL")
    db_name = BACKEND_ENV.get("DB_NAME")
    assert mongo_url and db_name, "Mongo test setup variables are missing"
    mongo_client = MongoClient(mongo_url)
    db = mongo_client[db_name]

    sarah_credentials = _credentials("Doctor / Test Professional")
    reviewer_credentials = _credentials("Meta App Review Reviewer")
    supplied_emails = [sarah_credentials["email"], reviewer_credentials["email"]]
    db.login_attempts.delete_many({"email": {"$in": supplied_emails}})

    login_ips = ["198.51.100.160", "198.51.100.161"]
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
        "email": f"test_phase_a_{stamp}@test.com",
        "password": "PhaseATest@12345",
    }
    registration = requests.post(
        f"{API}/auth/register",
        json={
            "name": f"TEST Phase A Doctor {stamp}",
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
        "login_ips": login_ips,
        "invoice_ids": [],
        "appointment_ids": [],
        "prescription_ids": [],
    }
    yield context

    fresh_id = fresh["user"]["id"]
    db.medication_reminders.delete_many(
        {"prescription_id": {"$in": context["prescription_ids"]}}
    )
    db.feedback_triggers.delete_many(
        {"prescription_id": {"$in": context["prescription_ids"]}}
    )
    db.prescriptions.delete_many({"id": {"$in": context["prescription_ids"]}})
    db.appointments.delete_many({"id": {"$in": context["appointment_ids"]}})
    db.clients.delete_many(
        {"professional_id": fresh_id, "phone": context["phone"]}
    )
    db.invoices.delete_many({"id": {"$in": context["invoice_ids"]}})
    db.payment_settings.delete_many({"owner_id": fresh_id})
    db.counters.delete_many({"id": {"$regex": f"^invoice:{re.escape(fresh_id)}:"}})
    db.users.delete_one({"id": fresh_id})
    db.login_attempts.delete_many(
        {"email": {"$in": supplied_emails + [fresh_credentials["email"]]}}
    )
    db.login_ip_hits.delete_many({"ip": {"$in": login_ips}})
    mongo_client.close()


# Import Last Rx and patient balance aggregation.
class TestPrescriptionUXEndpoints:
    def test_01_last_rx_fresh_then_returns_created_prescription(self, phase_a_context):
        context = phase_a_context
        phone_path = quote(context["phone"], safe="")
        empty = requests.get(
            f"{API}/prescriptions/last-for/{phone_path}",
            headers=context["fresh_headers"],
            timeout=TIMEOUT,
        )
        assert empty.status_code == 200, empty.text
        assert empty.json() == {"found": False}

        appointment = requests.post(
            f"{API}/appointments",
            headers=context["fresh_headers"],
            json={
                "client_name": "TEST Phase A Patient",
                "client_phone": context["phone"],
                "client_email": f"phase_a_{context['stamp']}@test.com",
                "appointment_date": (datetime.now(timezone.utc) + timedelta(days=2)).strftime("%Y-%m-%d"),
                "start_time": "11:00",
                "end_time": "11:30",
                "consultation_mode": "in-person",
                "notes": "TEST Import Last Rx appointment",
            },
            timeout=TIMEOUT,
        )
        assert appointment.status_code == 200, appointment.text
        appointment_body = appointment.json()
        context["appointment_ids"].append(appointment_body["id"])
        assert appointment_body["client_phone"] == context["phone"]

        medications = [
            {
                "medicine_name": "TEST Amoxicillin",
                "dosage": "500 mg",
                "frequency": "Twice daily",
                "duration": "5 days",
                "instructions": "After food",
            }
        ]
        created = requests.post(
            f"{API}/prescriptions",
            headers=context["fresh_headers"],
            json={
                "appointment_id": appointment_body["id"],
                "client_name": "TEST Phase A Patient",
                "medications": medications,
                "instructions": "TEST hydrate and rest",
                "private_doctor_notes": "TEST private note",
                "request_feedback": False,
            },
            timeout=TIMEOUT,
        )
        assert created.status_code == 200, created.text
        prescription = created.json()
        context["prescription_ids"].append(prescription["id"])
        assert prescription["client_phone"] == context["phone"]
        assert prescription["medications"] == medications

        latest = requests.get(
            f"{API}/prescriptions/last-for/{phone_path}",
            headers=context["fresh_headers"],
            timeout=TIMEOUT,
        )
        assert latest.status_code == 200, latest.text
        body = latest.json()
        assert body["found"] is True
        assert body["medications"] == medications
        assert set(body) == {"found", "created_at", "medications", "diagnosis", "notes"}
        assert body["diagnosis"] is None and body["notes"] is None
        datetime.fromisoformat(body["created_at"])

    def test_02_outstanding_balance_fresh_then_sums_pending_and_partial(self, phase_a_context):
        context = phase_a_context
        phone_path = quote(context["phone"], safe="")
        empty = requests.get(
            f"{API}/prescriptions/outstanding-balance/{phone_path}",
            headers=context["fresh_headers"],
            timeout=TIMEOUT,
        )
        assert empty.status_code == 200, empty.text
        assert empty.json() == {
            "client_phone": context["phone"],
            "outstanding": 0.0,
            "unpaid_count": 0,
        }

        _create_invoice(
            context, total=100, status="pending", amount_paid=0, label="Outstanding Unpaid"
        )
        _create_invoice(
            context, total=200, status="partial", amount_paid=50, label="Outstanding Partial"
        )

        result = requests.get(
            f"{API}/prescriptions/outstanding-balance/{phone_path}",
            headers=context["fresh_headers"],
            timeout=TIMEOUT,
        )
        assert result.status_code == 200, result.text
        assert result.json() == {
            "client_phone": context["phone"],
            "outstanding": 250.0,
            "unpaid_count": 2,
        }


# UPI and gateway save/verify behavior plus settings CRUD regression.
class TestPaymentVerification:
    def test_01_verify_upi_and_gateway_without_saved_configuration(self, phase_a_context):
        context = phase_a_context
        context["db"].payment_settings.delete_many(
            {"owner_id": context["fresh"]["user"]["id"]}
        )

        upi = requests.post(
            f"{API}/settings/payment/verify-upi",
            headers=context["fresh_headers"],
            timeout=TIMEOUT,
        )
        _assert_error(upi, 400, "UPI ID not saved yet")

        gateway = requests.post(
            f"{API}/settings/payment/verify-gateway",
            headers=context["fresh_headers"],
            timeout=TIMEOUT,
        )
        _assert_error(gateway, 400, "No gateway configured")

        fetched = requests.get(
            f"{API}/settings/payment",
            headers=context["fresh_headers"],
            timeout=TIMEOUT,
        )
        assert fetched.status_code == 200, fetched.text
        assert fetched.json() == {
            "method": "upi",
            "upi": {},
            "gateway": {},
            "configured": {"upi": False, "gateway": False},
        }

    def test_02_valid_known_upi_invalid_save_and_unknown_handle(self, phase_a_context):
        context = phase_a_context
        invalid = requests.put(
            f"{API}/settings/payment/upi",
            headers=context["fresh_headers"],
            json={"upi_id": "notavpa", "display_name": "TEST Clinic"},
            timeout=TIMEOUT,
        )
        _assert_error(invalid, 400, "valid UPI ID")

        known_payload = {"upi_id": "drsarah@okaxis", "display_name": "TEST Phase A Clinic"}
        saved = requests.put(
            f"{API}/settings/payment/upi",
            headers=context["fresh_headers"],
            json=known_payload,
            timeout=TIMEOUT,
        )
        assert saved.status_code == 200, saved.text
        assert saved.json()["upi_id"] == known_payload["upi_id"]
        known = requests.post(
            f"{API}/settings/payment/verify-upi",
            headers=context["fresh_headers"],
            timeout=TIMEOUT,
        )
        assert known.status_code == 200, known.text
        assert known.json()["valid"] is True
        assert known.json()["handle_recognized"] is True
        assert known.json()["vpa"] == known_payload["upi_id"]

        unknown_payload = {
            "upi_id": "drsarah@unknownpsp",
            "display_name": "TEST Phase A Clinic",
        }
        saved_unknown = requests.put(
            f"{API}/settings/payment/upi",
            headers=context["fresh_headers"],
            json=unknown_payload,
            timeout=TIMEOUT,
        )
        assert saved_unknown.status_code == 200, saved_unknown.text
        unknown = requests.post(
            f"{API}/settings/payment/verify-upi",
            headers=context["fresh_headers"],
            timeout=TIMEOUT,
        )
        assert unknown.status_code == 200, unknown.text
        assert unknown.json()["valid"] is True
        assert unknown.json()["handle_recognized"] is False
        assert unknown.json()["vpa"] == unknown_payload["upi_id"]

        fetched = requests.get(
            f"{API}/settings/payment",
            headers=context["fresh_headers"],
            timeout=TIMEOUT,
        )
        assert fetched.status_code == 200, fetched.text
        assert fetched.json()["upi"] == unknown_payload
        assert fetched.json()["configured"]["upi"] is True

    def test_03_bogus_razorpay_verification_is_graceful(self, phase_a_context):
        context = phase_a_context
        saved = requests.put(
            f"{API}/settings/payment/gateway",
            headers=context["fresh_headers"],
            json={
                "provider": "razorpay",
                "credentials": {
                    "key_id": f"rzp_test_TEST_{context['stamp']}",
                    "key_secret": f"TEST_BOGUS_SECRET_{context['stamp']}",
                },
            },
            timeout=TIMEOUT,
        )
        assert saved.status_code == 200, saved.text
        assert saved.json()["provider"] == "razorpay"

        verified = requests.post(
            f"{API}/settings/payment/verify-gateway",
            headers=context["fresh_headers"],
            timeout=TIMEOUT,
        )
        assert verified.status_code == 200, verified.text
        body = verified.json()
        assert body["valid"] is False
        assert body["provider"] == "razorpay"
        reason = body.get("reason", "")
        assert "Razorpay rejected the credentials" in reason or reason.startswith("HTTP "), body

    def test_04_non_razorpay_format_check_and_gateway_delete(self, phase_a_context):
        context = phase_a_context
        saved = requests.put(
            f"{API}/settings/payment/gateway",
            headers=context["fresh_headers"],
            json={
                "provider": "phonepe",
                "credentials": {
                    "merchant_id": "TEST_MERCHANT",
                    "salt_key": "TEST_FAKE_SALT_KEY",
                    "salt_index": "1",
                },
            },
            timeout=TIMEOUT,
        )
        assert saved.status_code == 200, saved.text

        verified = requests.post(
            f"{API}/settings/payment/verify-gateway",
            headers=context["fresh_headers"],
            timeout=TIMEOUT,
        )
        assert verified.status_code == 200, verified.text
        body = verified.json()
        assert body["valid"] is True
        assert body["provider"] == "phonepe"
        assert "Format check passed" in body["note"]

        fetched = requests.get(
            f"{API}/settings/payment",
            headers=context["fresh_headers"],
            timeout=TIMEOUT,
        )
        assert fetched.status_code == 200, fetched.text
        assert fetched.json()["gateway"]["provider"] == "phonepe"
        assert fetched.json()["gateway"]["credentials"]["salt_key"].endswith("_KEY")
        assert "TEST_FAKE_SALT_KEY" not in fetched.text
        assert fetched.json()["configured"]["gateway"] is True

        deleted = requests.delete(
            f"{API}/settings/payment/gateway",
            headers=context["fresh_headers"],
            timeout=TIMEOUT,
        )
        assert deleted.status_code == 200, deleted.text
        after = requests.get(
            f"{API}/settings/payment",
            headers=context["fresh_headers"],
            timeout=TIMEOUT,
        )
        assert after.status_code == 200, after.text
        assert after.json()["gateway"] == {}
        assert after.json()["configured"]["gateway"] is False

    def test_05_payment_method_update_persists(self, phase_a_context):
        context = phase_a_context
        for method in ("cash", "upi"):
            updated = requests.put(
                f"{API}/settings/payment/method",
                headers=context["fresh_headers"],
                json={"method": method},
                timeout=TIMEOUT,
            )
            assert updated.status_code == 200, updated.text
            assert updated.json() == {"method": method}
            fetched = requests.get(
                f"{API}/settings/payment",
                headers=context["fresh_headers"],
                timeout=TIMEOUT,
            )
            assert fetched.status_code == 200, fetched.text
            assert fetched.json()["method"] == method



# Receipt auto-dispatch, ownership, unpaid guard, and overpayment regression.
class TestInvoiceReceiptAndCashProtection:
    def test_01_paid_invoice_receipt_noops_without_whatsapp_provider(self, phase_a_context):
        context = phase_a_context
        invoice = _create_invoice(
            context, total=320, status="paid", amount_paid=320, label="Paid Receipt"
        )
        response = requests.post(
            f"{API}/invoices/{invoice['id']}/send-receipt",
            headers=context["fresh_headers"],
            timeout=TIMEOUT,
        )
        assert response.status_code == 200, response.text
        response_body = response.json()

        fetched = requests.get(
            f"{API}/invoices/{invoice['id']}",
            headers=context["fresh_headers"],
            timeout=TIMEOUT,
        )
        assert fetched.status_code == 200, fetched.text
        persisted = fetched.json()
        assert (
            response_body.get("receipt_sent"),
            persisted.get("receipt_status"),
            persisted.get("receipt_sent_at"),
        ) == (False, "failed", None), {
            "response": response_body,
            "persisted_receipt_status": persisted.get("receipt_status"),
            "persisted_receipt_sent_at": persisted.get("receipt_sent_at"),
        }

    def test_02_unpaid_invoice_receipt_is_400(self, phase_a_context):
        context = phase_a_context
        invoice = _create_invoice(
            context, total=150, status="pending", amount_paid=0, label="Unpaid Receipt"
        )
        response = requests.post(
            f"{API}/invoices/{invoice['id']}/send-receipt",
            headers=context["fresh_headers"],
            timeout=TIMEOUT,
        )
        _assert_error(response, 400, "Invoice is not marked paid yet")

    def test_03_other_owner_receipt_is_404(self, phase_a_context):
        context = phase_a_context
        invoice = _create_invoice(
            context, total=180, status="paid", amount_paid=180, label="Foreign Receipt"
        )
        response = requests.post(
            f"{API}/invoices/{invoice['id']}/send-receipt",
            headers=context["sarah_headers"],
            timeout=TIMEOUT,
        )
        _assert_error(response, 404, "Invoice not found")

    def test_04_cash_overpayment_is_rejected_and_not_persisted(self, phase_a_context):
        context = phase_a_context
        invoice = _create_invoice(
            context, total=100, status="pending", amount_paid=0, label="Cash Overpayment"
        )
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


# Requested public endpoint regressions.
class TestPhaseARegressions:
    def test_01_health_response(self):
        response = requests.get(f"{API}/health", timeout=TIMEOUT)
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["status"] == "healthy"
        assert body["components"]["database"] == "healthy"
        assert isinstance(body["timestamp"], str)
        datetime.fromisoformat(body["timestamp"])

    def test_02_supplied_doctor_and_reviewer_logins(self, phase_a_context):
        context = phase_a_context
        assert context["sarah"]["user"]["email"] == context["supplied_credentials"][0]["email"]
        assert context["reviewer"]["user"]["email"] == context["supplied_credentials"][1]["email"]
        assert context["sarah"]["user"]["profession"] == "doctor"
        assert context["reviewer"]["user"]["profession"] == "doctor"

    @pytest.mark.parametrize("resource", ["appointments", "clients"])
    def test_03_authenticated_list_endpoints(self, phase_a_context, resource):
        response = requests.get(
            f"{API}/{resource}",
            headers=phase_a_context["fresh_headers"],
            timeout=TIMEOUT,
        )
        assert response.status_code == 200, response.text
        assert isinstance(response.json(), list)
        assert all("_id" not in row for row in response.json())

    def test_04_safety_timeline(self, phase_a_context):
        context = phase_a_context
        phone = f"+916{uuid.uuid4().int % 1_000_000_000:09d}"
        response = requests.get(
            f"{API}/safety/timeline/{quote(phone, safe='')}",
            headers=context["fresh_headers"],
            timeout=TIMEOUT,
        )
        assert response.status_code == 200, response.text
        assert response.json() == {"client_phone": phone, "count": 0, "events": []}
