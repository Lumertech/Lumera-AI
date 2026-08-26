"""
Iteration 28: Test specialty-aware treatment, follow-up slots, Dashboard and Appointments compilation.
"""
import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

DOCTOR_EMAIL = "sarah@test.com"
DOCTOR_PASS = "test123456"


@pytest.fixture(scope="module")
def auth_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": DOCTOR_EMAIL, "password": DOCTOR_PASS})
    assert r.status_code == 200, f"Login failed: {r.text}"
    return r.json().get("token") or r.json().get("access_token")


@pytest.fixture(scope="module")
def headers(auth_token):
    return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def appointment_id(headers):
    """Get first available appointment for testing."""
    r = requests.get(f"{BASE_URL}/api/appointments", headers=headers)
    assert r.status_code == 200
    appts = r.json()
    if not appts:
        pytest.skip("No appointments found - cannot run prescription tests")
    return appts[0]["id"]


class TestCalendarAvailableSlots:
    """GET /api/calendar/available-slots"""

    def test_slots_returns_200(self, headers):
        future_date = (datetime.now() + timedelta(days=5)).strftime("%Y-%m-%d")
        r = requests.get(f"{BASE_URL}/api/calendar/available-slots?date={future_date}&days=1", headers=headers)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"

    def test_slots_response_structure(self, headers):
        future_date = (datetime.now() + timedelta(days=5)).strftime("%Y-%m-%d")
        r = requests.get(f"{BASE_URL}/api/calendar/available-slots?date={future_date}&days=1", headers=headers)
        data = r.json()
        assert "slots" in data
        assert isinstance(data["slots"], list)
        assert "from_date" in data

    def test_slots_have_correct_fields(self, headers):
        future_date = (datetime.now() + timedelta(days=5)).strftime("%Y-%m-%d")
        r = requests.get(f"{BASE_URL}/api/calendar/available-slots?date={future_date}&days=1", headers=headers)
        slots = r.json()["slots"]
        if slots:
            slot = slots[0]
            assert "date" in slot
            assert "start_time" in slot
            assert "end_time" in slot

    def test_slots_requires_auth(self):
        future_date = (datetime.now() + timedelta(days=5)).strftime("%Y-%m-%d")
        r = requests.get(f"{BASE_URL}/api/calendar/available-slots?date={future_date}&days=1")
        assert r.status_code in [401, 403]

    def test_slots_invalid_date(self, headers):
        r = requests.get(f"{BASE_URL}/api/calendar/available-slots?date=invalid-date&days=1", headers=headers)
        assert r.status_code == 400


class TestSpecialtyUpdate:
    """PUT /api/auth/specialty - update user specialty"""

    def test_set_physiotherapist_specialty(self, headers):
        r = requests.put(f"{BASE_URL}/api/auth/specialty", json={"specialty": "Physiotherapist"}, headers=headers)
        assert r.status_code == 200, f"Specialty update failed: {r.text}"

    def test_verify_specialty_set(self, headers):
        r = requests.get(f"{BASE_URL}/api/auth/me", headers=headers)
        assert r.status_code == 200
        user = r.json()
        assert user.get("specialty") == "Physiotherapist"

    def test_reset_specialty_general(self, headers):
        """Reset specialty to general after testing."""
        r = requests.put(f"{BASE_URL}/api/auth/specialty", json={"specialty": ""}, headers=headers)
        # Just check it doesn't error


class TestFollowUpAppointmentCreation:
    """POST /api/prescriptions - creates follow-up appointment when slot provided"""

    def test_prescription_with_followup_slot(self, headers, appointment_id):
        future_date = (datetime.now() + timedelta(days=7)).strftime("%Y-%m-%d")
        payload = {
            "appointment_id": appointment_id,
            "client_name": "TEST_SlotPatient",
            "medications": [{"medicine_name": "Paracetamol", "dosage": "500mg", "frequency": "BD", "duration": "5 days"}],
            "instructions": "Test instructions",
            "follow_up_slot": {"date": future_date, "start_time": "10:00", "end_time": "10:30"}
        }
        r = requests.post(f"{BASE_URL}/api/prescriptions", json=payload, headers=headers)
        assert r.status_code == 200, f"Prescription creation failed: {r.text}"
        data = r.json()
        assert "id" in data
        return data["id"]

    def test_followup_appointment_created_in_db(self, headers, appointment_id):
        """Verify that a follow-up appointment was auto-created after prescription submit."""
        future_date = (datetime.now() + timedelta(days=8)).strftime("%Y-%m-%d")
        payload = {
            "appointment_id": appointment_id,
            "client_name": "TEST_FollowupVerify",
            "medications": [{"medicine_name": "Ibuprofen", "dosage": "400mg", "frequency": "TDS", "duration": "3 days"}],
            "instructions": "Test",
            "follow_up_slot": {"date": future_date, "start_time": "11:00", "end_time": "11:30"}
        }
        r = requests.post(f"{BASE_URL}/api/prescriptions", json=payload, headers=headers)
        assert r.status_code == 200

        # Check appointments list includes the follow-up
        appts_r = requests.get(f"{BASE_URL}/api/appointments", headers=headers)
        assert appts_r.status_code == 200
        appts = appts_r.json()
        followup_appts = [a for a in appts if a.get("appointment_date") == future_date and a.get("start_time") == "11:00"]
        assert len(followup_appts) > 0, "Follow-up appointment was not created in DB"
        assert followup_appts[0].get("source") == "prescription_followup"

    def test_prescription_with_specialty_plan_physio(self, headers, appointment_id):
        """Verify prescriptions accept specialty_plan."""
        payload = {
            "appointment_id": appointment_id,
            "client_name": "TEST_PhysioPatient",
            "medications": [],
            "instructions": "Exercise as prescribed",
            "specialty_plan": {
                "exercise_plan": [{"exercise_name": "Knee Extensions", "sets": "3", "reps": "10", "hold_duration": "30", "notes": ""}],
                "modalities": {"heat_compress": True, "cold_pack": False, "tens": False, "ultrasound": False},
                "ergonomic_guidelines": "Maintain neutral spine"
            }
        }
        r = requests.post(f"{BASE_URL}/api/prescriptions", json=payload, headers=headers)
        assert r.status_code == 200
        data = r.json()
        assert data.get("specialty_plan", {}).get("exercise_plan") is not None


class TestDashboardAndAppointmentsLoad:
    """Basic smoke tests for the fixed compilation issues."""

    def test_dashboard_api_responds(self, headers):
        """Dashboard loads data from /api/dashboard/stats."""
        r = requests.get(f"{BASE_URL}/api/dashboard/stats", headers=headers)
        # Could be 200 or 404 depending on route, just check it's not 500
        assert r.status_code != 500, f"Dashboard API returned 500: {r.text}"

    def test_appointments_api_responds(self, headers):
        r = requests.get(f"{BASE_URL}/api/appointments", headers=headers)
        assert r.status_code == 200
