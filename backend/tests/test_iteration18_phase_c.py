"""
Iteration 18 Backend Tests: WhatsApp Inbox endpoints + delivery status
Tests: /api/meta-whatsapp/conversations, /api/meta-whatsapp/conversations/{phone},
       /api/meta-whatsapp/delivery-status/{phone}
"""
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
def auth(token):
    s = requests.Session()
    s.headers["Authorization"] = f"Bearer {token}"
    return s


# -- Conversations list --

def test_conversations_list_returns_200(auth):
    r = auth.get(f"{BASE_URL}/api/meta-whatsapp/conversations")
    assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"

def test_conversations_list_is_list(auth):
    r = auth.get(f"{BASE_URL}/api/meta-whatsapp/conversations")
    data = r.json()
    assert isinstance(data, list), f"Expected list, got {type(data)}"

def test_conversations_list_has_expected_threads(auth):
    r = auth.get(f"{BASE_URL}/api/meta-whatsapp/conversations")
    data = r.json()
    phones = [t["phone"] for t in data]
    # These were seeded for sarah@test.com
    assert len(data) >= 3, f"Expected at least 3 threads, got {len(data)}: {phones}"

def test_conversations_thread_has_required_fields(auth):
    r = auth.get(f"{BASE_URL}/api/meta-whatsapp/conversations")
    data = r.json()
    assert len(data) > 0, "No threads returned"
    thread = data[0]
    for field in ["phone", "patient_name", "last_message", "last_direction", "last_at", "unread_count"]:
        assert field in thread, f"Missing field: {field}"

def test_conversations_unread_counts(auth):
    r = auth.get(f"{BASE_URL}/api/meta-whatsapp/conversations")
    data = r.json()
    phones_map = {t["phone"]: t for t in data}
    # Rahul +919876543210 should have unread=1, Priya +918765432109 unread=2
    if "+919876543210" in phones_map:
        assert phones_map["+919876543210"]["unread_count"] >= 1, "Rahul unread_count expected >=1"
    if "+918765432109" in phones_map:
        assert phones_map["+918765432109"]["unread_count"] >= 1, "Priya unread_count expected >=1"


# -- Single conversation --

def test_single_conversation_returns_200(auth):
    r = auth.get(f"{BASE_URL}/api/meta-whatsapp/conversations/%2B919876543210")
    assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"

def test_single_conversation_has_messages(auth):
    r = auth.get(f"{BASE_URL}/api/meta-whatsapp/conversations/%2B919876543210")
    data = r.json()
    assert "messages" in data, "Missing 'messages' key"
    assert len(data["messages"]) > 0, "Expected at least one message"

def test_single_conversation_message_fields(auth):
    r = auth.get(f"{BASE_URL}/api/meta-whatsapp/conversations/%2B919876543210")
    msgs = r.json()["messages"]
    assert len(msgs) > 0
    msg = msgs[0]
    assert "direction" in msg
    assert msg["direction"] in ["inbound", "outbound"]

def test_single_conversation_unknown_phone_returns_empty(auth):
    r = auth.get(f"{BASE_URL}/api/meta-whatsapp/conversations/%2B910000000000")
    assert r.status_code == 200
    data = r.json()
    assert data["messages"] == [], f"Expected empty messages for unknown phone, got {data['messages']}"


# -- Delivery status --

def test_delivery_status_known_phone(auth):
    r = auth.get(f"{BASE_URL}/api/meta-whatsapp/delivery-status/%2B919876543210")
    assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
    data = r.json()
    assert "status" in data
    assert data["status"] in ["none", "sent", "delivered", "read", "failed"]

def test_delivery_status_unknown_phone_returns_none(auth):
    r = auth.get(f"{BASE_URL}/api/meta-whatsapp/delivery-status/%2B910000099999")
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "none"

def test_unauthenticated_conversations_blocked(token):
    r = requests.get(f"{BASE_URL}/api/meta-whatsapp/conversations")
    assert r.status_code in [401, 403], f"Expected 401/403, got {r.status_code}"
