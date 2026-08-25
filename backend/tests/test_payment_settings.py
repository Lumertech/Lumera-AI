"""Payment/gateway settings, UPI intent, cash-payment, RBAC, and regression API tests."""
from __future__ import annotations

import json
import os
import re
import time
import uuid
from datetime import datetime
from pathlib import Path
from urllib.parse import parse_qs, urlparse

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

EXPECTED_PROVIDERS = {
    "razorpay": ["key_id", "key_secret"],
    "phonepe": ["merchant_id", "salt_key", "salt_index"],
    "paytm": ["merchant_id", "merchant_key", "website"],
    "cashfree": ["app_id", "secret_key"],
    "payu": ["merchant_key", "merchant_salt"],
    "stripe": ["publishable_key", "secret_key"],
    "airpay": ["merchant_id", "api_key", "encryption_key"],
}


def _credentials(section_name: str) -> dict[str, str]:
    """Read supplied credentials without embedding account passwords in this suite."""
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


@pytest.fixture(scope="module")
def payment_context():
    """Authenticate Sarah, register an isolated fresh doctor, and clean all QA records."""
    mongo_url = BACKEND_ENV.get("MONGO_URL")
    db_name = BACKEND_ENV.get("DB_NAME")
    assert mongo_url and db_name, "Mongo test setup variables are missing"
    mongo_client = MongoClient(mongo_url)
    db = mongo_client[db_name]

    # Prevent prior regression traffic from blocking the requested valid login.
    sarah_credentials = _credentials("Doctor / Test Professional")
    db.login_attempts.delete_many({"email": sarah_credentials["email"]})
    db.login_ip_hits.delete_many({})
    sarah_login = _assert_login(
        requests.post(f"{API}/auth/login", json=sarah_credentials, timeout=TIMEOUT),
        sarah_credentials["email"],
    )
    db.login_ip_hits.delete_many({})

    stamp = f"{int(time.time())}_{uuid.uuid4().hex[:8]}"
    fresh_credentials = {
        "email": f"test_payment_{stamp}@test.com",
        "password": "PaymentTest@12345",
    }
    registration = requests.post(
        f"{API}/auth/register",
        json={
            "name": f"TEST Payment Doctor {stamp}",
            "email": fresh_credentials["email"],
            "password": fresh_credentials["password"],
            "phone_number": f"+919{uuid.uuid4().int % 1_000_000_000:09d}",
            "profession": "doctor",
        },
        timeout=TIMEOUT,
    )
    assert registration.status_code == 200, registration.text
    fresh_login = registration.json()
    assert fresh_login["user"]["email"] == fresh_credentials["email"]
    assert isinstance(fresh_login.get("token"), str) and fresh_login["token"]

    context = {
        "db": db,
        "stamp": stamp,
        "sarah_credentials": sarah_credentials,
        "sarah": sarah_login,
        "sarah_headers": _headers(sarah_login["token"]),
        "fresh_credentials": fresh_credentials,
        "fresh": fresh_login,
        "fresh_headers": _headers(fresh_login["token"]),
        "invoice_ids": [],
        "sub_user_ids": [],
        "deletion_ticket_ids": [],
    }
    yield context

    fresh_id = fresh_login["user"]["id"]
    db.payment_settings.delete_many({"owner_id": fresh_id})
    db.meta_whatsapp_configs.delete_many({"owner_id": fresh_id})
    db.invoices.delete_many({"id": {"$in": context["invoice_ids"]}})
    db.users.delete_many({"id": {"$in": context["sub_user_ids"]}})
    db.users.delete_one({"id": fresh_id})
    db.data_deletion_requests.delete_many(
        {"ticket_id": {"$in": context["deletion_ticket_ids"]}}
    )
    db.login_attempts.delete_many(
        {"email": {"$in": [fresh_credentials["email"], sarah_credentials["email"]]}}
    )
    db.login_ip_hits.delete_many({})
    mongo_client.close()


# Payment settings provider schema and authentication behavior.
class TestPaymentProviders:
    def test_requires_bearer_authentication(self):
        response = requests.get(f"{API}/settings/payment/providers", timeout=TIMEOUT)
        _assert_error(response, 401, "authenticated")

    def test_returns_exact_supported_provider_array(self, payment_context):
        response = requests.get(
            f"{API}/settings/payment/providers",
            headers=payment_context["fresh_headers"],
            timeout=TIMEOUT,
        )
        assert response.status_code == 200, response.text
        providers = response.json()
        assert isinstance(providers, list), "Endpoint contract requires a top-level array"

    def test_returned_provider_entries_have_exact_schema(self, payment_context):
        response = requests.get(
            f"{API}/settings/payment/providers",
            headers=payment_context["fresh_headers"],
            timeout=TIMEOUT,
        )
        assert response.status_code == 200, response.text
        body = response.json()
        providers = body if isinstance(body, list) else body.get("providers")
        assert isinstance(providers, list)
        assert len(providers) == 7
        assert {provider["id"] for provider in providers} == set(EXPECTED_PROVIDERS)
        for provider in providers:
            assert set(provider) == {"id", "name", "country", "fields"}
            assert isinstance(provider["name"], str) and provider["name"]
            assert provider["country"] in {"IN", "GLOBAL"}
            assert provider["fields"] == EXPECTED_PROVIDERS[provider["id"]]


# Fresh defaults, method selection, UPI persistence/validation, and intent generation.
class TestUPIAndPaymentMethods:
    def test_01_fresh_user_defaults_and_unconfigured_intent(self, payment_context):
        fetched = requests.get(
            f"{API}/settings/payment",
            headers=payment_context["fresh_headers"],
            timeout=TIMEOUT,
        )
        assert fetched.status_code == 200, fetched.text
        assert fetched.json() == {
            "method": "upi",
            "upi": {},
            "gateway": {},
            "configured": {"upi": False, "gateway": False},
        }

        intent = requests.post(
            f"{API}/payments/upi/intent",
            headers=payment_context["fresh_headers"],
            json={"amount": 500, "note": "Consult", "invoice_id": "inv-abc"},
            timeout=TIMEOUT,
        )
        _assert_error(intent, 400, "not configured")

    @pytest.mark.parametrize("method", ["gateway", "cash", "upi"])
    def test_02_each_valid_method_persists(self, payment_context, method):
        updated = requests.put(
            f"{API}/settings/payment/method",
            headers=payment_context["fresh_headers"],
            json={"method": method},
            timeout=TIMEOUT,
        )
        assert updated.status_code == 200, updated.text
        assert updated.json() == {"method": method}
        fetched = requests.get(
            f"{API}/settings/payment",
            headers=payment_context["fresh_headers"],
            timeout=TIMEOUT,
        )
        assert fetched.status_code == 200 and fetched.json()["method"] == method

    def test_03_invalid_method_is_clear_400(self, payment_context):
        response = requests.put(
            f"{API}/settings/payment/method",
            headers=payment_context["fresh_headers"],
            json={"method": "cheque"},
            timeout=TIMEOUT,
        )
        _assert_error(response, 400, "method must be one of")

    def test_04_invalid_vpa_is_400(self, payment_context):
        response = requests.put(
            f"{API}/settings/payment/upi",
            headers=payment_context["fresh_headers"],
            json={"upi_id": "notavpa", "display_name": "TEST Clinic"},
            timeout=TIMEOUT,
        )
        _assert_error(response, 400, "valid UPI ID")

    def test_05_upi_save_get_and_dynamic_intent(self, payment_context):
        payload = {"upi_id": "drsarah@okaxis", "display_name": "Dr Sarah Clinic"}
        saved = requests.put(
            f"{API}/settings/payment/upi",
            headers=payment_context["fresh_headers"],
            json=payload,
            timeout=TIMEOUT,
        )
        assert saved.status_code == 200, saved.text
        assert saved.json()["upi_id"] == payload["upi_id"]

        fetched = requests.get(
            f"{API}/settings/payment",
            headers=payment_context["fresh_headers"],
            timeout=TIMEOUT,
        )
        assert fetched.status_code == 200, fetched.text
        body = fetched.json()
        assert body["method"] == "upi"
        assert body["upi"] == payload
        assert body["configured"]["upi"] is True

        intent = requests.post(
            f"{API}/payments/upi/intent",
            headers=payment_context["fresh_headers"],
            json={"amount": 500, "note": "Consult", "invoice_id": "inv-abc"},
            timeout=TIMEOUT,
        )
        assert intent.status_code == 200, intent.text
        result = intent.json()
        assert result["upi_intent"].startswith("upi://pay?")
        parsed = urlparse(result["upi_intent"])
        query = parse_qs(parsed.query)
        assert parsed.scheme == "upi" and parsed.netloc == "pay"
        assert query["pa"] == ["drsarah@okaxis"]
        assert query["pn"] == ["Dr Sarah Clinic"]
        assert query["am"] == ["500.00"]
        assert query["cu"] == ["INR"] and query["tn"] == ["Consult"]
        assert query["tr"] == ["INVinv-abc"]
        assert result["qr_png_data_url"].startswith("data:image/png;base64,")
        assert len(result["qr_png_data_url"]) > 100


# Direct gateway credential validation, masking, encrypted-at-rest persistence, and removal.
class TestGatewaySettings:
    def test_01_unknown_provider_and_missing_fields_are_400(self, payment_context):
        unknown = requests.put(
            f"{API}/settings/payment/gateway",
            headers=payment_context["fresh_headers"],
            json={"provider": "unknownpay", "credentials": {"key": "value"}},
            timeout=TIMEOUT,
        )
        _assert_error(unknown, 400, "provider must be one of")

        missing = requests.put(
            f"{API}/settings/payment/gateway",
            headers=payment_context["fresh_headers"],
            json={"provider": "razorpay", "credentials": {"key_id": "rzp_test_XYZ"}},
            timeout=TIMEOUT,
        )
        _assert_error(missing, 400, "key_secret")

    def test_02_razorpay_secret_is_masked_and_encrypted_at_rest(self, payment_context):
        mock_secret = "topsecretVALUE"  # intentional sentinel — not a real credential
        payload = {
            "provider": "razorpay",
            "credentials": {"key_id": "rzp_test_XYZ", "key_secret": mock_secret},
        }
        saved = requests.put(
            f"{API}/settings/payment/gateway",
            headers=payment_context["fresh_headers"],
            json=payload,
            timeout=TIMEOUT,
        )
        assert saved.status_code == 200, saved.text
        assert mock_secret not in saved.text

        fetched = requests.get(
            f"{API}/settings/payment",
            headers=payment_context["fresh_headers"],
            timeout=TIMEOUT,
        )
        assert fetched.status_code == 200, fetched.text
        body = fetched.json()
        credentials = body["gateway"]["credentials"]
        assert body["gateway"]["provider"] == "razorpay"
        assert credentials["key_id"] == "rzp_test_XYZ"
        assert credentials["key_secret"] == "•" * (len(mock_secret) - 4) + mock_secret[-4:]
        assert mock_secret not in fetched.text
        assert body["configured"]["gateway"] is True

        persisted = payment_context["db"].payment_settings.find_one(
            {"owner_id": payment_context["fresh"]["user"]["id"]}, {"_id": 0}
        )
        stored_secret = persisted["gateway"]["credentials"]["key_secret"]
        assert stored_secret != mock_secret
        assert mock_secret not in json.dumps(persisted)
        assert isinstance(stored_secret, str) and len(stored_secret) > len(mock_secret)

    def test_03_phonepe_masks_only_salt_key(self, payment_context):
        mock_salt = "SALTABC1234567890"  # intentional sentinel — not a real credential
        payload = {
            "provider": "phonepe",
            "credentials": {
                "merchant_id": "M1234",
                "salt_key": mock_salt,
                "salt_index": "1",
            },
        }
        saved = requests.put(
            f"{API}/settings/payment/gateway",
            headers=payment_context["fresh_headers"],
            json=payload,
            timeout=TIMEOUT,
        )
        assert saved.status_code == 200, saved.text
        fetched = requests.get(
            f"{API}/settings/payment",
            headers=payment_context["fresh_headers"],
            timeout=TIMEOUT,
        )
        assert fetched.status_code == 200, fetched.text
        credentials = fetched.json()["gateway"]["credentials"]
        assert credentials["merchant_id"] == "M1234"
        assert credentials["salt_index"] == "1"
        assert credentials["salt_key"] == "•" * (len(mock_salt) - 4) + "7890"
        assert mock_salt not in fetched.text

    def test_04_sub_user_resolves_same_owner_settings(self, payment_context):
        email = f"test_payment_sub_{payment_context['stamp']}@test.com"
        sub_password = os.environ.get("TEST_SUB_PASSWORD", "PaymentSub@12345")  # ephemeral test user
        created = requests.post(
            f"{API}/clinics/sub-users",
            headers=payment_context["fresh_headers"],
            json={
                "name": "TEST Payment Front Desk",
                "email": email,
                "password": sub_password,
                "phone_number": f"+918{uuid.uuid4().int % 1_000_000_000:09d}",
                "role": "front_desk",
            },
            timeout=TIMEOUT,
        )
        assert created.status_code == 200, created.text
        payment_context["sub_user_ids"].append(created.json()["id"])
        payment_context["db"].login_ip_hits.delete_many({})
        login = _assert_login(
            requests.post(
                f"{API}/auth/login",
                json={"email": email, "password": sub_password},
                timeout=TIMEOUT,
            ),
            email,
        )
        fetched = requests.get(
            f"{API}/settings/payment",
            headers=_headers(login["token"]),
            timeout=TIMEOUT,
        )
        assert fetched.status_code == 200, fetched.text
        assert fetched.json()["gateway"]["provider"] == "phonepe"
        assert fetched.json()["upi"]["upi_id"] == "drsarah@okaxis"

    def test_05_delete_gateway_clears_configuration(self, payment_context):
        deleted = requests.delete(
            f"{API}/settings/payment/gateway",
            headers=payment_context["fresh_headers"],
            timeout=TIMEOUT,
        )
        assert deleted.status_code == 200, deleted.text
        assert "removed" in deleted.json()["message"].lower()
        fetched = requests.get(
            f"{API}/settings/payment",
            headers=payment_context["fresh_headers"],
            timeout=TIMEOUT,
        )
        assert fetched.status_code == 200, fetched.text
        assert fetched.json()["gateway"] == {}
        assert fetched.json()["configured"]["gateway"] is False


# Cash invoice settlement: full, partial, receipt, validation, ownership, and DB persistence.
class TestMarkCashPaid:
    @staticmethod
    def _create_invoice(payment_context, headers, name: str, rate: float, phone: str | None = None):
        response = requests.post(
            f"{API}/invoices",
            headers=headers,
            json={
                "client_name": name,
                "client_phone": phone,
                "items": [{"description": "Consult", "qty": 1, "rate": rate}],
                "payment_status": "pending",
            },
            timeout=TIMEOUT,
        )
        assert response.status_code == 200, response.text
        invoice = response.json()
        payment_context["invoice_ids"].append(invoice["id"])
        return invoice

    def test_01_full_amount_marks_paid_and_persists_audit_fields(self, payment_context):
        invoice = self._create_invoice(
            payment_context,
            payment_context["sarah_headers"],
            "TEST Cash Full",
            500,
        )
        marked = requests.post(
            f"{API}/invoices/{invoice['id']}/mark-cash-paid",
            headers=payment_context["sarah_headers"],
            json={"amount_paid": invoice["total"], "send_whatsapp_receipt": False},
            timeout=TIMEOUT,
        )
        assert marked.status_code == 200, marked.text
        result = marked.json()
        assert result["invoice_id"] == invoice["id"]
        assert result["payment_status"] == "paid"
        assert result["amount_paid"] == invoice["total"]
        assert result["receipt_sent"] is False

        fetched = requests.get(
            f"{API}/invoices/{invoice['id']}",
            headers=payment_context["sarah_headers"],
            timeout=TIMEOUT,
        )
        assert fetched.status_code == 200, fetched.text
        body = fetched.json()
        assert body["payment_status"] == "paid"
        assert body["payment_method"] == "cash"
        assert body["amount_paid"] == invoice["total"]
        assert isinstance(body["paid_at"], str) and datetime.fromisoformat(body["paid_at"])
        assert isinstance(body["paid_by"], str) and body["paid_by"]

        persisted = payment_context["db"].invoices.find_one(
            {"id": invoice["id"], "owner_id": payment_context["sarah"]["user"]["id"]},
            {"_id": 0},
        )
        for field in ("payment_status", "payment_method", "amount_paid", "paid_at", "paid_by"):
            assert persisted[field] == body[field]

    def test_02_partial_amount_marks_partial(self, payment_context):
        invoice = self._create_invoice(
            payment_context,
            payment_context["sarah_headers"],
            "TEST Cash Partial",
            600,
        )
        marked = requests.post(
            f"{API}/invoices/{invoice['id']}/mark-cash-paid",
            headers=payment_context["sarah_headers"],
            json={"amount_paid": 200, "send_whatsapp_receipt": False},
            timeout=TIMEOUT,
        )
        assert marked.status_code == 200, marked.text
        assert marked.json()["payment_status"] == "partial"
        fetched = requests.get(
            f"{API}/invoices/{invoice['id']}",
            headers=payment_context["sarah_headers"],
            timeout=TIMEOUT,
        )
        assert fetched.status_code == 200
        assert fetched.json()["payment_status"] == "partial"
        assert fetched.json()["amount_paid"] == 200
        assert fetched.json()["payment_method"] == "cash"

    def test_03_whatsapp_receipt_never_500_when_provider_unconfigured(self, payment_context):
        invoice = self._create_invoice(
            payment_context,
            payment_context["sarah_headers"],
            "TEST Cash Receipt",
            300,
            "+919876543210",
        )
        marked = requests.post(
            f"{API}/invoices/{invoice['id']}/mark-cash-paid",
            headers=payment_context["sarah_headers"],
            json={
                "amount_paid": invoice["total"],
                "send_whatsapp_receipt": True,
                "receipt_phone": "+919876543210",
            },
            timeout=TIMEOUT,
        )
        assert marked.status_code == 200, marked.text
        assert marked.json()["payment_status"] == "paid"
        assert marked.json()["receipt_sent"] in (True, False)

    @pytest.mark.parametrize("invalid_amount", [0, -1])
    def test_04_non_positive_amount_is_400(self, payment_context, invalid_amount):
        invoice = self._create_invoice(
            payment_context,
            payment_context["sarah_headers"],
            f"TEST Cash Invalid {invalid_amount}",
            100,
        )
        response = requests.post(
            f"{API}/invoices/{invoice['id']}/mark-cash-paid",
            headers=payment_context["sarah_headers"],
            json={"amount_paid": invalid_amount, "send_whatsapp_receipt": False},
            timeout=TIMEOUT,
        )
        _assert_error(response, 400, "greater than 0")

    def test_05_other_owner_invoice_is_404(self, payment_context):
        invoice = self._create_invoice(
            payment_context,
            payment_context["fresh_headers"],
            "TEST Other Owner Cash",
            250,
        )
        response = requests.post(
            f"{API}/invoices/{invoice['id']}/mark-cash-paid",
            headers=payment_context["sarah_headers"],
            json={"amount_paid": invoice["total"], "send_whatsapp_receipt": False},
            timeout=TIMEOUT,
        )
        _assert_error(response, 404, "Invoice not found")

    def test_06_amount_above_invoice_total_is_rejected(self, payment_context):
        invoice = self._create_invoice(
            payment_context,
            payment_context["sarah_headers"],
            "TEST Cash Overpayment",
            200,
        )
        response = requests.post(
            f"{API}/invoices/{invoice['id']}/mark-cash-paid",
            headers=payment_context["sarah_headers"],
            json={"amount_paid": invoice["total"] + 1, "send_whatsapp_receipt": False},
            timeout=TIMEOUT,
        )
        assert response.status_code == 400, (
            "Cash settlement must not persist amount_paid above the invoice total: "
            f"{response.status_code} {response.text}"
        )


# Requested unaffected API regressions against the public endpoint.
class TestRequestedRegressions:
    def test_health(self):
        response = requests.get(f"{API}/health", timeout=TIMEOUT)
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["status"] == "healthy"
        assert body["components"]["database"] == "healthy"

    def test_auth_login(self, payment_context):
        payment_context["db"].login_ip_hits.delete_many({})
        response = requests.post(
            f"{API}/auth/login",
            json=payment_context["sarah_credentials"],
            timeout=TIMEOUT,
        )
        _assert_login(response, payment_context["sarah_credentials"]["email"])
        payment_context["db"].login_ip_hits.delete_many({})

    @pytest.mark.parametrize("resource", ["appointments", "clients"])
    def test_authenticated_list_endpoints(self, payment_context, resource):
        response = requests.get(
            f"{API}/{resource}",
            headers=payment_context["sarah_headers"],
            timeout=TIMEOUT,
        )
        assert response.status_code == 200, response.text
        assert isinstance(response.json(), list)
        assert all("_id" not in row for row in response.json())

    def test_safety_timeline(self, payment_context):
        phone = f"+917{uuid.uuid4().int % 1_000_000_000:09d}"
        response = requests.get(
            f"{API}/safety/timeline/{phone}",
            headers=payment_context["sarah_headers"],
            timeout=TIMEOUT,
        )
        assert response.status_code == 200, response.text
        body = response.json()
        assert body == {"client_phone": phone, "count": 0, "events": []}

    def test_data_deletion_request(self, payment_context):
        phone = f"+916{uuid.uuid4().int % 1_000_000_000:09d}"
        response = requests.post(
            f"{API}/data-deletion/request",
            json={
                "phone": phone,
                "email": f"test_payment_delete_{payment_context['stamp']}@test.com",
                "reason": "TEST payment regression",
            },
            timeout=TIMEOUT,
        )
        assert response.status_code == 200, response.text
        body = response.json()
        assert re.fullmatch(r"DEL-[A-F0-9]{10}", body["ticket_id"])
        assert body["status"] == "queued"
        payment_context["deletion_ticket_ids"].append(body["ticket_id"])

    def test_meta_template_publish_unconfigured_is_400(self, payment_context):
        response = requests.post(
            f"{API}/meta-whatsapp/templates/publish",
            headers=payment_context["fresh_headers"],
            timeout=TIMEOUT,
        )
        _assert_error(response, 400, "not configured")
