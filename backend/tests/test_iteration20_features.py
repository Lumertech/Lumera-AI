"""
Iteration 20 tests: Intake Auto-Fill, Day-End Summary, Wait Time Estimator
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

DOCTOR_EMAIL = "sarah@test.com"
DOCTOR_PASS = "test123456"
RAHUL_ID = "dbfcd47b-57c1-47ae-a0ee-032f34feb8fa"
ARUN_ID = "7d12e838-bbeb-4194-b3be-336b63325cfe"
PRIYA_ID = "8634b840-2f72-4e07-a7c8-4cf0a29bac2d"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": DOCTOR_EMAIL, "password": DOCTOR_PASS})
    assert r.status_code == 200, f"Login failed: {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


# ── Backend: Queue Today ──────────────────────────────────────────────────────

class TestQueueToday:
    """GET /api/queue/today"""

    def test_returns_200(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/queue/today", headers=auth_headers)
        assert r.status_code == 200

    def test_has_avg_consult_minutes(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/queue/today", headers=auth_headers)
        d = r.json()
        assert "avg_consult_minutes" in d
        assert isinstance(d["avg_consult_minutes"], (int, float))

    def test_checked_in_appointment_has_wait_time(self, auth_headers):
        """After checking in Arun, he should get estimated_wait_minutes"""
        # First check in Arun
        ci = requests.post(f"{BASE_URL}/api/queue/{ARUN_ID}/check-in", headers=auth_headers)
        assert ci.status_code == 200, f"Check-in failed: {ci.text}"

        r = requests.get(f"{BASE_URL}/api/queue/today", headers=auth_headers)
        d = r.json()
        arun = next((a for a in d["appointments"] if a["id"] == ARUN_ID), None)
        assert arun is not None, "Arun not found in queue"
        assert arun["status"] == "checked_in"
        assert "estimated_wait_minutes" in arun, f"No estimated_wait_minutes on checked_in row: {arun}"
        assert arun["estimated_wait_minutes"] >= 1


# ── Backend: Day-End Summary ──────────────────────────────────────────────────

class TestDayEndSummary:
    """GET /api/queue/day-end-summary"""

    def test_returns_200(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/queue/day-end-summary", headers=auth_headers)
        assert r.status_code == 200

    def test_has_required_fields(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/queue/day-end-summary", headers=auth_headers)
        d = r.json()
        for field in ["patients_seen", "no_shows", "revenue_collected", "outstanding_dues", "avg_consult_minutes", "all_done"]:
            assert field in d, f"Missing field: {field}"

    def test_all_done_false_when_active_appts(self, auth_headers):
        """With Arun in checked_in, all_done should be False"""
        r = requests.get(f"{BASE_URL}/api/queue/day-end-summary", headers=auth_headers)
        d = r.json()
        # Arun is checked_in, so all_done should be False
        assert d["all_done"] is False, f"Expected all_done=False but got {d}"


# ── Backend: Pre-Intake Auto-Captured ─────────────────────────────────────────

class TestPreIntakeAutoCapture:
    """GET /api/appointments/{id} with pre_intake_status=auto_captured"""

    def test_rahul_appointment_has_auto_captured(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/appointments/{RAHUL_ID}", headers=auth_headers)
        assert r.status_code == 200
        d = r.json()
        assert d.get("pre_intake_status") == "auto_captured", f"Expected auto_captured, got {d.get('pre_intake_status')}"

    def test_rahul_appointment_has_symptoms(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/appointments/{RAHUL_ID}", headers=auth_headers)
        d = r.json()
        pre_intake = d.get("pre_intake")
        assert pre_intake is not None, "pre_intake field is None"
        assert pre_intake.get("symptoms"), f"No symptoms in pre_intake: {pre_intake}"
        assert "headache" in pre_intake["symptoms"].lower() or "fever" in pre_intake["symptoms"].lower()

    def test_day_end_all_done_after_completing_all(self, auth_headers):
        """Move Arun to in_consultation then complete, then check all_done"""
        # Priya is already completed; move Arun through pipeline
        r1 = requests.post(f"{BASE_URL}/api/queue/{ARUN_ID}/status", 
                          json={"status": "in_consultation"}, headers=auth_headers)
        assert r1.status_code == 200, f"Start consult failed: {r1.text}"

        r2 = requests.post(f"{BASE_URL}/api/queue/{ARUN_ID}/status",
                          json={"status": "completed"}, headers=auth_headers)
        assert r2.status_code == 200, f"Complete failed: {r2.text}"

        # Now mark Rahul as no_show so all are done
        r3 = requests.post(f"{BASE_URL}/api/queue/{RAHUL_ID}/status",
                          json={"status": "no_show"}, headers=auth_headers)
        # Rahul may need check-in first
        if r3.status_code == 400:
            # Check in first
            requests.post(f"{BASE_URL}/api/queue/{RAHUL_ID}/check-in", headers=auth_headers)
            r3 = requests.post(f"{BASE_URL}/api/queue/{RAHUL_ID}/status",
                              json={"status": "no_show"}, headers=auth_headers)

        summary = requests.get(f"{BASE_URL}/api/queue/day-end-summary", headers=auth_headers)
        d = summary.json()
        assert d["all_done"] is True, f"Expected all_done=True but got {d}"
        assert d["patients_seen"] >= 1
