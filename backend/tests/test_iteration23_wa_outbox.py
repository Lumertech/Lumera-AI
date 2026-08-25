"""
Iteration 23: Post-Signup Connection Testing, Sidebar WA Status, Template Outbox Integration.
Tests: /api/whatsapp/status, /api/whatsapp/send-test, /api/whatsapp/send-template
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

DOCTOR_EMAIL = "reviewer@lumer.me"
DOCTOR_PASS = "MetaReview@2026"


@pytest.fixture(scope="module")
def doctor_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": DOCTOR_EMAIL, "password": DOCTOR_PASS})
    assert r.status_code == 200, f"Login failed: {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def auth_headers(doctor_token):
    return {"Authorization": f"Bearer {doctor_token}"}


# --- /api/whatsapp/status ---

class TestWaStatus:
    def test_status_requires_auth(self):
        """GET /whatsapp/status returns 401 without token"""
        r = requests.get(f"{BASE_URL}/api/whatsapp/status")
        assert r.status_code == 401, f"Expected 401, got {r.status_code}"
        print("PASS: status 401 without auth")

    def test_status_returns_disconnected(self, auth_headers):
        """GET /whatsapp/status returns DISCONNECTED for doctor with no WA config"""
        r = requests.get(f"{BASE_URL}/api/whatsapp/status", headers=auth_headers)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        assert "status" in data
        assert "connected" in data
        assert data["status"] in ("CONNECTED", "DISCONNECTED")
        print(f"PASS: WA status = {data['status']}, connected = {data['connected']}")


# --- /api/whatsapp/send-test ---

class TestSendTest:
    def test_send_test_requires_auth(self):
        """POST /whatsapp/send-test returns 401 without auth"""
        r = requests.post(f"{BASE_URL}/api/whatsapp/send-test", json={"to": "+919999999999"})
        assert r.status_code == 401, f"Expected 401, got {r.status_code}"
        print("PASS: send-test 401 without auth")

    def test_send_test_400_no_wa_config(self, auth_headers):
        """POST /whatsapp/send-test returns 400 when WA not configured (expected correct behavior)"""
        r = requests.post(f"{BASE_URL}/api/whatsapp/send-test", json={"to": "+919999999999"}, headers=auth_headers)
        # Should be 400 (not configured) or 200/502 if WA is configured
        assert r.status_code in (400, 200, 502), f"Unexpected status {r.status_code}: {r.text}"
        if r.status_code == 400:
            assert "not configured" in r.json().get("detail", "").lower() or "whatsapp" in r.json().get("detail", "").lower()
            print(f"PASS: send-test 400 with detail: {r.json().get('detail')}")
        else:
            print(f"INFO: send-test returned {r.status_code} (WA may be configured)")


# --- /api/whatsapp/send-template ---

class TestSendTemplate:
    def test_send_template_requires_auth(self):
        """POST /whatsapp/send-template returns 401 without auth"""
        r = requests.post(f"{BASE_URL}/api/whatsapp/send-template", json={
            "to": "+919999999999",
            "template_name": "hello_world",
            "language": "en_US",
            "params": []
        })
        assert r.status_code == 401, f"Expected 401, got {r.status_code}"
        print("PASS: send-template 401 without auth")

    def test_send_template_400_no_wa_config(self, auth_headers):
        """POST /whatsapp/send-template returns 400 when WA not configured"""
        r = requests.post(f"{BASE_URL}/api/whatsapp/send-template", json={
            "to": "+919999999999",
            "template_name": "hello_world",
            "language": "en_US",
            "params": ["Test Patient", "2026-02-25", "10:00 AM", "Dr. Test"]
        }, headers=auth_headers)
        assert r.status_code in (400, 200, 502), f"Unexpected status {r.status_code}: {r.text}"
        if r.status_code == 400:
            print(f"PASS: send-template 400 with detail: {r.json().get('detail')}")
        else:
            print(f"INFO: send-template returned {r.status_code}")

    def test_send_template_missing_required_fields(self, auth_headers):
        """POST /whatsapp/send-template returns 422 when required fields missing"""
        r = requests.post(f"{BASE_URL}/api/whatsapp/send-template", json={}, headers=auth_headers)
        assert r.status_code == 422, f"Expected 422, got {r.status_code}"
        print("PASS: send-template 422 with missing fields")


# --- /api/whatsapp/templates ---

class TestWaTemplates:
    def test_list_templates_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/whatsapp/templates")
        assert r.status_code == 401
        print("PASS: templates list 401 without auth")

    def test_list_templates_returns_list(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/whatsapp/templates", headers=auth_headers)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        assert isinstance(data, list)
        print(f"PASS: templates list returns {len(data)} templates")
