#!/usr/bin/env python3
"""
Test Account Lockout Functionality
Tests the 5-attempt lockout feature with a dedicated test account
"""

import requests
import json
import uuid
import time

BACKEND_URL = "https://medsync-app-6.preview.emergentagent.com/api"

def test_account_lockout():
    """Test account lockout after 5 failed attempts"""
    print("🔒 Testing Account Lockout Feature...")
    
    # Create a test user first
    test_email = f"lockout_test_{uuid.uuid4().hex[:8]}@test.com"
    test_password = "TestPassword123!"
    
    # Register test user
    user_data = {
        "name": "Lockout Test User",
        "email": test_email,
        "password": test_password,
        "phone_number": "+919876543999",
        "profession": "doctor"
    }
    
    response = requests.post(
        f"{BACKEND_URL}/auth/register",
        json=user_data,
        headers={"Content-Type": "application/json"},
        timeout=10
    )
    
    if response.status_code != 200:
        print(f"❌ Failed to create test user: {response.status_code}")
        return False
    
    print(f"✅ Created test user: {test_email}")
    
    # Test 5 failed login attempts
    invalid_credentials = {
        "email": test_email,
        "password": "wrong_password"
    }
    
    print("Making 5 failed login attempts...")
    for i in range(1, 6):
        response = requests.post(
            f"{BACKEND_URL}/auth/login",
            json=invalid_credentials,
            headers={"Content-Type": "application/json"},
            timeout=10
        )
        
        print(f"Attempt {i}: Status {response.status_code}")
        
        if response.status_code != 401:
            print(f"❌ Expected 401 for failed attempt {i}, got {response.status_code}")
            return False
    
    # 6th attempt should trigger lockout
    print("Making 6th attempt (should trigger lockout)...")
    response = requests.post(
        f"{BACKEND_URL}/auth/login",
        json=invalid_credentials,
        headers={"Content-Type": "application/json"},
        timeout=10
    )
    
    print(f"6th attempt: Status {response.status_code}")
    
    if response.status_code == 429:
        error_msg = response.json().get("detail", "")
        print(f"✅ Account locked: {error_msg}")
        
        # Test that valid credentials also fail during lockout
        print("Testing valid credentials during lockout...")
        valid_credentials = {
            "email": test_email,
            "password": test_password
        }
        
        response = requests.post(
            f"{BACKEND_URL}/auth/login",
            json=valid_credentials,
            headers={"Content-Type": "application/json"},
            timeout=10
        )
        
        if response.status_code == 429:
            print("✅ Valid credentials also blocked during lockout")
            return True
        else:
            print(f"❌ Valid credentials should be blocked, got {response.status_code}")
            return False
    else:
        print(f"❌ Expected 429 for lockout, got {response.status_code}")
        return False

if __name__ == "__main__":
    success = test_account_lockout()
    if success:
        print("\n🎉 Account lockout feature working correctly!")
    else:
        print("\n❌ Account lockout feature has issues")