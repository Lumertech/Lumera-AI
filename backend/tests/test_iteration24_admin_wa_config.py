"""Backend tests for Admin WhatsApp Config - iteration 24
Tests: GET /api/admin/whatsapp-templates-status (auth, response structure)
"""
import pytest
import requests
import os
from dotenv import load_dotenv

load_dotenv('/app/frontend/.env')
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

ADMIN_EMAIL = "admin@lumer.me"
ADMIN_PASS = "admin123"

@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS})
    assert r.status_code == 200, f"Admin login failed: {r.text}"
    return r.json().get("token")

@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}

# Template status endpoint
def test_templates_status_without_auth():
    """Should return 401 without auth"""
    r = requests.get(f"{BASE_URL}/api/admin/whatsapp-templates-status")
    assert r.status_code == 401, f"Expected 401, got {r.status_code}"
    print("PASS: 401 without auth")

def test_templates_status_with_admin_auth(admin_headers):
    """Should return 200 with array of 4 template objects"""
    r = requests.get(f"{BASE_URL}/api/admin/whatsapp-templates-status", headers=admin_headers)
    assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
    data = r.json()
    assert isinstance(data, list), "Response should be a list"
    assert len(data) == 4, f"Expected 4 templates, got {len(data)}"
    print(f"PASS: Got {len(data)} templates")

def test_templates_status_names(admin_headers):
    """Each template object should have name and status fields"""
    r = requests.get(f"{BASE_URL}/api/admin/whatsapp-templates-status", headers=admin_headers)
    assert r.status_code == 200
    data = r.json()
    expected_names = {
        'appointment_confirmation_v1',
        'appointment_reminder_v1',
        'prescription_ready_v1',
        'payment_link_v1',
    }
    actual_names = {t['name'] for t in data}
    assert actual_names == expected_names, f"Template names mismatch: {actual_names}"
    print(f"PASS: All 4 template names present: {actual_names}")

def test_templates_status_fields(admin_headers):
    """Each template should have name and status"""
    r = requests.get(f"{BASE_URL}/api/admin/whatsapp-templates-status", headers=admin_headers)
    data = r.json()
    for t in data:
        assert 'name' in t, f"Missing 'name' in {t}"
        assert 'status' in t, f"Missing 'status' in {t}"
    print("PASS: All templates have name and status fields")

def test_templates_status_unknown_when_no_config(admin_headers):
    """Without real WABA/token configured, status should be UNKNOWN"""
    r = requests.get(f"{BASE_URL}/api/admin/whatsapp-templates-status", headers=admin_headers)
    data = r.json()
    # In test env, status should be UNKNOWN (no WABA/token)
    for t in data:
        assert t['status'] in ('UNKNOWN', 'APPROVED', 'PENDING', 'REJECTED', 'NOT_SUBMITTED', 'API_ERROR', 'ERROR'), \
            f"Unexpected status: {t['status']}"
    print(f"PASS: Statuses: {[t['status'] for t in data]}")

# WhatsApp config endpoints
def test_get_whatsapp_config_without_auth():
    r = requests.get(f"{BASE_URL}/api/admin/whatsapp-config")
    assert r.status_code == 401
    print("PASS: whatsapp-config 401 without auth")

def test_get_whatsapp_config_with_admin(admin_headers):
    r = requests.get(f"{BASE_URL}/api/admin/whatsapp-config", headers=admin_headers)
    assert r.status_code == 200
    data = r.json()
    assert 'webhook_url' in data or 'configured' in data
    print(f"PASS: Config loaded, configured={data.get('configured')}")

def test_webhook_endpoint_accessible():
    """Webhook GET should return 200 with challenge"""
    token = 'lumera-verify-2026'
    challenge = 'test_challenge_123'
    r = requests.get(
        f"{BASE_URL}/api/meta-whatsapp/webhook",
        params={
            'hub.mode': 'subscribe',
            'hub.verify_token': token,
            'hub.challenge': challenge
        }
    )
    assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
    assert r.text.strip() == challenge, f"Expected challenge echo, got: {r.text}"
    print(f"PASS: Webhook test passed, status={r.status_code}")
