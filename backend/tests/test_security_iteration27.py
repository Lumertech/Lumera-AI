"""Security & Admin Governance tests - Iteration 27
Tests: change-password, logout-all, sessions, 2FA, admin suspend/unsuspend, set-role, audit-logs, reset-password
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

DOCTOR_EMAIL = "sarah@test.com"
DOCTOR_PASSWORD = "test123456"
ADMIN_EMAIL = "admin@lumer.me"
ADMIN_PASSWORD = "admin123"


@pytest.fixture(scope="module")
def doctor_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": DOCTOR_EMAIL, "password": DOCTOR_PASSWORD})
    assert r.status_code == 200, f"Doctor login failed: {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/admin/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"Admin login failed: {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def doctor_headers(doctor_token):
    return {"Authorization": f"Bearer {doctor_token}"}


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


class TestChangePassword:
    """POST /auth/change-password"""

    def test_unauthenticated_returns_401(self):
        r = requests.post(f"{BASE_URL}/api/auth/change-password", json={
            "current_password": "test123456", "new_password": "NewPass@1", "confirm_password": "NewPass@1"
        })
        assert r.status_code == 401

    def test_wrong_current_password_returns_400(self, doctor_headers):
        r = requests.post(f"{BASE_URL}/api/auth/change-password",
            json={"current_password": "WRONG_PASSWORD", "new_password": "NewPass@1!", "confirm_password": "NewPass@1!"},
            headers=doctor_headers)
        assert r.status_code == 400
        assert "incorrect" in r.json()["detail"].lower()

    def test_weak_password_no_special_char_returns_400(self, doctor_headers):
        r = requests.post(f"{BASE_URL}/api/auth/change-password",
            json={"current_password": DOCTOR_PASSWORD, "new_password": "WeakPass1", "confirm_password": "WeakPass1"},
            headers=doctor_headers)
        assert r.status_code == 400
        assert "special" in r.json()["detail"].lower()

    def test_mismatched_confirm_returns_400(self, doctor_headers):
        r = requests.post(f"{BASE_URL}/api/auth/change-password",
            json={"current_password": DOCTOR_PASSWORD, "new_password": "NewPass@1!", "confirm_password": "Different@1!"},
            headers=doctor_headers)
        assert r.status_code == 400
        assert "match" in r.json()["detail"].lower()


class TestSessions:
    """GET /auth/sessions"""

    def test_get_sessions_returns_list(self, doctor_headers):
        r = requests.get(f"{BASE_URL}/api/auth/sessions", headers=doctor_headers)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_unauthenticated_returns_401(self):
        r = requests.get(f"{BASE_URL}/api/auth/sessions")
        assert r.status_code == 401


class TestLogoutAll:
    """POST /auth/logout-all"""

    def test_logout_all_returns_new_token(self, doctor_headers):
        r = requests.post(f"{BASE_URL}/api/auth/logout-all", headers=doctor_headers)
        assert r.status_code == 200
        data = r.json()
        assert "token" in data
        assert isinstance(data["token"], str)
        assert len(data["token"]) > 10


class Test2FA:
    """2FA setup/disable - use fresh token after logout-all"""

    @pytest.fixture
    def fresh_doctor_headers(self):
        """Fresh login to avoid stale session_version from logout-all test."""
        r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": DOCTOR_EMAIL, "password": DOCTOR_PASSWORD})
        assert r.status_code == 200
        return {"Authorization": f"Bearer {r.json()['token']}"}

    def test_setup_2fa_returns_secret_and_qr(self, fresh_doctor_headers):
        r = requests.post(f"{BASE_URL}/api/auth/2fa/setup", headers=fresh_doctor_headers)
        assert r.status_code == 200
        data = r.json()
        assert "secret" in data
        assert "qr_uri" in data
        assert "otpauth://" in data["qr_uri"]

    def test_disable_2fa(self, fresh_doctor_headers):
        r = requests.post(f"{BASE_URL}/api/auth/2fa/disable", headers=fresh_doctor_headers)
        assert r.status_code == 200
        assert "disabled" in r.json().get("message", "").lower()


class TestAdminSuspend:
    """POST /admin/users/{id}/suspend and unsuspend"""

    def test_non_admin_cant_access(self, admin_headers):
        # Using a fresh non-admin token to test 403
        r2 = requests.post(f"{BASE_URL}/api/auth/login", json={"email": DOCTOR_EMAIL, "password": DOCTOR_PASSWORD})
        if r2.status_code != 200 or 'token' not in r2.json():
            pytest.skip(f"Doctor re-login failed ({r2.status_code}): {r2.text}")
        fresh_doctor_headers = {"Authorization": f"Bearer {r2.json()['token']}"}
        r = requests.post(f"{BASE_URL}/api/admin/users/fake-id/suspend", headers=fresh_doctor_headers)
        assert r.status_code == 403

    def test_suspend_unknown_user_404(self, admin_headers):
        r = requests.post(f"{BASE_URL}/api/admin/users/nonexistent-user-id/suspend", headers=admin_headers)
        assert r.status_code == 404

    def test_suspend_and_unsuspend(self, admin_headers):
        # Get a user to test with (use doctor sarah)
        users_r = requests.get(f"{BASE_URL}/api/admin/users", headers=admin_headers)
        assert users_r.status_code == 200
        users = users_r.json()
        target = next((u for u in users if u.get("email") == DOCTOR_EMAIL), None)
        assert target is not None, "Doctor user not found"
        uid = target["id"]

        # Suspend
        r = requests.post(f"{BASE_URL}/api/admin/users/{uid}/suspend",
            json={"reason": "TEST_suspend"}, headers=admin_headers)
        assert r.status_code == 200

        # Verify suspended
        users_r2 = requests.get(f"{BASE_URL}/api/admin/users", headers=admin_headers)
        updated = next((u for u in users_r2.json() if u["id"] == uid), {})
        assert updated.get("is_suspended") is True

        # Unsuspend
        r2 = requests.post(f"{BASE_URL}/api/admin/users/{uid}/unsuspend", headers=admin_headers)
        assert r2.status_code == 200

        # Verify unsuspended
        users_r3 = requests.get(f"{BASE_URL}/api/admin/users", headers=admin_headers)
        updated2 = next((u for u in users_r3.json() if u["id"] == uid), {})
        assert updated2.get("is_suspended") is not True


class TestAdminSetRole:
    """POST /admin/users/{id}/set-role"""

    def test_invalid_role_returns_400(self, admin_headers):
        users_r = requests.get(f"{BASE_URL}/api/admin/users", headers=admin_headers)
        users = users_r.json()
        uid = users[0]["id"]
        r = requests.post(f"{BASE_URL}/api/admin/users/{uid}/set-role",
            json={"role": "supervillain"}, headers=admin_headers)
        assert r.status_code == 400

    def test_set_valid_role(self, admin_headers):
        users_r = requests.get(f"{BASE_URL}/api/admin/users", headers=admin_headers)
        users = users_r.json()
        target = next((u for u in users if u.get("email") == DOCTOR_EMAIL), None)
        assert target is not None
        uid = target["id"]
        old_role = target.get("role", "doctor")

        r = requests.post(f"{BASE_URL}/api/admin/users/{uid}/set-role",
            json={"role": "doctor"}, headers=admin_headers)
        assert r.status_code == 200
        data = r.json()
        assert data["new_role"] == "doctor"


class TestAdminAuditLogs:
    """GET /admin/security-audit-logs"""

    def test_non_admin_returns_403(self, admin_headers):
        r2 = requests.post(f"{BASE_URL}/api/auth/login", json={"email": DOCTOR_EMAIL, "password": DOCTOR_PASSWORD})
        if r2.status_code != 200:
            pytest.skip(f"Doctor login failed ({r2.status_code}): {r2.text}")
        fresh_doctor_headers = {"Authorization": f"Bearer {r2.json()['token']}"}
        r = requests.get(f"{BASE_URL}/api/admin/security-audit-logs", headers=fresh_doctor_headers)
        assert r.status_code == 403

    def test_admin_returns_paginated_logs(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/security-audit-logs", headers=admin_headers)
        assert r.status_code == 200
        data = r.json()
        assert "logs" in data
        assert "total" in data
        assert isinstance(data["logs"], list)


class TestResetPassword:
    """POST /auth/reset-password"""

    def test_invalid_token_returns_400(self):
        r = requests.post(f"{BASE_URL}/api/auth/reset-password", json={
            "token": "invalid_token_xyz",
            "new_password": "NewPass@1!",
            "confirm_password": "NewPass@1!"
        })
        assert r.status_code == 400
        assert "invalid" in r.json()["detail"].lower() or "expired" in r.json()["detail"].lower()

    def test_mismatched_passwords_returns_400(self):
        r = requests.post(f"{BASE_URL}/api/auth/reset-password", json={
            "token": "some_token",
            "new_password": "NewPass@1!",
            "confirm_password": "Different@2!"
        })
        assert r.status_code == 400


class TestAdminResetPasswordTrigger:
    """POST /admin/users/{id}/reset-password-trigger"""

    def test_trigger_returns_reset_url(self, admin_headers):
        users_r = requests.get(f"{BASE_URL}/api/admin/users", headers=admin_headers)
        users = users_r.json()
        target = next((u for u in users if u.get("email") == DOCTOR_EMAIL), None)
        assert target is not None
        uid = target["id"]

        r = requests.post(f"{BASE_URL}/api/admin/users/{uid}/reset-password-trigger",
            headers=admin_headers)
        assert r.status_code == 200
        data = r.json()
        assert "reset_url" in data
        assert "reset-password?token=" in data["reset_url"]
        assert data["expires_in_hours"] == 1
