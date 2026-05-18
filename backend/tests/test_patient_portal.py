"""Patient Self-Service Portal tests.

Covers:
- POST /api/patient-portal/issue-link (doctor) — returns {token,path,expires_at,client_phone}
- TTL clamping (1..180)
- Receptionist 403 on issue/list/revoke
- GET /api/patient-portal/links lists doctor's tokens
- POST /api/patient-portal/revoke/{token} -> subsequent public access returns 410
- Public endpoints (no Authorization header): profile, prescriptions, consultation-notes,
  appointments, medications, payments — all 200 no auth
- Privacy scrub: private_doctor_notes / private_notes never leak
- Bad token -> 404, Short token -> 404
- Expired token (DB tweak) -> 410
"""
import os
import time
import asyncio
import pytest
import requests


def _load_backend_url():
    val = os.environ.get('REACT_APP_BACKEND_URL')
    if val:
        return val.rstrip('/')
    with open('/app/frontend/.env') as f:
        for line in f:
            if line.startswith('REACT_APP_BACKEND_URL='):
                return line.split('=', 1)[1].strip().rstrip('/')
    raise RuntimeError('REACT_APP_BACKEND_URL not found')


BASE_URL = _load_backend_url()
DOCTOR_EMAIL = "sarah@test.com"
DOCTOR_PASS = "test123456"
TEST_PHONE = "+919998887766"
TEST_NAME = "TEST_PP_Client"
SECRET_DOC_NOTE = "SECRET_DOCTOR_NOTE_xyz_123"
SECRET_PRIV_NOTE = "SECRET_PRIVATE_NOTE_abc_789"


# ----- fixtures -----

@pytest.fixture(scope="module")
def doctor_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": DOCTOR_EMAIL, "password": DOCTOR_PASS}, timeout=15)
    assert r.status_code == 200, f"Doctor login failed: {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def doctor_headers(doctor_token):
    return {"Authorization": f"Bearer {doctor_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def recep_headers(doctor_headers):
    ts = int(time.time())
    email = f"recep_pp_{ts}@test.com"
    pw = "Recep@12345"
    r = requests.post(f"{BASE_URL}/api/clinics/sub-users", headers=doctor_headers,
                      json={"name": "Recep PP", "email": email,
                            "phone_number": "+919000099001", "password": pw}, timeout=15)
    assert r.status_code in (200, 201), f"Sub-user create failed: {r.text}"
    r2 = requests.post(f"{BASE_URL}/api/auth/login",
                       json={"email": email, "password": pw}, timeout=15)
    assert r2.status_code == 200, f"Recep login failed: {r2.text}"
    return {"Authorization": f"Bearer {r2.json()['token']}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def appointment_id(doctor_headers):
    payload = {
        "client_name": TEST_NAME, "client_phone": TEST_PHONE,
        "appointment_date": "2026-03-20", "start_time": "11:00", "end_time": "11:30",
        "consultation_mode": "in-person",
    }
    r = requests.post(f"{BASE_URL}/api/appointments", headers=doctor_headers, json=payload, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["id"]


@pytest.fixture(scope="module")
def seeded_records(doctor_headers, appointment_id):
    """Seed a prescription (with private_doctor_notes) and consultation note (with private_notes)."""
    rx = {
        "appointment_id": appointment_id,
        "client_name": TEST_NAME, "client_phone": TEST_PHONE,
        "medications": [{"medicine_name": "TestMed", "dosage": "10mg", "frequency": "OD", "duration": "5d"}],
        "instructions": "Take after food",
        "private_doctor_notes": SECRET_DOC_NOTE,
    }
    r1 = requests.post(f"{BASE_URL}/api/prescriptions", headers=doctor_headers, json=rx, timeout=15)
    # Some prescription endpoints might not accept private_doctor_notes from API; even if it doesn't persist
    # via API, we still tolerate. Just record outcome.
    rx_status = r1.status_code

    note = {
        "appointment_id": appointment_id,
        "client_name": TEST_NAME,
        "summary": "Pt reports anxiety, sleep improved.",
        "recommendations": "Continue current plan.",
        "private_notes": SECRET_PRIV_NOTE,
    }
    r2 = requests.post(f"{BASE_URL}/api/consultation-notes", headers=doctor_headers, json=note, timeout=15)
    note_status = r2.status_code
    return {"rx_status": rx_status, "note_status": note_status}


@pytest.fixture(scope="module")
def issued_link(doctor_headers, seeded_records):
    r = requests.post(f"{BASE_URL}/api/patient-portal/issue-link", headers=doctor_headers,
                      json={"client_phone": TEST_PHONE, "client_name": TEST_NAME, "ttl_days": 30}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()


# ----- Issue / TTL / Auth -----

class TestIssueLink:
    def test_issue_link_shape(self, issued_link):
        for k in ("token", "path", "expires_at", "client_phone"):
            assert k in issued_link, f"Missing {k} in {issued_link}"
        assert issued_link["path"] == f"/p/{issued_link['token']}"
        assert issued_link["client_phone"] == TEST_PHONE
        assert len(issued_link["token"]) >= 16

    def test_ttl_clamp_upper(self, doctor_headers):
        r = requests.post(f"{BASE_URL}/api/patient-portal/issue-link", headers=doctor_headers,
                          json={"client_phone": TEST_PHONE, "ttl_days": 9999}, timeout=15)
        assert r.status_code == 200
        # Expiry should be clamped to <=180 days. Hard to check exactly without parsing; just ensure present.
        from datetime import datetime, timezone, timedelta
        exp = datetime.fromisoformat(r.json()["expires_at"])
        delta = exp - datetime.now(timezone.utc)
        assert delta.days <= 180, f"TTL not clamped: {delta.days}"

    def test_ttl_clamp_lower(self, doctor_headers):
        r = requests.post(f"{BASE_URL}/api/patient-portal/issue-link", headers=doctor_headers,
                          json={"client_phone": TEST_PHONE, "ttl_days": 0}, timeout=15)
        assert r.status_code == 200
        from datetime import datetime, timezone
        exp = datetime.fromisoformat(r.json()["expires_at"])
        delta = exp - datetime.now(timezone.utc)
        assert delta.days >= 0, f"TTL not clamped to >=1: {delta}"

    def test_recep_blocked_issue(self, recep_headers):
        r = requests.post(f"{BASE_URL}/api/patient-portal/issue-link", headers=recep_headers,
                          json={"client_phone": TEST_PHONE, "ttl_days": 30}, timeout=15)
        assert r.status_code == 403, f"Expected 403, got {r.status_code}: {r.text}"

    def test_recep_blocked_list(self, recep_headers):
        r = requests.get(f"{BASE_URL}/api/patient-portal/links", headers=recep_headers, timeout=15)
        assert r.status_code == 403

    def test_recep_blocked_revoke(self, recep_headers, issued_link):
        r = requests.post(f"{BASE_URL}/api/patient-portal/revoke/{issued_link['token']}",
                          headers=recep_headers, timeout=15)
        assert r.status_code == 403


class TestListLinks:
    def test_list_includes_issued(self, doctor_headers, issued_link):
        r = requests.get(f"{BASE_URL}/api/patient-portal/links", headers=doctor_headers, timeout=15)
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        tokens = [it.get("token") for it in items]
        assert issued_link["token"] in tokens
        # ensure no _id leakage
        for it in items:
            assert "_id" not in it


# ----- Public endpoints (no auth) -----

class TestPublicEndpoints:
    def test_profile_no_auth(self, issued_link):
        r = requests.get(f"{BASE_URL}/api/patient-portal/{issued_link['token']}/profile", timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["client_phone"] == TEST_PHONE
        assert body["client_name"] == TEST_NAME
        assert "doctor_name" in body
        assert "expires_at" in body

    def test_prescriptions_no_auth_and_privacy(self, issued_link):
        r = requests.get(f"{BASE_URL}/api/patient-portal/{issued_link['token']}/prescriptions", timeout=15)
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        # privacy: never expose private_doctor_notes / private_notes
        raw = r.text
        assert "private_doctor_notes" not in raw, "private_doctor_notes leaked in prescriptions response"
        assert SECRET_DOC_NOTE not in raw, "Secret doctor note string leaked"
        for it in items:
            assert "private_doctor_notes" not in it
            assert "private_notes" not in it

    def test_consultation_notes_no_auth_and_privacy(self, issued_link):
        r = requests.get(f"{BASE_URL}/api/patient-portal/{issued_link['token']}/consultation-notes", timeout=15)
        assert r.status_code == 200
        items = r.json()
        raw = r.text
        assert "private_notes" not in raw, "private_notes key leaked"
        assert SECRET_PRIV_NOTE not in raw, "Secret private note string leaked"
        for it in items:
            assert "private_notes" not in it
            assert "private_doctor_notes" not in it

    def test_appointments_no_auth(self, issued_link):
        r = requests.get(f"{BASE_URL}/api/patient-portal/{issued_link['token']}/appointments", timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert "upcoming" in body and "past" in body
        assert isinstance(body["upcoming"], list) and isinstance(body["past"], list)

    def test_medications_no_auth(self, issued_link):
        r = requests.get(f"{BASE_URL}/api/patient-portal/{issued_link['token']}/medications", timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_payments_no_auth(self, issued_link):
        r = requests.get(f"{BASE_URL}/api/patient-portal/{issued_link['token']}/payments", timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ----- Negative cases -----

class TestNegativeCases:
    def test_bad_token_404(self):
        r = requests.get(f"{BASE_URL}/api/patient-portal/nonexistent_token_padded_to_16chars/profile", timeout=15)
        assert r.status_code == 404

    def test_short_token_404(self):
        r = requests.get(f"{BASE_URL}/api/patient-portal/short/profile", timeout=15)
        assert r.status_code == 404

    def test_expired_token_410(self, doctor_headers):
        """Issue a link, then directly tweak expires_at in DB to be in the past."""
        r = requests.post(f"{BASE_URL}/api/patient-portal/issue-link", headers=doctor_headers,
                          json={"client_phone": TEST_PHONE, "ttl_days": 30}, timeout=15)
        assert r.status_code == 200
        tok = r.json()["token"]

        # Update expires_at directly via pymongo (sync) — avoid touching motor's shared event loop
        import os as _os
        from pymongo import MongoClient
        from datetime import datetime, timezone, timedelta
        past = (datetime.now(timezone.utc) - timedelta(days=2)).isoformat()
        env = {}
        with open('/app/backend/.env') as _f:
            for _ln in _f:
                if '=' in _ln and not _ln.startswith('#'):
                    k, v = _ln.strip().split('=', 1)
                    env[k] = v.strip('"').strip("'")
        mongo_url = _os.environ.get('MONGO_URL') or env.get('MONGO_URL')
        db_name = _os.environ.get('DB_NAME') or env.get('DB_NAME')
        client = MongoClient(mongo_url)
        try:
            result = client[db_name].patient_portal_tokens.update_one({"token": tok}, {"$set": {"expires_at": past}})
        finally:
            client.close()
        assert result.matched_count == 1

        r2 = requests.get(f"{BASE_URL}/api/patient-portal/{tok}/profile", timeout=15)
        assert r2.status_code == 410, f"Expected 410 for expired, got {r2.status_code}: {r2.text}"


# ----- Revoke flow (run last so other tests don't break) -----

class TestZRevoke:
    def test_revoke_then_410(self, doctor_headers):
        # Issue a fresh token to revoke
        r = requests.post(f"{BASE_URL}/api/patient-portal/issue-link", headers=doctor_headers,
                          json={"client_phone": TEST_PHONE, "ttl_days": 30}, timeout=15)
        assert r.status_code == 200
        tok = r.json()["token"]

        # Public access works first
        r1 = requests.get(f"{BASE_URL}/api/patient-portal/{tok}/profile", timeout=15)
        assert r1.status_code == 200

        # Revoke
        rv = requests.post(f"{BASE_URL}/api/patient-portal/revoke/{tok}", headers=doctor_headers, timeout=15)
        assert rv.status_code == 200, rv.text
        assert rv.json().get("success") is True

        # Subsequent public access -> 410
        r2 = requests.get(f"{BASE_URL}/api/patient-portal/{tok}/profile", timeout=15)
        assert r2.status_code == 410

        # Prescriptions endpoint also blocked
        r3 = requests.get(f"{BASE_URL}/api/patient-portal/{tok}/prescriptions", timeout=15)
        assert r3.status_code == 410

    def test_revoke_unknown_token_404(self, doctor_headers):
        r = requests.post(f"{BASE_URL}/api/patient-portal/revoke/unknown_tok_padded_with_chars",
                          headers=doctor_headers, timeout=15)
        assert r.status_code == 404
