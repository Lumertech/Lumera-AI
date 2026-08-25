"""
Backend tests for Lumera Phase 1 prescription enhancements:
- Drug Interactions (AI)
- Whisper Transcription
- Private Doctor Notes
- ABHA linking (inline + one-click)
- Tapering schedule (medications)
- Privacy: private notes never sent on WhatsApp
"""
import os
import io
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://lumera-voice.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

DOCTOR_EMAIL = os.environ.get("TEST_DOCTOR_EMAIL", "sarah@test.com")
DOCTOR_PASSWORD = os.environ.get("TEST_DOCTOR_PASSWORD", "test123456")


# ---------------------------- Fixtures ----------------------------

@pytest.fixture(scope="session")
def doctor_token():
    r = requests.post(f"{API}/auth/login", json={"email": DOCTOR_EMAIL, "password": DOCTOR_PASSWORD}, timeout=30)
    if r.status_code != 200:
        pytest.skip(f"Doctor login failed: {r.status_code} {r.text}")
    return r.json()["token"]


@pytest.fixture(scope="session")
def doctor_headers(doctor_token):
    return {"Authorization": f"Bearer {doctor_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def seeded_appointment(doctor_headers):
    """Create a fresh appointment for the test patient with a unique phone."""
    unique_phone = f"+9198{uuid.uuid4().int % 10**8:08d}"
    payload = {
        "client_name": "TEST_Phase1 Patient",
        "client_phone": unique_phone,
        "appointment_date": "2026-01-31",
        "start_time": "10:00",
        "end_time": "10:30",
        "consultation_mode": "in-person",
        "notes": "TEST phase1"
    }
    r = requests.post(f"{API}/appointments", headers=doctor_headers, json=payload, timeout=30)
    assert r.status_code == 200, f"Could not create appointment: {r.status_code} {r.text}"
    appt = r.json()
    return appt


# ---------------------------- 1. Drug Interactions ----------------------------

class TestDrugInteractions:
    def test_interacting_drugs_warfarin_aspirin(self, doctor_headers):
        payload = {
            "medications": [
                {"medicine_name": "Warfarin", "dosage": "5mg", "frequency": "Once daily", "duration": "30 days"},
                {"medicine_name": "Aspirin", "dosage": "75mg", "frequency": "Once daily", "duration": "30 days"},
            ],
            "patient_age": 65,
            "patient_conditions": ["Atrial fibrillation"]
        }
        r = requests.post(f"{API}/prescriptions/drug-interactions", headers=doctor_headers, json=payload, timeout=60)
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        data = r.json()
        assert "alerts" in data and isinstance(data["alerts"], list)
        assert "summary" in data and isinstance(data["summary"], str)
        # Warfarin + Aspirin is a classic high-risk combo; expect at least one alert
        assert len(data["alerts"]) >= 1, f"Expected at least one alert for Warfarin+Aspirin, got: {data}"
        first = data["alerts"][0]
        for key in ("severity", "drugs_involved", "description", "recommendation"):
            assert key in first, f"alert missing key '{key}': {first}"

    def test_non_interacting_single_drug(self, doctor_headers):
        payload = {
            "medications": [
                {"medicine_name": "Paracetamol", "dosage": "500mg", "frequency": "Three times daily", "duration": "5 days"}
            ],
            "patient_age": 30,
            "patient_conditions": []
        }
        r = requests.post(f"{API}/prescriptions/drug-interactions", headers=doctor_headers, json=payload, timeout=60)
        assert r.status_code == 200
        data = r.json()
        assert "alerts" in data and isinstance(data["alerts"], list)
        assert "summary" in data

    def test_empty_medications(self, doctor_headers):
        r = requests.post(f"{API}/prescriptions/drug-interactions", headers=doctor_headers, json={"medications": []}, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert data.get("alerts") == []

    def test_unauthenticated(self):
        r = requests.post(f"{API}/prescriptions/drug-interactions", json={"medications": []}, timeout=15)
        assert r.status_code in (401, 403)


# ---------------------------- 2. Transcribe ----------------------------

class TestTranscribe:
    def test_no_file_returns_422(self, doctor_token):
        # Multipart form without 'audio' field
        r = requests.post(
            f"{API}/prescriptions/transcribe",
            headers={"Authorization": f"Bearer {doctor_token}"},
            data={"language": "en"},
            timeout=15,
        )
        assert r.status_code == 422, f"Expected 422, got {r.status_code}: {r.text}"

    def test_empty_file_returns_400(self, doctor_token):
        files = {"audio": ("empty.webm", b"", "audio/webm")}
        r = requests.post(
            f"{API}/prescriptions/transcribe",
            headers={"Authorization": f"Bearer {doctor_token}"},
            files=files,
            data={"language": "en"},
            timeout=15,
        )
        assert r.status_code == 400, f"Expected 400, got {r.status_code}: {r.text}"

    def test_unauthenticated_returns_401(self):
        files = {"audio": ("x.webm", b"abc", "audio/webm")}
        r = requests.post(f"{API}/prescriptions/transcribe", files=files, timeout=15)
        assert r.status_code in (401, 403)


# ---------------------------- 3. Private notes history ----------------------------

class TestPrivateNotesHistory:
    def test_returns_empty_for_unknown_patient(self, doctor_headers):
        random_phone = f"+9197{uuid.uuid4().int % 10**8:08d}"
        r = requests.get(f"{API}/prescriptions/private-notes/{random_phone}", headers=doctor_headers, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert "notes" in data
        assert isinstance(data["notes"], list)
        assert data["notes"] == []

    def test_unauthenticated(self):
        r = requests.get(f"{API}/prescriptions/private-notes/+919999999999", timeout=15)
        assert r.status_code in (401, 403)


# ---------------------------- 4. Create prescription with new fields ----------------------------

class TestCreatePrescriptionPhase1:
    def test_create_with_private_notes_and_tapering_and_abha_false(self, doctor_headers, seeded_appointment):
        appt = seeded_appointment
        private_note = f"TEST_PRIVATE_NOTE_{uuid.uuid4().hex[:8]}"

        payload = {
            "appointment_id": appt["id"],
            "client_name": appt["client_name"],
            "medications": [
                {
                    "medicine_name": "Prednisolone",
                    "dosage": "40mg",
                    "frequency": "Once daily",
                    "duration": "5 days",
                    "instructions": "After breakfast",
                    "is_tapering": True,
                    "taper_schedule": [
                        {"dosage": "30mg", "frequency": "Once daily", "duration": "5 days", "notes": "Reduce"},
                        {"dosage": "20mg", "frequency": "Once daily", "duration": "5 days", "notes": "Continue reducing"},
                        {"dosage": "10mg", "frequency": "Once daily", "duration": "5 days", "notes": "Final step"},
                    ]
                }
            ],
            "instructions": "Follow tapering carefully.",
            "private_doctor_notes": private_note,
            "link_to_abha": True  # Client has no ABHA -> should remain False without error
        }
        r = requests.post(f"{API}/prescriptions", headers=doctor_headers, json=payload, timeout=60)
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        data = r.json()

        # (a) private_doctor_notes stored
        assert data.get("private_doctor_notes") == private_note

        # (b) WhatsApp send is internal, but we can verify response has whatsapp_sent flag
        assert "whatsapp_sent" in data

        # (c) Medications include tapering
        meds = data.get("medications", [])
        assert meds and meds[0].get("is_tapering") is True
        assert len(meds[0].get("taper_schedule", [])) == 3

        # (d) linked_to_abha must be False because seeded client has no abha_id
        assert data.get("linked_to_abha") is False

        # Persist for downstream tests via test instance attribute on the class via pytest cache
        request_state.update({
            "prescription_id": data["id"],
            "client_phone": appt["client_phone"],
            "private_note": private_note,
        })

    def test_private_notes_history_now_contains_new_note(self, doctor_headers):
        assert "client_phone" in request_state, "Previous test must have created the prescription"
        phone = request_state["client_phone"]
        note = request_state["private_note"]
        r = requests.get(f"{API}/prescriptions/private-notes/{phone}", headers=doctor_headers, timeout=30)
        assert r.status_code == 200
        notes = r.json().get("notes", [])
        found = any(n.get("private_doctor_notes") == note for n in notes)
        assert found, f"Note {note} not found in history. Got: {notes}"

    def test_prescription_text_excludes_private_notes(self, doctor_headers):
        """Verify that the prescription document stored does not leak private notes into a 'message' field
        (private notes are only persisted in private_doctor_notes, not in patient-facing message).
        """
        pid = request_state["prescription_id"]
        r = requests.get(f"{API}/prescriptions", headers=doctor_headers, timeout=30)
        assert r.status_code == 200
        items = r.json()
        target = next((p for p in items if p.get("id") == pid), None)
        assert target is not None
        # Ensure private notes are stored on the doctor-side record
        assert target.get("private_doctor_notes") == request_state["private_note"]
        # Ensure no public/patient-facing rendering of private_doctor_notes within `instructions`
        assert request_state["private_note"] not in (target.get("instructions") or "")


# ---------------------------- 5. ABHA linking ----------------------------

class TestAbhaLinking:
    def test_link_abha_400_when_patient_has_no_abha(self, doctor_headers):
        pid = request_state.get("prescription_id")
        assert pid, "Need prescription created earlier"
        r = requests.post(f"{API}/prescriptions/{pid}/link-abha", headers=doctor_headers, timeout=30)
        assert r.status_code == 400, f"Expected 400, got {r.status_code}: {r.text}"

    def test_link_abha_200_after_adding_abha_to_patient(self, doctor_headers):
        phone = request_state["client_phone"]
        pid = request_state["prescription_id"]
        abha_id = "12345678901234"  # 14 digits

        # Update client ABHA
        upd = requests.put(
            f"{API}/clients/{phone}/abha",
            headers=doctor_headers,
            json={"abha_id": abha_id},
            timeout=30,
        )
        assert upd.status_code == 200, f"{upd.status_code} {upd.text}"

        # Now try linking
        r = requests.post(f"{API}/prescriptions/{pid}/link-abha", headers=doctor_headers, timeout=30)
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        data = r.json()
        assert data.get("abha_id") == abha_id
        assert data.get("success") is True

    def test_create_prescription_links_abha_when_present(self, doctor_headers, seeded_appointment):
        """With ABHA now on file (same phone), creating a new prescription with link_to_abha=true should auto-link."""
        appt = seeded_appointment
        payload = {
            "appointment_id": appt["id"],
            "client_name": appt["client_name"],
            "medications": [
                {"medicine_name": "Amoxicillin", "dosage": "500mg", "frequency": "TID", "duration": "5 days"}
            ],
            "instructions": "Complete the course.",
            "link_to_abha": True
        }
        r = requests.post(f"{API}/prescriptions", headers=doctor_headers, json=payload, timeout=60)
        assert r.status_code == 200
        data = r.json()
        assert data.get("linked_to_abha") is True, f"Expected linked_to_abha=True, got: {data}"
        assert data.get("abha_id") == "12345678901234"


# shared state across tests within the module
request_state: dict = {}
