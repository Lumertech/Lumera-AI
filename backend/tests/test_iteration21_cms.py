"""
Tests for CMS Landing Page Content API (iteration 21)
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestLandingContentAPI:
    """GET /api/admin/content - public endpoint"""

    def test_get_content_returns_200(self):
        r = requests.get(f"{BASE_URL}/api/admin/content")
        assert r.status_code == 200

    def test_get_content_has_required_fields(self):
        r = requests.get(f"{BASE_URL}/api/admin/content")
        data = r.json()
        required = [
            "hero_title", "hero_subtitle", "hero_cta_primary",
            "stat_1_value", "stat_2_value", "stat_3_value", "stat_4_value",
            "features_title", "cta_title", "testimonials_title",
            "contact_email", "footer_company",
            "problem_1_title", "problem_2_title", "problem_3_title",
            "feature_1_title", "feature_2_title", "feature_3_title",
            "profession_1_name", "profession_2_name",
            "testimonial_1_quote", "testimonial_2_quote", "testimonial_3_quote"
        ]
        for field in required:
            assert field in data, f"Missing field: {field}"

    def test_contact_email_is_ravee(self):
        r = requests.get(f"{BASE_URL}/api/admin/content")
        data = r.json()
        assert data.get("contact_email") == "ravee@lumer.me", f"Got: {data.get('contact_email')}"

    def test_no_lumera_ai_in_defaults(self):
        r = requests.get(f"{BASE_URL}/api/admin/content")
        content_str = str(r.json())
        assert "lumera.ai" not in content_str.lower()
        assert "lumer.com" not in content_str.lower()


class TestLandingContentPUT:
    """PUT /api/admin/content - requires admin auth"""

    def test_put_without_auth_returns_401(self):
        r = requests.put(f"{BASE_URL}/api/admin/content", json={"cta_title": "Test"})
        assert r.status_code == 401

    def test_put_with_invalid_token_returns_401(self):
        r = requests.put(
            f"{BASE_URL}/api/admin/content",
            json={"cta_title": "Test"},
            headers={"Authorization": "Bearer badtoken"}
        )
        assert r.status_code == 401

    def test_admin_login_and_put_content(self):
        # Login as admin
        login = requests.post(f"{BASE_URL}/api/admin/login", json={
            "email": "admin@lumer.me",
            "password": "admin123"
        })
        assert login.status_code == 200, f"Admin login failed: {login.text}"
        token = login.json().get("token")
        assert token

        # Update cta_title
        update = requests.put(
            f"{BASE_URL}/api/admin/content",
            json={"cta_title": "TEST_Updated CTA"},
            headers={"Authorization": f"Bearer {token}"}
        )
        assert update.status_code == 200

        # Verify update persisted
        get = requests.get(f"{BASE_URL}/api/admin/content")
        assert get.json().get("cta_title") == "TEST_Updated CTA"

        # Restore original
        requests.put(
            f"{BASE_URL}/api/admin/content",
            json={"cta_title": "Ready to Transform Your Practice?"},
            headers={"Authorization": f"Bearer {token}"}
        )

    def test_admin_can_login_with_new_email(self):
        r = requests.post(f"{BASE_URL}/api/admin/login", json={
            "email": "admin@lumer.me",
            "password": "admin123"
        })
        assert r.status_code == 200
        data = r.json()
        assert "token" in data
