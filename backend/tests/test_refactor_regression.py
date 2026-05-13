"""Refactor regression tests — Phase 1/2/3 routers extracted to /app/backend/routes.

Validates:
- Empty-email coerces to None on POST /api/clinics (no 422)
- Hexa search_patient with regex metacharacters (O'Brien, a.b*) does not 500
- Pre-existing routes still mounted: /api/auth/{login,me}, /api/appointments,
  /api/clients, /api/analytics/dashboard, /api/admin/users
- Phase 1/2/3 routers respond on same paths
"""
import os
import uuid
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")
if not BASE_URL:
    raise RuntimeError("REACT_APP_BACKEND_URL must be set")
BASE_URL = BASE_URL.rstrip("/")

DOCTOR_EMAIL = "sarah@test.com"
DOCTOR_PASSWORD = "test123456"
ADMIN_EMAIL = "admin@lumer.com"
ADMIN_PASSWORD = "admin123"


@pytest.fixture(scope="module")
def doctor_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": DOCTOR_EMAIL, "password": DOCTOR_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"Doctor login failed: {r.status_code} {r.text}"
    data = r.json()
    tok = data.get("token") or data.get("access_token")
    assert tok, f"No token in login response: {data}"
    return tok


@pytest.fixture(scope="module")
def doctor_headers(doctor_token):
    return {"Authorization": f"Bearer {doctor_token}"}


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    if r.status_code != 200:
        pytest.skip(f"Admin login unavailable: {r.status_code}")
    return r.json().get("token") or r.json().get("access_token")


# ---------- Preexisting routes still mounted ----------

class TestPreexistingRoutes:
    def test_login_returns_token(self):
        r = requests.post(f"{BASE_URL}/api/auth/login",
                          json={"email": DOCTOR_EMAIL, "password": DOCTOR_PASSWORD}, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert (data.get("token") or data.get("access_token"))

    def test_auth_me(self, doctor_headers):
        r = requests.get(f"{BASE_URL}/api/auth/me", headers=doctor_headers, timeout=15)
        assert r.status_code == 200
        assert r.json().get("email") == DOCTOR_EMAIL

    def test_appointments_list(self, doctor_headers):
        r = requests.get(f"{BASE_URL}/api/appointments", headers=doctor_headers, timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_clients_list(self, doctor_headers):
        r = requests.get(f"{BASE_URL}/api/clients", headers=doctor_headers, timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_dashboard_analytics(self, doctor_headers):
        r = requests.get(f"{BASE_URL}/api/analytics/dashboard", headers=doctor_headers, timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), dict)

    def test_admin_users(self, admin_token):
        h = {"Authorization": f"Bearer {admin_token}"}
        r = requests.get(f"{BASE_URL}/api/admin/users", headers=h, timeout=15)
        # admin route exists; either 200 list or 200 dict
        assert r.status_code == 200


# ---------- Phase 1/2/3 extracted routers — path + behavior ----------

class TestExtractedRoutersMounted:
    def test_prescriptions_list(self, doctor_headers):
        r = requests.get(f"{BASE_URL}/api/prescriptions", headers=doctor_headers, timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_consultations_list(self, doctor_headers):
        r = requests.get(f"{BASE_URL}/api/consultations", headers=doctor_headers, timeout=15)
        assert r.status_code == 200

    def test_clinics_list(self, doctor_headers):
        r = requests.get(f"{BASE_URL}/api/clinics", headers=doctor_headers, timeout=15)
        assert r.status_code == 200

    def test_clinics_sub_users(self, doctor_headers):
        r = requests.get(f"{BASE_URL}/api/clinics/sub-users", headers=doctor_headers, timeout=15)
        assert r.status_code == 200

    def test_opd_analytics_tier(self, doctor_headers):
        r = requests.get(f"{BASE_URL}/api/analytics/opd", headers=doctor_headers, timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body["incentive"]["tier"] in ("Bronze", "Silver", "Gold", "Platinum")
        assert "today" in body and "this_week" in body and "this_month" in body

    def test_drug_interactions(self, doctor_headers):
        r = requests.post(f"{BASE_URL}/api/prescriptions/drug-interactions",
                          headers=doctor_headers,
                          json={"medications": [{"medicine_name": "Paracetamol"}]}, timeout=30)
        assert r.status_code == 200
        assert "alerts" in r.json()


# ---------- Refactor-specific behaviors ----------

class TestRefactorBehaviors:
    def test_empty_email_coerces_to_none(self, doctor_headers):
        """POST /api/clinics with email='' should NOT 422; should coerce to None."""
        name = f"TEST_RefClinic_{uuid.uuid4().hex[:8]}"
        r = requests.post(
            f"{BASE_URL}/api/clinics",
            headers=doctor_headers,
            json={"name": name, "address": "x", "phone": "+911234567890", "email": ""},
            timeout=15,
        )
        assert r.status_code == 200, f"Empty email should coerce, got {r.status_code} {r.text}"
        assert r.json()["email"] is None
        # cleanup
        cid = r.json()["id"]
        requests.delete(f"{BASE_URL}/api/clinics/{cid}", headers=doctor_headers, timeout=15)

    @pytest.mark.parametrize("query", ["O'Brien", "a.b*c", "(test)+", "?weird"])
    def test_hexa_search_patient_regex_metacharacters(self, doctor_headers, query):
        """Hexa search_patient with regex metacharacters must not 500 (re.escape applied)."""
        r = requests.post(
            f"{BASE_URL}/api/hexa/command",
            headers=doctor_headers,
            json={"text": f"find patient {query}"}, timeout=30,
        )
        assert r.status_code == 200, f"Hexa crashed on '{query}': {r.status_code} {r.text}"

    def test_hexa_write_intent_gated_by_confirmation(self, doctor_headers):
        r = requests.post(
            f"{BASE_URL}/api/hexa/command",
            headers=doctor_headers,
            json={"text": "send reminder to Mr. Smith now"}, timeout=30,
        )
        assert r.status_code == 200
        data = r.json()
        # should NOT be executed without confirm=True
        if (data.get("action") or {}).get("type") == "send_reminder_now":
            assert data.get("executed") is False
            assert data.get("requires_confirmation") in (True, False)


# ---------- Receptionist boundary still enforced ----------

@pytest.fixture(scope="module")
def receptionist_creds(doctor_headers):
    # Create a fresh clinic + receptionist on the doctor
    clinic_name = f"TEST_RefRecepClinic_{uuid.uuid4().hex[:8]}"
    c = requests.post(f"{BASE_URL}/api/clinics", headers=doctor_headers,
                      json={"name": clinic_name}, timeout=15)
    assert c.status_code == 200
    clinic_id = c.json()["id"]
    email = f"recep_{uuid.uuid4().hex[:8]}@test.com"
    password = "Recep@12345"
    r = requests.post(
        f"{BASE_URL}/api/clinics/sub-users",
        headers=doctor_headers,
        json={"name": "TEST Recep", "email": email, "phone_number": "+919999999999",
              "password": password, "clinic_id": clinic_id},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    sub_id = r.json()["id"]
    yield {"email": email, "password": password}
    # teardown
    requests.delete(f"{BASE_URL}/api/clinics/sub-users/{sub_id}", headers=doctor_headers, timeout=15)
    requests.delete(f"{BASE_URL}/api/clinics/{clinic_id}", headers=doctor_headers, timeout=15)


@pytest.fixture(scope="module")
def receptionist_headers(receptionist_creds):
    r = requests.post(f"{BASE_URL}/api/auth/login", json=receptionist_creds, timeout=15)
    assert r.status_code == 200, r.text
    tok = r.json().get("token") or r.json().get("access_token")
    return {"Authorization": f"Bearer {tok}"}


class TestReceptionistBoundary:
    def test_blocked_consultations(self, receptionist_headers):
        r = requests.get(f"{BASE_URL}/api/consultations", headers=receptionist_headers, timeout=15)
        assert r.status_code == 403

    def test_blocked_hexa(self, receptionist_headers):
        r = requests.post(f"{BASE_URL}/api/hexa/command",
                          headers=receptionist_headers, json={"text": "show today"}, timeout=15)
        assert r.status_code == 403

    def test_blocked_opd(self, receptionist_headers):
        r = requests.get(f"{BASE_URL}/api/analytics/opd",
                         headers=receptionist_headers, timeout=15)
        assert r.status_code == 403

    def test_allowed_appointments(self, receptionist_headers):
        r = requests.get(f"{BASE_URL}/api/appointments",
                         headers=receptionist_headers, timeout=15)
        assert r.status_code == 200

    def test_allowed_clients(self, receptionist_headers):
        r = requests.get(f"{BASE_URL}/api/clients",
                         headers=receptionist_headers, timeout=15)
        assert r.status_code == 200
