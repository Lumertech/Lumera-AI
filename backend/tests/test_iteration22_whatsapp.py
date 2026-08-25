"""
WhatsApp Onboarding, Webhook Routing, and Template Management - Backend Tests
Iteration 22
"""
import pytest
import requests
import os

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

ADMIN_EMAIL = "admin@lumer.me"
ADMIN_PASS = "admin123"
DOCTOR_EMAIL = "reviewer@lumer.me"
DOCTOR_PASS = "MetaReview@2026"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS})
    assert r.status_code == 200, f"Admin login failed: {r.text}"
    return r.json().get("token")


@pytest.fixture(scope="module")
def doctor_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": DOCTOR_EMAIL, "password": DOCTOR_PASS})
    assert r.status_code == 200, f"Doctor login failed: {r.text}"
    return r.json().get("token")


# --- Public endpoint ---

def test_platform_config_no_auth():
    """GET /api/whatsapp/platform-config returns 200 without auth."""
    r = requests.get(f"{BASE_URL}/api/whatsapp/platform-config")
    assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
    data = r.json()
    assert "app_id" in data
    assert "config_id" in data
    assert "ready" in data
    print(f"platform-config: app_id={data['app_id']!r}, config_id={data['config_id']!r}, ready={data['ready']}")


# --- Auth guarded endpoints ---

def test_status_no_auth():
    """GET /api/whatsapp/status returns 401 without token."""
    r = requests.get(f"{BASE_URL}/api/whatsapp/status")
    assert r.status_code == 401, f"Expected 401, got {r.status_code}"


def test_status_disconnected(doctor_token):
    """GET /api/whatsapp/status returns DISCONNECTED for doctor with no WA connected."""
    r = requests.get(f"{BASE_URL}/api/whatsapp/status",
                     headers={"Authorization": f"Bearer {doctor_token}"})
    assert r.status_code == 200, f"Got {r.status_code}: {r.text}"
    data = r.json()
    assert "status" in data
    assert data["connected"] == False or data["status"] == "DISCONNECTED"
    print(f"WA status: {data['status']}")


def test_templates_no_auth():
    """GET /api/whatsapp/templates returns 401 without token."""
    r = requests.get(f"{BASE_URL}/api/whatsapp/templates")
    assert r.status_code == 401, f"Expected 401, got {r.status_code}"


def test_templates_empty(doctor_token):
    """GET /api/whatsapp/templates returns list (possibly empty) for authenticated doctor."""
    r = requests.get(f"{BASE_URL}/api/whatsapp/templates",
                     headers={"Authorization": f"Bearer {doctor_token}"})
    assert r.status_code == 200, f"Got {r.status_code}: {r.text}"
    data = r.json()
    assert isinstance(data, list)
    print(f"Templates count: {len(data)}")


def test_embedded_signup_returns_400_no_config(doctor_token):
    """POST /api/whatsapp/embedded-signup returns 400 when Meta app not configured."""
    r = requests.post(
        f"{BASE_URL}/api/whatsapp/embedded-signup",
        headers={"Authorization": f"Bearer {doctor_token}"},
        json={"code": "fake_code", "phone_number_id": "123", "waba_id": "456"},
    )
    # 400 is expected because platform Meta app not configured (app_id/app_secret missing)
    assert r.status_code == 400, f"Expected 400, got {r.status_code}: {r.text}"
    print(f"embedded-signup 400 response: {r.json()}")


def test_disconnect_sets_disconnected(doctor_token):
    """POST /api/whatsapp/disconnect sets user status to DISCONNECTED."""
    r = requests.post(
        f"{BASE_URL}/api/whatsapp/disconnect",
        headers={"Authorization": f"Bearer {doctor_token}"},
    )
    assert r.status_code == 200, f"Got {r.status_code}: {r.text}"
    data = r.json()
    assert data.get("status") == "DISCONNECTED"


# --- Admin whatsapp-config ---

def test_admin_whatsapp_config_get(admin_token):
    """GET /api/admin/whatsapp-config returns config including config_id field."""
    r = requests.get(f"{BASE_URL}/api/admin/whatsapp-config",
                     headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200, f"Got {r.status_code}: {r.text}"
    data = r.json()
    assert "config_id" in data
    assert "app_id" in data
    print(f"admin whatsapp-config: {data}")


def test_admin_whatsapp_config_put_config_id(admin_token):
    """PUT /api/admin/whatsapp-config saves config_id correctly."""
    r = requests.put(
        f"{BASE_URL}/api/admin/whatsapp-config",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"config_id": "TEST_config_999"},
    )
    assert r.status_code == 200, f"Got {r.status_code}: {r.text}"
    # Verify it was saved
    r2 = requests.get(f"{BASE_URL}/api/admin/whatsapp-config",
                      headers={"Authorization": f"Bearer {admin_token}"})
    assert r2.status_code == 200
    assert r2.json().get("config_id") == "TEST_config_999"
    print("config_id saved and verified")


# --- Webhook verification ---

def test_meta_whatsapp_webhook_verify():
    """GET /api/meta-whatsapp/webhook with correct verify_token returns 200 with challenge."""
    r = requests.get(f"{BASE_URL}/api/meta-whatsapp/webhook", params={
        "hub.mode": "subscribe",
        "hub.verify_token": "lumera-verify-2026",
        "hub.challenge": "test_challenge_xyz",
    })
    assert r.status_code == 200, f"Got {r.status_code}: {r.text}"
    assert "test_challenge_xyz" in r.text
    print(f"Webhook verify response: {r.text}")
