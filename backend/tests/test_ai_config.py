"""Tests for AI Config endpoints: GET/PUT /api/workspace/ai-config"""
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

def test_get_ai_config_default(auth_headers):
    """GET returns default values for fresh config"""
    r = requests.get(f"{BASE_URL}/api/workspace/ai-config", headers=auth_headers)
    assert r.status_code == 200
    data = r.json()
    assert "persona_name" in data
    assert "tone" in data
    assert data["tone"] in ("Professional", "Empathetic", "Direct", "")
    assert "working_hours" in data
    assert "emergency_number" in data
    assert "custom_system_instructions" in data
    assert "special_guidelines" in data

def test_put_ai_config_saves_and_persists(auth_headers):
    """PUT saves all fields and GET confirms persistence"""
    payload = {
        "persona_name": "Dr. Sarah AI",
        "tone": "Empathetic",
        "working_hours": "9am-5pm",
        "emergency_number": "+911234567890",
        "custom_system_instructions": "Always be kind",
        "special_guidelines": "Follow HIPAA"
    }
    r = requests.put(f"{BASE_URL}/api/workspace/ai-config", json=payload, headers=auth_headers)
    assert r.status_code == 200
    assert r.json().get("message") == "AI config saved"

    # Verify persistence
    r2 = requests.get(f"{BASE_URL}/api/workspace/ai-config", headers=auth_headers)
    assert r2.status_code == 200
    data = r2.json()
    assert data["persona_name"] == "Dr. Sarah AI"
    assert data["tone"] == "Empathetic"
    assert data["working_hours"] == "9am-5pm"
    assert data["emergency_number"] == "+911234567890"
    assert data["custom_system_instructions"] == "Always be kind"
    assert data["special_guidelines"] == "Follow HIPAA"

def test_put_invalid_tone_returns_400(auth_headers):
    """PUT with invalid tone returns HTTP 400"""
    r = requests.put(f"{BASE_URL}/api/workspace/ai-config", json={"tone": "Rude"}, headers=auth_headers)
    assert r.status_code == 400

def test_get_unauthenticated_returns_401():
    """Unauthenticated GET returns 401"""
    r = requests.get(f"{BASE_URL}/api/workspace/ai-config")
    assert r.status_code == 401

def test_put_unauthenticated_returns_401():
    """Unauthenticated PUT returns 401"""
    r = requests.put(f"{BASE_URL}/api/workspace/ai-config", json={"tone": "Direct"})
    assert r.status_code == 401
