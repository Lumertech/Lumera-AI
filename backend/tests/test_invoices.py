"""Backend tests for Invoicing + Consultation-Types modules (iteration 7)."""
import os
import time
import pytest
import requests
from concurrent.futures import ThreadPoolExecutor

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")
if not BASE_URL:
    # fallback to frontend/.env
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    BASE_URL = line.split("=", 1)[1].strip()
                    break
    except Exception:
        pass
BASE_URL = (BASE_URL or "").rstrip("/")
API = f"{BASE_URL}/api"

DOCTOR_EMAIL = "sarah@test.com"
DOCTOR_PWD = "test123456"


# ---------- session-wide fixtures ----------
@pytest.fixture(scope="session")
def doctor_token():
    r = requests.post(f"{API}/auth/login", json={"email": DOCTOR_EMAIL, "password": DOCTOR_PWD})
    if r.status_code == 429:
        time.sleep(60)
        r = requests.post(f"{API}/auth/login", json={"email": DOCTOR_EMAIL, "password": DOCTOR_PWD})
    assert r.status_code == 200, f"Doctor login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def doctor_headers(doctor_token):
    return {"Authorization": f"Bearer {doctor_token}"}


@pytest.fixture(scope="session")
def receptionist(doctor_headers):
    ts = int(time.time())
    email = f"recep_inv_{ts}@test.com"
    pwd = "Recep@12345"
    r = requests.post(
        f"{API}/clinics/sub-users",
        headers=doctor_headers,
        json={"email": email, "password": pwd, "name": "Test Recep", "role": "receptionist", "phone_number": "+919999999999"},
    )
    assert r.status_code in (200, 201), f"sub-user create failed: {r.status_code} {r.text}"
    # login
    time.sleep(1)
    rl = requests.post(f"{API}/auth/login", json={"email": email, "password": pwd})
    if rl.status_code == 429:
        time.sleep(60)
        rl = requests.post(f"{API}/auth/login", json={"email": email, "password": pwd})
    assert rl.status_code == 200, f"recep login failed: {rl.status_code} {rl.text}"
    return {"Authorization": f"Bearer {rl.json()['token']}", "email": email}


# =====================================================
# Consultation Types
# =====================================================
class TestConsultationTypes:
    def test_create_list_update_delete(self, doctor_headers):
        # CREATE
        r = requests.post(
            f"{API}/consultation-types",
            headers=doctor_headers,
            json={"name": "TEST_OPD_Visit", "fee": 500, "description": "Standard visit"},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["name"] == "TEST_OPD_Visit"
        assert body["fee"] == 500.0
        assert body["description"] == "Standard visit"
        assert "id" in body
        type_id = body["id"]

        # LIST contains it
        r2 = requests.get(f"{API}/consultation-types", headers=doctor_headers)
        assert r2.status_code == 200
        ids = [x["id"] for x in r2.json()]
        assert type_id in ids

        # UPDATE
        r3 = requests.put(
            f"{API}/consultation-types/{type_id}",
            headers=doctor_headers,
            json={"fee": 750},
        )
        assert r3.status_code == 200
        assert r3.json()["fee"] == 750.0
        assert r3.json()["name"] == "TEST_OPD_Visit"  # unchanged

        # DELETE
        r4 = requests.delete(f"{API}/consultation-types/{type_id}", headers=doctor_headers)
        assert r4.status_code == 200
        assert r4.json().get("success") is True

        # gone
        r5 = requests.get(f"{API}/consultation-types", headers=doctor_headers)
        assert type_id not in [x["id"] for x in r5.json()]

    def test_negative_fee_rejected(self, doctor_headers):
        r = requests.post(
            f"{API}/consultation-types",
            headers=doctor_headers,
            json={"name": "TEST_NegFee", "fee": -10},
        )
        assert r.status_code == 400

    def test_receptionist_get_allowed_mutations_blocked(self, doctor_headers, receptionist):
        # create one as doctor
        r = requests.post(
            f"{API}/consultation-types",
            headers=doctor_headers,
            json={"name": "TEST_Recep_View", "fee": 100},
        )
        type_id = r.json()["id"]

        # GET allowed
        recep_h = {"Authorization": receptionist["Authorization"]}
        rg = requests.get(f"{API}/consultation-types", headers=recep_h)
        assert rg.status_code == 200
        assert type_id in [x["id"] for x in rg.json()]

        # POST blocked
        rp = requests.post(
            f"{API}/consultation-types",
            headers=recep_h,
            json={"name": "TEST_Recep_New", "fee": 1},
        )
        assert rp.status_code == 403, f"expected 403, got {rp.status_code}"

        # PUT blocked
        ru = requests.put(
            f"{API}/consultation-types/{type_id}", headers=recep_h, json={"fee": 5}
        )
        assert ru.status_code == 403

        # DELETE blocked
        rd = requests.delete(f"{API}/consultation-types/{type_id}", headers=recep_h)
        assert rd.status_code == 403

        # cleanup
        requests.delete(f"{API}/consultation-types/{type_id}", headers=doctor_headers)


# =====================================================
# Invoices — math, auto-number, update, filters, perms
# =====================================================
class TestInvoiceMath:
    def test_set1_subtotal800_discount50_tax10(self, doctor_headers):
        payload = {
            "client_name": "TEST_Client_Math1",
            "client_phone": "+919900000001",
            "items": [
                {"description": "Visit", "qty": 1, "rate": 500},
                {"description": "X-ray", "qty": 1, "rate": 300},
            ],
            "discount": 50,
            "tax_rate": 10,
            "payment_status": "pending",
        }
        r = requests.post(f"{API}/invoices", headers=doctor_headers, json=payload)
        assert r.status_code == 200, r.text
        b = r.json()
        assert b["subtotal"] == 800
        assert b["tax_amount"] == 75
        assert b["total"] == 825
        assert b["payment_status"] == "pending"
        assert b["invoice_number"].startswith("INV-") and len(b["invoice_number"]) >= 13

    def test_set2_subtotal500_disc0_tax18(self, doctor_headers):
        payload = {
            "client_name": "TEST_Client_Math2",
            "items": [
                {"description": "Consult", "qty": 2, "rate": 200},
                {"description": "Misc", "qty": 1, "rate": 100},
            ],
            "discount": 0,
            "tax_rate": 18,
            "payment_status": "pending",
        }
        r = requests.post(f"{API}/invoices", headers=doctor_headers, json=payload)
        assert r.status_code == 200, r.text
        b = r.json()
        assert b["subtotal"] == 500
        assert b["tax_amount"] == 90
        assert b["total"] == 590


class TestInvoiceAutoNumber:
    def test_format_and_per_year(self, doctor_headers):
        from datetime import datetime, timezone
        year = datetime.now(timezone.utc).year
        payload = {
            "client_name": "TEST_AutoNum",
            "items": [{"description": "x", "qty": 1, "rate": 100}],
            "payment_status": "pending",
        }
        r = requests.post(f"{API}/invoices", headers=doctor_headers, json=payload)
        assert r.status_code == 200
        num = r.json()["invoice_number"]
        # INV-YYYY-NNNN
        import re
        m = re.match(r"^INV-(\d{4})-(\d{4,})$", num)
        assert m, f"unexpected invoice_number format: {num}"
        assert int(m.group(1)) == year

    def test_concurrent_unique_numbers(self, doctor_headers):
        """Fire two creates rapidly and assert distinct invoice_numbers."""
        payload = {
            "client_name": "TEST_Concurrency",
            "items": [{"description": "x", "qty": 1, "rate": 50}],
            "payment_status": "pending",
        }

        def _post():
            return requests.post(f"{API}/invoices", headers=doctor_headers, json=payload)

        with ThreadPoolExecutor(max_workers=2) as ex:
            f1 = ex.submit(_post)
            f2 = ex.submit(_post)
            r1, r2 = f1.result(), f2.result()
        assert r1.status_code == 200 and r2.status_code == 200, (r1.text, r2.text)
        n1, n2 = r1.json()["invoice_number"], r2.json()["invoice_number"]
        assert n1 != n2, f"duplicate invoice numbers: {n1} == {n2}"
        # both same year
        assert n1.split("-")[1] == n2.split("-")[1]


class TestInvoiceUpdate:
    def test_recompute_on_update(self, doctor_headers):
        # create simple invoice
        r = requests.post(
            f"{API}/invoices",
            headers=doctor_headers,
            json={
                "client_name": "TEST_Update",
                "items": [{"description": "v", "qty": 1, "rate": 500}, {"description": "v2", "qty": 1, "rate": 300}],
                "discount": 50,
                "tax_rate": 0,
                "payment_status": "pending",
            },
        )
        assert r.status_code == 200, r.text
        inv = r.json()
        inv_id = inv["id"]
        assert inv["total"] == 750  # 800 - 50

        # update tax_rate to 10 → should recompute to 825
        ru = requests.put(
            f"{API}/invoices/{inv_id}",
            headers=doctor_headers,
            json={"tax_rate": 10},
        )
        assert ru.status_code == 200
        b = ru.json()
        assert b["subtotal"] == 800
        assert b["tax_amount"] == 75
        assert b["total"] == 825

        # GET to confirm persistence
        rg = requests.get(f"{API}/invoices/{inv_id}", headers=doctor_headers)
        assert rg.status_code == 200
        assert rg.json()["total"] == 825

    def test_mark_paid_and_overpay_rejected(self, doctor_headers):
        r = requests.post(
            f"{API}/invoices",
            headers=doctor_headers,
            json={
                "client_name": "TEST_Pay",
                "items": [{"description": "v", "qty": 1, "rate": 200}],
                "payment_status": "pending",
            },
        )
        inv_id = r.json()["id"]
        total = r.json()["total"]

        rp = requests.put(
            f"{API}/invoices/{inv_id}",
            headers=doctor_headers,
            json={"payment_status": "paid", "amount_paid": total},
        )
        assert rp.status_code == 200
        assert rp.json()["payment_status"] == "paid"
        assert rp.json()["amount_paid"] == total

        # overpay
        ro = requests.put(
            f"{API}/invoices/{inv_id}",
            headers=doctor_headers,
            json={"amount_paid": total + 100},
        )
        assert ro.status_code == 400

        # invalid status
        ri = requests.put(
            f"{API}/invoices/{inv_id}",
            headers=doctor_headers,
            json={"payment_status": "weird"},
        )
        assert ri.status_code == 400


class TestInvoiceFilters:
    def test_status_and_client_phone(self, doctor_headers):
        phone = "+9198TEST777"
        from urllib.parse import quote
        ph_q = quote(phone, safe="")
        # create one paid + one pending with the same phone
        r1 = requests.post(
            f"{API}/invoices",
            headers=doctor_headers,
            json={
                "client_name": "TEST_Filter_Paid",
                "client_phone": phone,
                "items": [{"description": "x", "qty": 1, "rate": 100}],
                "payment_status": "paid",
                "amount_paid": 100,
            },
        )
        assert r1.status_code == 200, r1.text
        r2 = requests.post(
            f"{API}/invoices",
            headers=doctor_headers,
            json={
                "client_name": "TEST_Filter_Pending",
                "client_phone": phone,
                "items": [{"description": "y", "qty": 1, "rate": 50}],
                "payment_status": "pending",
            },
        )
        assert r2.status_code == 200

        # filter status=paid + phone
        rp = requests.get(
            f"{API}/invoices?status=paid&client_phone={ph_q}", headers=doctor_headers
        )
        assert rp.status_code == 200
        items = rp.json()
        assert all(i["payment_status"] == "paid" and i["client_phone"] == phone for i in items)
        assert any(i["id"] == r1.json()["id"] for i in items)

        # phone-only filter returns both
        rb = requests.get(f"{API}/invoices?client_phone={ph_q}", headers=doctor_headers)
        assert rb.status_code == 200
        ids = [i["id"] for i in rb.json()]
        assert r1.json()["id"] in ids and r2.json()["id"] in ids


class TestInvoicePermissions:
    def test_receptionist_can_list_and_create_but_not_delete(self, doctor_headers, receptionist):
        recep_h = {"Authorization": receptionist["Authorization"]}

        # LIST allowed
        rg = requests.get(f"{API}/invoices", headers=recep_h)
        assert rg.status_code == 200

        # CREATE allowed and scoped to parent owner_id
        rc = requests.post(
            f"{API}/invoices",
            headers=recep_h,
            json={
                "client_name": "TEST_RecepCreated",
                "items": [{"description": "x", "qty": 1, "rate": 99}],
                "payment_status": "pending",
            },
        )
        assert rc.status_code == 200, rc.text
        inv = rc.json()

        # doctor should be able to see it (attributed to parent)
        rd_list = requests.get(f"{API}/invoices", headers=doctor_headers)
        ids_doc = [i["id"] for i in rd_list.json()]
        assert inv["id"] in ids_doc, "receptionist-created invoice not visible to parent doctor"

        # DELETE blocked for receptionist
        rdel = requests.delete(f"{API}/invoices/{inv['id']}", headers=recep_h)
        assert rdel.status_code == 403

        # doctor delete works
        rdel2 = requests.delete(f"{API}/invoices/{inv['id']}", headers=doctor_headers)
        assert rdel2.status_code == 200

        # 404 after delete
        rget = requests.get(f"{API}/invoices/{inv['id']}", headers=doctor_headers)
        assert rget.status_code == 404


class TestInvoiceValidation:
    def test_empty_items_rejected(self, doctor_headers):
        r = requests.post(
            f"{API}/invoices",
            headers=doctor_headers,
            json={"client_name": "TEST_NoItems", "items": [], "payment_status": "pending"},
        )
        assert r.status_code == 400

    def test_invalid_status_on_create(self, doctor_headers):
        r = requests.post(
            f"{API}/invoices",
            headers=doctor_headers,
            json={
                "client_name": "TEST_BadStatus",
                "items": [{"description": "x", "qty": 1, "rate": 100}],
                "payment_status": "weird",
            },
        )
        assert r.status_code == 400
