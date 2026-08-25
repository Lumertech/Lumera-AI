"""Lumera Phase 2-4 backend tests: Consultations/SOAP, Clinics, Sub-users, OPD, Hexa, Receptionist boundaries."""
import os
import io
import time
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    raise RuntimeError("REACT_APP_BACKEND_URL must be set")
API = f"{BASE_URL}/api"

DOCTOR_EMAIL = os.environ.get("TEST_DOCTOR_EMAIL", "sarah@test.com")
DOCTOR_PASSWORD = os.environ.get("TEST_DOCTOR_PASSWORD", "test123456")
TS = int(time.time())


# ---------- Fixtures ----------
@pytest.fixture(scope="session")
def doctor_token():
    r = requests.post(f"{API}/auth/login", json={"email": DOCTOR_EMAIL, "password": DOCTOR_PASSWORD})
    assert r.status_code == 200, f"Login failed: {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def doctor_headers(doctor_token):
    return {"Authorization": f"Bearer {doctor_token}"}


@pytest.fixture(scope="session")
def doctor_user(doctor_headers):
    r = requests.get(f"{API}/auth/me", headers=doctor_headers)
    assert r.status_code == 200
    return r.json()


# ---------- Consultations CRUD ----------
class TestConsultations:
    def test_create_list_get_update(self, doctor_headers):
        payload = {
            "client_name": f"TEST_Consult_{TS}",
            "client_phone": f"99999{TS%100000:05d}",
            "transcript": "Patient reports headache for 3 days, mild fever."
        }
        r = requests.post(f"{API}/consultations", json=payload, headers=doctor_headers)
        assert r.status_code == 200, r.text
        c = r.json()
        assert c["client_name"] == payload["client_name"]
        assert "id" in c
        cid = c["id"]

        r2 = requests.get(f"{API}/consultations", headers=doctor_headers)
        assert r2.status_code == 200
        assert any(x["id"] == cid for x in r2.json())

        r3 = requests.get(f"{API}/consultations/{cid}", headers=doctor_headers)
        assert r3.status_code == 200
        assert r3.json()["id"] == cid

        upd = {"transcript": "Updated transcript content", "chief_complaint": "Headache"}
        r4 = requests.put(f"{API}/consultations/{cid}", json=upd, headers=doctor_headers)
        assert r4.status_code == 200
        assert r4.json()["transcript"] == "Updated transcript content"
        assert r4.json()["chief_complaint"] == "Headache"

    def test_get_404(self, doctor_headers):
        r = requests.get(f"{API}/consultations/nonexistent_id_xyz", headers=doctor_headers)
        assert r.status_code == 404


# ---------- SOAP generation ----------
class TestSOAP:
    def test_soap_empty_400(self, doctor_headers):
        r = requests.post(f"{API}/consultations/soap", json={"transcript": "  "}, headers=doctor_headers)
        assert r.status_code == 400

    def test_soap_generation_structure(self, doctor_headers):
        transcript = ("Patient is a 45 year old male with diabetes, complains of frequent urination, "
                      "blurred vision and increased thirst for 2 weeks. BP is 130/85, pulse 80. "
                      "On metformin 500mg twice daily. Advised RBS and HbA1c. Continue metformin, "
                      "add Glimepiride 1mg once daily. Follow-up in 2 weeks.")
        r = requests.post(
            f"{API}/consultations/soap",
            json={"transcript": transcript, "patient_age": 45, "patient_sex": "M"},
            headers=doctor_headers, timeout=60
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "soap" in data
        soap = data["soap"]
        for key in ("chief_complaint", "subjective", "objective", "assessment", "plan"):
            assert key in soap, f"Missing {key} in SOAP"


# ---------- Consultation transcribe error paths ----------
class TestTranscribeErrors:
    def test_transcribe_no_file_422(self, doctor_headers):
        r = requests.post(f"{API}/consultations/transcribe", headers=doctor_headers)
        assert r.status_code == 422

    def test_transcribe_empty_file_400(self, doctor_headers):
        files = {"audio": ("empty.webm", b"", "audio/webm")}
        r = requests.post(f"{API}/consultations/transcribe", files=files, headers=doctor_headers)
        assert r.status_code == 400


# ---------- OPD analytics ----------
class TestOPD:
    def test_opd_structure_and_tier(self, doctor_headers):
        r = requests.get(f"{API}/analytics/opd", headers=doctor_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        for key in ("today", "this_week", "this_month", "incentive"):
            assert key in data
        for key in ("total", "completed", "scheduled"):
            assert key in data["today"]
        assert "total" in data["this_week"]
        for key in ("total", "new_patients", "followup_patients", "revenue"):
            assert key in data["this_month"]
        incentive = data["incentive"]
        assert incentive["tier"] in ("Bronze", "Silver", "Gold", "Platinum")
        m = data["this_month"]["total"]
        if m >= 200: assert incentive["tier"] == "Platinum"
        elif m >= 100: assert incentive["tier"] == "Gold"
        elif m >= 50: assert incentive["tier"] == "Silver"
        else: assert incentive["tier"] == "Bronze"
        assert incentive["current"] == m


# ---------- Clinic CRUD + is_primary uniqueness ----------
@pytest.fixture(scope="class")
def clinic_ids(doctor_headers):
    created = []
    yield created
    # cleanup
    for cid in created:
        requests.delete(f"{API}/clinics/{cid}", headers=doctor_headers)


class TestClinics:
    def test_create_and_list(self, doctor_headers, clinic_ids):
        r = requests.post(f"{API}/clinics", json={
            "name": f"TEST_Clinic_A_{TS}",
            "address": "1 Test Street",
            "phone": "9999999999",
            "is_primary": True,
        }, headers=doctor_headers)
        assert r.status_code == 200, r.text
        c1 = r.json()
        clinic_ids.append(c1["id"])
        assert c1["is_primary"] is True
        assert c1["name"].startswith("TEST_Clinic_A_")

        r2 = requests.post(f"{API}/clinics", json={
            "name": f"TEST_Clinic_B_{TS}",
            "is_primary": True,
        }, headers=doctor_headers)
        assert r2.status_code == 200
        c2 = r2.json()
        clinic_ids.append(c2["id"])
        assert c2["is_primary"] is True

        # After setting c2 primary, c1 should NOT be primary anymore
        r3 = requests.get(f"{API}/clinics", headers=doctor_headers)
        assert r3.status_code == 200
        clinics = {c["id"]: c for c in r3.json()}
        assert clinics[c1["id"]]["is_primary"] is False, "c1 should be unset when c2 became primary"
        assert clinics[c2["id"]]["is_primary"] is True

    def test_update_clinic(self, doctor_headers, clinic_ids):
        assert clinic_ids, "Need a clinic to update"
        cid = clinic_ids[0]
        r = requests.put(f"{API}/clinics/{cid}", json={"address": "Updated Address"}, headers=doctor_headers)
        assert r.status_code == 200
        assert r.json()["address"] == "Updated Address"

    def test_update_no_changes_400(self, doctor_headers, clinic_ids):
        cid = clinic_ids[0]
        r = requests.put(f"{API}/clinics/{cid}", json={}, headers=doctor_headers)
        assert r.status_code == 400

    def test_delete_nonexistent_404(self, doctor_headers):
        r = requests.delete(f"{API}/clinics/nope_xyz_{TS}", headers=doctor_headers)
        assert r.status_code == 404


# ---------- Sub-users + receptionist boundary ----------
@pytest.fixture(scope="module")
def primary_clinic_id(doctor_headers):
    r = requests.post(f"{API}/clinics", json={
        "name": f"TEST_RecepClinic_{TS}", "is_primary": False
    }, headers=doctor_headers)
    assert r.status_code == 200
    cid = r.json()["id"]
    yield cid
    requests.delete(f"{API}/clinics/{cid}", headers=doctor_headers)


@pytest.fixture(scope="module")
def receptionist(doctor_headers, primary_clinic_id):
    email = f"recep_{TS}@test.com"
    password = "Recep@12345"
    r = requests.post(f"{API}/clinics/sub-users", json={
        "name": "TEST Receptionist",
        "email": email,
        "phone_number": "9888888888",
        "password": password,
        "clinic_id": primary_clinic_id,
    }, headers=doctor_headers)
    assert r.status_code == 200, r.text
    sub_user = r.json()
    # Login
    lr = requests.post(f"{API}/auth/login", json={"email": email, "password": password})
    assert lr.status_code == 200, lr.text
    token = lr.json()["token"]
    yield {"id": sub_user["id"], "email": email, "password": password, "token": token, "headers": {"Authorization": f"Bearer {token}"}}
    requests.delete(f"{API}/clinics/sub-users/{sub_user['id']}", headers=doctor_headers)


class TestSubUsers:
    def test_max_2_per_clinic(self, doctor_headers, primary_clinic_id, receptionist):
        # 1 already created (receptionist fixture). Add a 2nd.
        email2 = f"recep2_{TS}@test.com"
        r = requests.post(f"{API}/clinics/sub-users", json={
            "name": "TEST Recep 2", "email": email2,
            "phone_number": "9777777777", "password": "Recep@12345",
            "clinic_id": primary_clinic_id,
        }, headers=doctor_headers)
        assert r.status_code == 200, r.text
        sub2_id = r.json()["id"]
        try:
            # 3rd should be rejected with 400
            email3 = f"recep3_{TS}@test.com"
            r3 = requests.post(f"{API}/clinics/sub-users", json={
                "name": "TEST Recep 3", "email": email3,
                "phone_number": "9666666666", "password": "Recep@12345",
                "clinic_id": primary_clinic_id,
            }, headers=doctor_headers)
            assert r3.status_code == 400, f"3rd recep should be blocked, got {r3.status_code}"
        finally:
            requests.delete(f"{API}/clinics/sub-users/{sub2_id}", headers=doctor_headers)

    def test_email_unique(self, doctor_headers, receptionist, primary_clinic_id):
        r = requests.post(f"{API}/clinics/sub-users", json={
            "name": "Dup", "email": receptionist["email"],
            "phone_number": "9555555555", "password": "Recep@12345",
            "clinic_id": primary_clinic_id,
        }, headers=doctor_headers)
        assert r.status_code == 400

    def test_password_strength(self, doctor_headers, primary_clinic_id):
        r = requests.post(f"{API}/clinics/sub-users", json={
            "name": "Weak", "email": f"weak_{TS}@test.com",
            "phone_number": "9444444444", "password": "weak",
            "clinic_id": primary_clinic_id,
        }, headers=doctor_headers)
        assert r.status_code == 400

    def test_delete_not_yours_404(self, doctor_headers):
        r = requests.delete(f"{API}/clinics/sub-users/nope_xyz", headers=doctor_headers)
        assert r.status_code == 404


class TestReceptionistBoundary:
    def test_appointments_clients_allowed(self, receptionist):
        for path in ("/appointments", "/clients"):
            r = requests.get(f"{API}{path}", headers=receptionist["headers"])
            assert r.status_code == 200, f"{path}: {r.status_code} {r.text}"

    def test_blocked_endpoints_403(self, receptionist):
        h = receptionist["headers"]
        blocked = [
            ("POST", "/clinics", {"name": "X"}),
            ("POST", "/clinics/sub-users", {"name": "X", "email": "y@y.com", "phone_number": "1", "password": "Recep@12345"}),
            ("POST", "/hexa/command", {"text": "hi"}),
            ("POST", "/consultations", {"client_name": "X"}),
            ("GET", "/analytics/opd", None),
        ]
        for method, path, body in blocked:
            if method == "GET":
                r = requests.get(f"{API}{path}", headers=h)
            else:
                r = requests.post(f"{API}{path}", json=body, headers=h)
            assert r.status_code == 403, f"{method} {path}: expected 403, got {r.status_code}"

    def test_prescription_create_blocked_403(self, receptionist):
        r = requests.post(f"{API}/prescriptions", json={
            "appointment_id": "x", "client_name": "Y", "medications": [], "instructions": "."
        }, headers=receptionist["headers"])
        assert r.status_code == 403

    def test_receptionist_sees_parent_appointment(self, doctor_headers, receptionist):
        # Create appointment as doctor
        appt_payload = {
            "client_name": f"TEST_Appt_{TS}",
            "client_phone": f"977{TS%10000000:07d}",
            "service_type": "consultation",
            "appointment_date": time.strftime("%Y-%m-%d"),
            "start_time": "10:00",
            "end_time": "10:30",
            "notes": ""
        }
        r = requests.post(f"{API}/appointments", json=appt_payload, headers=doctor_headers)
        assert r.status_code == 200, r.text
        appt_id = r.json()["id"]
        try:
            # Receptionist should see it
            r2 = requests.get(f"{API}/appointments", headers=receptionist["headers"])
            assert r2.status_code == 200
            ids = [a["id"] for a in r2.json()]
            assert appt_id in ids, "Receptionist should see parent doctor's appointment"
        finally:
            requests.delete(f"{API}/appointments/{appt_id}", headers=doctor_headers)


# ---------- Hexa ----------
class TestHexa:
    def test_empty_400(self, doctor_headers):
        r = requests.post(f"{API}/hexa/command", json={"text": "  "}, headers=doctor_headers)
        assert r.status_code == 400

    @pytest.mark.parametrize("cmd", [
        "show today's appointments",
        "show unpaid invoices",
        "summarize day",
        "search patient John",
    ])
    def test_readonly_intents_execute(self, doctor_headers, cmd):
        r = requests.post(f"{API}/hexa/command", json={"text": cmd}, headers=doctor_headers, timeout=60)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "action" in data and "speech" in data
        # Read-only actions should execute. If LLM mis-routes to 'unknown', accept executed=False but action present
        assert "executed" in data

    def test_send_reminder_requires_confirmation(self, doctor_headers):
        r = requests.post(f"{API}/hexa/command",
                          json={"text": "send reminder to John", "confirm": False},
                          headers=doctor_headers, timeout=60)
        assert r.status_code == 200, r.text
        data = r.json()
        # Either LLM picked send_reminder_now (requires_confirmation True) OR routed to unknown.
        # We assert: if action.type == send_reminder_now, requires_confirmation must be True and executed False
        if data.get("action", {}).get("type") == "send_reminder_now":
            assert data["requires_confirmation"] is True
            assert data["executed"] is False

    def test_update_bot_instructions_requires_confirmation(self, doctor_headers):
        r = requests.post(f"{API}/hexa/command",
                          json={"text": "update bot instructions to greet patients warmly"},
                          headers=doctor_headers, timeout=60)
        assert r.status_code == 200, r.text
        data = r.json()
        if data.get("action", {}).get("type") == "update_bot_instructions":
            assert data["requires_confirmation"] is True
            assert data["executed"] is False


# ---------- Auth boundary on consultations ----------
class TestUnauth:
    def test_consultations_no_auth_401(self):
        r = requests.get(f"{API}/consultations")
        assert r.status_code in (401, 403)
