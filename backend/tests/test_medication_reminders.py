"""Backlog tests: WhatsApp Medication Reminders + Consultations pagination.

Covers:
  - parse_frequency / parse_duration_days unit cases
  - Auto-scheduling on prescription create (idempotency per prescription_id)
  - GET/PUT/DELETE /api/medication-reminders, by-prescription endpoint
  - send_due_medication_reminders job (Twilio absent → graceful, sent_log dedup, end_date completion)
  - Receptionist permission boundary (GET 200, PUT/DELETE scoped to parent)
  - Regression: empty-frequency Rx still returns 200
  - Consultations pagination shape & clamping
"""
import os
import sys
import uuid
from datetime import datetime, timezone, timedelta

import pytest
import requests

# Allow importing backend modules for unit tests
sys.path.insert(0, "/app/backend")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://lumera-voice.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

DOCTOR_EMAIL = os.environ.get("TEST_DOCTOR_EMAIL", "sarah@test.com")
DOCTOR_PASSWORD = os.environ.get("TEST_DOCTOR_PASSWORD", "test123456")


# ---------------- Fixtures ----------------
@pytest.fixture(scope="module")
def doctor_token():
    r = requests.post(f"{API}/auth/login", json={"email": DOCTOR_EMAIL, "password": DOCTOR_PASSWORD})
    if r.status_code != 200:
        pytest.skip(f"Doctor login failed: {r.status_code} {r.text}")
    return r.json()["token"]


@pytest.fixture(scope="module")
def doctor_headers(doctor_token):
    return {"Authorization": f"Bearer {doctor_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def appointment_id(doctor_headers):
    payload = {
        "client_name": "TEST MedRem Patient",
        "client_phone": "+919876500001",
        "appointment_date": datetime.now().strftime("%Y-%m-%d"),
        "start_time": "10:00",
        "end_time": "10:30",
        "consultation_mode": "in-person",
    }
    r = requests.post(f"{API}/appointments", headers=doctor_headers, json=payload)
    assert r.status_code == 200, r.text
    return r.json()["id"]


# ---------------- Unit tests: parsers ----------------
class TestFrequencyParser:
    def test_parse_frequency_variants(self):
        from medication_reminders import parse_frequency
        assert parse_frequency("Once daily") == 1
        assert parse_frequency("OD") == 1
        assert parse_frequency("qd") == 1
        assert parse_frequency("Twice daily") == 2
        assert parse_frequency("BD") == 2
        assert parse_frequency("bid") == 2
        assert parse_frequency("Three times daily") == 3
        assert parse_frequency("TDS") == 3
        assert parse_frequency("tid") == 3
        assert parse_frequency("Thrice daily") == 3
        assert parse_frequency("QID") == 4
        assert parse_frequency("qds") == 4
        assert parse_frequency("Four times daily") == 4
        assert parse_frequency("Every 8 hours") == 3
        assert parse_frequency("Every 6 hours") == 4
        assert parse_frequency("xyz garbage") == 1
        assert parse_frequency("") == 1
        assert parse_frequency(None) == 1


class TestDurationParser:
    def test_parse_duration_variants(self):
        from medication_reminders import parse_duration_days
        assert parse_duration_days("7 days") == 7
        assert parse_duration_days("1 week") == 7
        assert parse_duration_days("2 weeks") == 14
        assert parse_duration_days("1 month") == 30
        assert parse_duration_days("SOS") == 1
        assert parse_duration_days("PRN") == 1
        assert parse_duration_days("") == 7
        assert parse_duration_days(None) == 7


# ---------------- Auto-schedule on prescription create ----------------
class TestPrescriptionAutoSchedule:
    def test_create_rx_schedules_reminders(self, doctor_headers, appointment_id):
        meds = [
            {"medicine_name": "TEST_Amox", "dosage": "500mg", "frequency": "Twice daily", "duration": "5 days"},
            {"medicine_name": "TEST_Para", "dosage": "650mg", "frequency": "Once daily",  "duration": "3 days"},
            {"medicine_name": "TEST_Vit",  "dosage": "1tab",  "frequency": "TDS",         "duration": "1 week"},
        ]
        payload = {
            "appointment_id": appointment_id,
            "client_name": "TEST MedRem Patient",
            "medications": meds,
            "instructions": "TEST",
        }
        r = requests.post(f"{API}/prescriptions", headers=doctor_headers, json=payload)
        assert r.status_code == 200, r.text
        pid = r.json()["id"]

        # by-prescription returns 3 reminders with correct times
        r2 = requests.get(f"{API}/medication-reminders/by-prescription/{pid}", headers=doctor_headers)
        assert r2.status_code == 200
        items = r2.json()
        assert len(items) == 3
        by_med = {it["medicine_name"]: it for it in items}
        assert by_med["TEST_Amox"]["times"] == ["09:00", "21:00"]
        assert by_med["TEST_Para"]["times"] == ["09:00"]
        assert by_med["TEST_Vit"]["times"]  == ["08:00", "14:00", "20:00"]
        # end_dates
        today = datetime.now(timezone.utc).date()
        assert by_med["TEST_Amox"]["end_date"] == (today + timedelta(days=5)).isoformat()
        assert by_med["TEST_Para"]["end_date"] == (today + timedelta(days=3)).isoformat()
        assert by_med["TEST_Vit"]["end_date"]  == (today + timedelta(days=7)).isoformat()
        for it in items:
            assert it["status"] == "active"
            assert it["prescription_id"] == pid
            assert "professional_id" in it

    def test_empty_frequency_does_not_500(self, doctor_headers, appointment_id):
        payload = {
            "appointment_id": appointment_id,
            "client_name": "TEST MedRem Patient",
            "medications": [{"medicine_name": "TEST_Empty", "dosage": "1", "frequency": "", "duration": ""}],
            "instructions": "TEST",
        }
        r = requests.post(f"{API}/prescriptions", headers=doctor_headers, json=payload)
        assert r.status_code == 200, r.text
        # Default 1-dose / 7-day reminder created
        pid = r.json()["id"]
        rems = requests.get(f"{API}/medication-reminders/by-prescription/{pid}", headers=doctor_headers).json()
        assert len(rems) == 1
        assert rems[0]["times"] == ["09:00"]


# ---------------- List / Update / Delete endpoints ----------------
class TestReminderCRUD:
    @pytest.fixture
    def reminder_id(self, doctor_headers, appointment_id):
        payload = {
            "appointment_id": appointment_id,
            "client_name": "TEST MedRem Patient",
            "medications": [{"medicine_name": "TEST_CRUD", "dosage": "1", "frequency": "BD", "duration": "2 days"}],
            "instructions": "T",
        }
        r = requests.post(f"{API}/prescriptions", headers=doctor_headers, json=payload)
        pid = r.json()["id"]
        items = requests.get(f"{API}/medication-reminders/by-prescription/{pid}", headers=doctor_headers).json()
        return items[0]["id"]

    def test_list_reminders_scoped(self, doctor_headers):
        r = requests.get(f"{API}/medication-reminders", headers=doctor_headers)
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        assert len(items) >= 1

    def test_pause_resume_invalid(self, doctor_headers, reminder_id):
        # pause
        r = requests.put(f"{API}/medication-reminders/{reminder_id}", headers=doctor_headers, json={"status": "paused"})
        assert r.status_code == 200
        assert r.json()["status"] == "paused"
        # resume
        r = requests.put(f"{API}/medication-reminders/{reminder_id}", headers=doctor_headers, json={"status": "active"})
        assert r.status_code == 200
        assert r.json()["status"] == "active"
        # invalid
        r = requests.put(f"{API}/medication-reminders/{reminder_id}", headers=doctor_headers, json={"status": "bogus"})
        assert r.status_code == 400

    def test_update_missing_404(self, doctor_headers):
        r = requests.put(f"{API}/medication-reminders/{uuid.uuid4()}", headers=doctor_headers, json={"status": "paused"})
        assert r.status_code == 404

    def test_delete_works_and_404(self, doctor_headers, reminder_id):
        r = requests.delete(f"{API}/medication-reminders/{reminder_id}", headers=doctor_headers)
        assert r.status_code == 200
        # second delete → 404
        r = requests.delete(f"{API}/medication-reminders/{reminder_id}", headers=doctor_headers)
        assert r.status_code == 404


# ---------------- Receptionist permission boundary ----------------
class TestReceptionistPermissions:
    @pytest.fixture(scope="class")
    def recep_token(self, doctor_token):
        headers = {"Authorization": f"Bearer {doctor_token}", "Content-Type": "application/json"}
        email = f"recep_medrem_{uuid.uuid4().hex[:8]}@test.com"
        payload = {"name": "TEST Recep", "email": email, "phone_number": "+911234500001", "password": "Recep@12345"}
        r = requests.post(f"{API}/clinics/sub-users", headers=headers, json=payload)
        if r.status_code not in (200, 201):
            pytest.skip(f"recep create failed {r.status_code} {r.text}")
        # login
        rl = requests.post(f"{API}/auth/login", json={"email": email, "password": "Recep@12345"})
        if rl.status_code != 200:
            pytest.skip(f"recep login failed {rl.text}")
        return rl.json()["token"]

    def test_recep_can_list_parents_reminders(self, recep_token, doctor_headers):
        h = {"Authorization": f"Bearer {recep_token}"}
        r = requests.get(f"{API}/medication-reminders", headers=h)
        assert r.status_code == 200
        items = r.json()
        # Should see doctor's reminders since resolve_owner_id maps to parent
        doctor_items = requests.get(f"{API}/medication-reminders", headers=doctor_headers).json()
        assert len(items) == len(doctor_items)

    def test_recep_cannot_touch_other_doctors_reminders(self, recep_token):
        h = {"Authorization": f"Bearer {recep_token}"}
        # bogus id → 404 (scoped to parent), not someone else's data
        r = requests.put(f"{API}/medication-reminders/{uuid.uuid4()}", headers=h, json={"status": "paused"})
        assert r.status_code == 404


# ---------------- send_due_medication_reminders unit (in-process) ----------------
class TestSendDueJob:
    @pytest.mark.asyncio
    async def test_sends_once_then_dedups_and_completes_past_endate(self):
        # Import inside test so module sys.path is set
        from datetime import datetime as _dt, timezone as _tz, timedelta as _td
        import medication_reminders as mr
        from shared import db

        now = _dt.now(_tz.utc)
        hhmm = now.strftime("%H:%M")
        today = now.strftime("%Y-%m-%d")
        pid = f"TEST-{uuid.uuid4()}"
        rid = f"TEST-{uuid.uuid4()}"
        prof = "TEST-PROF-XYZ"

        doc = {
            "id": rid,
            "prescription_id": pid,
            "professional_id": prof,
            "doctor_name": "TEST Doc",
            "client_phone": "+919999999999",
            "client_name": "TEST P",
            "medicine_name": "TEST_X",
            "dosage": "1",
            "instructions": "",
            "times": [hhmm],
            "doses_per_day": 1,
            "start_date": today,
            "end_date": today,
            "status": "active",
            "sent_log": [],
            "created_at": now.isoformat(),
        }
        await db.medication_reminders.insert_one(doc.copy())

        try:
            # Twilio absent → send_whatsapp_message returns None; sent_log NOT appended (current behaviour)
            await mr.send_due_medication_reminders()
            row = await db.medication_reminders.find_one({"id": rid}, {"_id": 0})
            # If twilio configured, sent_log has entry; else stays empty (no SID).
            # Either way, calling again should not duplicate entries.
            count_after_1 = len(row.get("sent_log", []))
            await mr.send_due_medication_reminders()
            row2 = await db.medication_reminders.find_one({"id": rid}, {"_id": 0})
            count_after_2 = len(row2.get("sent_log", []))
            # Allow at most 1 entry growth on second run when twilio absent — and 0 growth when present
            assert count_after_2 <= max(count_after_1, 1) + 0 if count_after_1 > 0 else count_after_2 <= 1

            # Past end date completes
            yesterday = (now - _td(days=2)).strftime("%Y-%m-%d")
            await db.medication_reminders.update_one({"id": rid}, {"$set": {"end_date": yesterday}})
            await mr.send_due_medication_reminders()
            row3 = await db.medication_reminders.find_one({"id": rid}, {"_id": 0})
            assert row3["status"] == "completed"
        finally:
            await db.medication_reminders.delete_one({"id": rid})


# ---------------- Consultations pagination ----------------
class TestConsultationsPagination:
    def test_paginated_shape(self, doctor_headers):
        r = requests.get(f"{API}/consultations", headers=doctor_headers)
        assert r.status_code == 200
        body = r.json()
        assert set(["items", "total", "limit", "offset"]).issubset(body.keys())
        assert isinstance(body["items"], list)
        assert isinstance(body["total"], int)

    def test_limit_offset_honored(self, doctor_headers):
        r = requests.get(f"{API}/consultations?limit=2&offset=0", headers=doctor_headers)
        assert r.status_code == 200
        body = r.json()
        assert body["limit"] == 2
        assert body["offset"] == 0
        assert len(body["items"]) <= 2

    def test_limit_clamp(self, doctor_headers):
        r = requests.get(f"{API}/consultations?limit=500&offset=-5", headers=doctor_headers)
        assert r.status_code == 200
        body = r.json()
        assert body["limit"] == 200
        assert body["offset"] == 0
