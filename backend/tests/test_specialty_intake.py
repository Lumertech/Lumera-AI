"""Backend tests for Specialty & Intake Rules feature"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "sarah@test.com", "password": "test123456"})
    assert r.status_code == 200, f"Login failed: {r.text}"
    return r.json()["token"]

@pytest.fixture(scope="module")
def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}

# --- GET /workspace/specialty-rules ---
def test_get_specialty_rules_authenticated(auth_headers):
    r = requests.get(f"{BASE_URL}/api/workspace/specialty-rules", headers=auth_headers)
    assert r.status_code == 200
    data = r.json()
    assert "services" in data
    assert "triage_keywords" in data
    assert isinstance(data["services"], list)
    assert isinstance(data["triage_keywords"], list)

def test_get_specialty_rules_unauthenticated():
    r = requests.get(f"{BASE_URL}/api/workspace/specialty-rules")
    assert r.status_code == 401

# --- PUT /workspace/specialty-rules ---
def test_put_specialty_rules_valid(auth_headers):
    payload = {
        "services": [
            {"name": "Test Service", "enable_photo_upload": True, "enable_document_upload": False, "custom_questions": ["Any allergies?"]}
        ],
        "triage_keywords": [
            {"keyword": "chest pain", "severity": "High", "emergency_number": "112"}
        ]
    }
    r = requests.put(f"{BASE_URL}/api/workspace/specialty-rules", json=payload, headers=auth_headers)
    assert r.status_code == 200
    data = r.json()
    assert data["services"] == 1
    assert data["triage_keywords"] == 1

def test_put_specialty_rules_invalid_severity(auth_headers):
    payload = {
        "services": [],
        "triage_keywords": [
            {"keyword": "pain", "severity": "CRITICAL", "emergency_number": ""}
        ]
    }
    r = requests.put(f"{BASE_URL}/api/workspace/specialty-rules", json=payload, headers=auth_headers)
    assert r.status_code == 400

def test_get_specialty_rules_persistence(auth_headers):
    """Verify saved rules persist"""
    r = requests.get(f"{BASE_URL}/api/workspace/specialty-rules", headers=auth_headers)
    assert r.status_code == 200
    data = r.json()
    assert len(data["services"]) == 1
    assert data["services"][0]["name"] == "Test Service"

# --- GET /workspace/specialty-defaults/{specialty} ---
def test_get_specialty_defaults_cardiologist(auth_headers):
    r = requests.get(f"{BASE_URL}/api/workspace/specialty-defaults/Cardiologist", headers=auth_headers)
    assert r.status_code == 200
    data = r.json()
    assert "services" in data
    assert "triage_keywords" in data
    # Cardiologist should have cardiac-specific services
    service_names = [s["name"] for s in data["services"]]
    assert any("cardiac" in n.lower() or "cardio" in n.lower() or "ecg" in n.lower() for n in service_names), f"No cardiology service found: {service_names}"

def test_get_specialty_defaults_unknown(auth_headers):
    r = requests.get(f"{BASE_URL}/api/workspace/specialty-defaults/UnknownSpecialty", headers=auth_headers)
    assert r.status_code == 200
    data = r.json()
    # Returns default rules
    assert "services" in data

# --- PUT /auth/specialty ---
def test_put_auth_specialty(auth_headers):
    r = requests.put(f"{BASE_URL}/api/auth/specialty", json={"specialty": "Cardiologist"}, headers=auth_headers)
    assert r.status_code == 200
    data = r.json()
    assert data.get("specialty") == "Cardiologist"

def test_put_auth_specialty_verify(auth_headers):
    """Verify specialty was updated in user doc"""
    r = requests.get(f"{BASE_URL}/api/auth/me", headers=auth_headers)
    assert r.status_code == 200
    data = r.json()
    assert data.get("specialty") == "Cardiologist"

def test_reset_specialty(auth_headers):
    """Reset specialty back"""
    requests.put(f"{BASE_URL}/api/auth/specialty", json={"specialty": "General Physician"}, headers=auth_headers)
