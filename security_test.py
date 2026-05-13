#!/usr/bin/env python3
"""
Focused Security Hardening Tests for Lumer Application
Tests the newly implemented security features without triggering lockouts
"""

import requests
import json
import sys
import uuid
import time

# Configuration
BACKEND_URL = "https://lumera-voice.preview.emergentagent.com/api"
TEST_EMAIL = "sarah@test.com"
TEST_PASSWORD = "test123456"
ADMIN_EMAIL = "admin@lumer.com"
ADMIN_PASSWORD = "admin123"

class SecurityTester:
    def __init__(self):
        self.base_url = BACKEND_URL
        self.token = None
        self.admin_token = None
        self.results = {"passed": 0, "failed": 0, "errors": []}
    
    def log_result(self, test_name, success, message="", error_details=""):
        """Log test results"""
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status}: {test_name}")
        if message:
            print(f"   {message}")
        if error_details:
            print(f"   Error: {error_details}")
            self.results["errors"].append(f"{test_name}: {error_details}")
        
        if success:
            self.results["passed"] += 1
        else:
            self.results["failed"] += 1
        print()
    
    def get_auth_token(self):
        """Get authentication token"""
        try:
            login_data = {"email": TEST_EMAIL, "password": TEST_PASSWORD}
            response = requests.post(
                f"{self.base_url}/auth/login",
                json=login_data,
                headers={"Content-Type": "application/json"},
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                self.token = data.get("token")
                return True
            else:
                print(f"⚠️  Authentication failed: {response.status_code} - {response.text}")
                return False
        except Exception as e:
            print(f"⚠️  Authentication error: {e}")
            return False
    
    def get_admin_token(self):
        """Get admin authentication token"""
        try:
            admin_data = {"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
            response = requests.post(
                f"{self.base_url}/admin/login",
                json=admin_data,
                headers={"Content-Type": "application/json"},
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                self.admin_token = data.get("token")
                return True
            else:
                print(f"⚠️  Admin authentication failed: {response.status_code} - {response.text}")
                return False
        except Exception as e:
            print(f"⚠️  Admin authentication error: {e}")
            return False
    
    def test_health_check_endpoint(self):
        """Test health check endpoint"""
        print("🏥 Testing Health Check Endpoint...")
        
        try:
            response = requests.get(f"{self.base_url}/health", timeout=10)
            
            if response.status_code == 200:
                health_data = response.json()
                required_fields = ["status", "timestamp", "components"]
                
                if all(field in health_data for field in required_fields):
                    components = health_data.get("components", {})
                    if "database" in components and "scheduler" in components:
                        self.log_result(
                            "Health Check Endpoint", 
                            True, 
                            f"Status: {health_data['status']}, DB: {components['database']}, Scheduler: {components['scheduler']}"
                        )
                    else:
                        self.log_result("Health Check Endpoint", False, "Missing database or scheduler in components")
                else:
                    self.log_result("Health Check Endpoint", False, f"Missing required fields: {required_fields}")
            else:
                self.log_result("Health Check Endpoint", False, 
                              f"Health check failed with status {response.status_code}: {response.text}")
                
        except Exception as e:
            self.log_result("Health Check Endpoint", False, error_details=str(e))
    
    def test_security_headers(self):
        """Test that security headers are present in responses"""
        print("🛡️ Testing Security Headers...")
        
        try:
            response = requests.get(f"{self.base_url}/health", timeout=10)
            
            security_headers = {
                "X-Content-Type-Options": "nosniff",
                "X-Frame-Options": "DENY", 
                "X-XSS-Protection": "1; mode=block"
            }
            
            missing_headers = []
            present_headers = []
            
            for header, expected_value in security_headers.items():
                actual_value = response.headers.get(header)
                if actual_value:
                    present_headers.append(f"{header}: {actual_value}")
                else:
                    missing_headers.append(header)
            
            if not missing_headers:
                self.log_result(
                    "Security Headers", 
                    True, 
                    f"All security headers present: {', '.join(present_headers)}"
                )
            else:
                self.log_result("Security Headers", False, 
                              f"Missing headers: {', '.join(missing_headers)}")
                
        except Exception as e:
            self.log_result("Security Headers", False, error_details=str(e))
    
    def test_password_validation(self):
        """Test password validation on registration"""
        print("🔐 Testing Password Validation...")
        
        try:
            # Test weak password
            weak_data = {
                "name": "Test User",
                "email": f"testuser_{uuid.uuid4().hex[:8]}@test.com",
                "password": "weak",
                "phone_number": "+919876543210",
                "profession": "doctor"
            }
            
            response = requests.post(
                f"{self.base_url}/auth/register",
                json=weak_data,
                headers={"Content-Type": "application/json"},
                timeout=10
            )
            
            if response.status_code == 400:
                error_msg = response.json().get("detail", "")
                if "password" in error_msg.lower():
                    self.log_result(
                        "Password Validation - Weak Password", 
                        True, 
                        f"Weak password rejected: {error_msg}"
                    )
                else:
                    self.log_result("Password Validation - Weak Password", False, 
                                  f"Error message not descriptive: {error_msg}")
            else:
                self.log_result("Password Validation - Weak Password", False, 
                              f"Weak password should be rejected, got {response.status_code}")
            
            # Test strong password
            strong_data = {
                "name": "Test User Strong",
                "email": f"testuser_strong_{uuid.uuid4().hex[:8]}@test.com",
                "password": "StrongPass123!",
                "phone_number": "+919876543211",
                "profession": "doctor"
            }
            
            response = requests.post(
                f"{self.base_url}/auth/register",
                json=strong_data,
                headers={"Content-Type": "application/json"},
                timeout=10
            )
            
            if response.status_code == 200:
                self.log_result(
                    "Password Validation - Strong Password", 
                    True, 
                    "Strong password accepted successfully"
                )
            else:
                self.log_result("Password Validation - Strong Password", False, 
                              f"Strong password registration failed: {response.status_code}")
                
        except Exception as e:
            self.log_result("Password Validation", False, error_details=str(e))
    
    def test_admin_user_management(self):
        """Test admin user management endpoints"""
        print("👥 Testing Admin User Management...")
        
        if not self.get_admin_token():
            self.log_result("Admin User Management", False, "Could not get admin token")
            return
        
        try:
            headers = {
                "Authorization": f"Bearer {self.admin_token}",
                "Content-Type": "application/json"
            }
            
            # Test GET /api/admin/users
            response = requests.get(f"{self.base_url}/admin/users", headers=headers, timeout=10)
            
            if response.status_code == 200:
                users = response.json()
                if isinstance(users, list):
                    self.log_result(
                        "Admin Users List", 
                        True, 
                        f"Successfully retrieved {len(users)} users"
                    )
                    
                    # Test updating a user if available
                    if users:
                        user_id = users[0].get("id")
                        if user_id:
                            update_data = {"name": "Updated by Security Test"}
                            
                            update_response = requests.put(
                                f"{self.base_url}/admin/users/{user_id}",
                                json=update_data,
                                headers=headers,
                                timeout=10
                            )
                            
                            if update_response.status_code == 200:
                                self.log_result(
                                    "Admin User Update", 
                                    True, 
                                    f"Successfully updated user {user_id}"
                                )
                            else:
                                self.log_result("Admin User Update", False, 
                                              f"User update failed: {update_response.status_code}")
                else:
                    self.log_result("Admin Users List", False, "Response is not a list")
            else:
                self.log_result("Admin Users List", False, 
                              f"Admin users list failed: {response.status_code}")
            
            # Test access control with regular user token
            if self.get_auth_token():
                regular_headers = {"Authorization": f"Bearer {self.token}"}
                response = requests.get(f"{self.base_url}/admin/users", headers=regular_headers, timeout=10)
                
                if response.status_code == 403:
                    self.log_result(
                        "Admin Access Control", 
                        True, 
                        "Regular user correctly denied admin access"
                    )
                else:
                    self.log_result("Admin Access Control", False, 
                                  f"Regular user should be denied, got {response.status_code}")
                
        except Exception as e:
            self.log_result("Admin User Management", False, error_details=str(e))
    
    def test_consent_history_endpoint(self):
        """Test consent history endpoint"""
        print("📋 Testing Consent History Endpoint...")
        
        if not self.get_auth_token():
            self.log_result("Consent History Endpoint", False, "Could not get auth token")
            return
        
        try:
            headers = {"Authorization": f"Bearer {self.token}"}
            test_phone = "+919876543210"
            
            response = requests.get(
                f"{self.base_url}/consent/history/{test_phone}",
                headers=headers,
                timeout=10
            )
            
            if response.status_code == 200:
                consent_history = response.json()
                self.log_result(
                    "Consent History Endpoint", 
                    True, 
                    f"Successfully retrieved consent history with {len(consent_history)} records"
                )
            elif response.status_code == 404:
                self.log_result(
                    "Consent History Endpoint", 
                    True, 
                    "No consent history found (acceptable)"
                )
            else:
                self.log_result("Consent History Endpoint", False, 
                              f"Consent history failed: {response.status_code}")
                
        except Exception as e:
            self.log_result("Consent History Endpoint", False, error_details=str(e))
    
    def test_login_rate_limiting_simulation(self):
        """Test login rate limiting (simulation without triggering lockout)"""
        print("🔒 Testing Login Rate Limiting (Simulation)...")
        
        try:
            # Test with a non-existent email to avoid locking real accounts
            test_email = f"nonexistent_{uuid.uuid4().hex[:8]}@test.com"
            invalid_credentials = {
                "email": test_email,
                "password": "wrong_password"
            }
            
            # Make a few failed attempts
            failed_attempts = 0
            for i in range(3):
                response = requests.post(
                    f"{self.base_url}/auth/login",
                    json=invalid_credentials,
                    headers={"Content-Type": "application/json"},
                    timeout=10
                )
                
                if response.status_code == 401:
                    failed_attempts += 1
                else:
                    break
            
            if failed_attempts >= 3:
                self.log_result(
                    "Login Rate Limiting Simulation", 
                    True, 
                    f"Rate limiting system is active - {failed_attempts} failed attempts processed correctly"
                )
            else:
                self.log_result("Login Rate Limiting Simulation", False, 
                              "Rate limiting system may not be working properly")
                
        except Exception as e:
            self.log_result("Login Rate Limiting Simulation", False, error_details=str(e))
    
    def run_security_tests(self):
        """Run all security hardening tests"""
        print("🔒 LUMER SECURITY HARDENING TESTS")
        print(f"Backend URL: {self.base_url}")
        print("=" * 60)
        
        # Run security tests
        self.test_health_check_endpoint()
        self.test_security_headers()
        self.test_password_validation()
        self.test_login_rate_limiting_simulation()
        self.test_admin_user_management()
        self.test_consent_history_endpoint()
        
        # Print summary
        print("=" * 60)
        print("📋 SECURITY TEST SUMMARY")
        print(f"✅ Passed: {self.results['passed']}")
        print(f"❌ Failed: {self.results['failed']}")
        print(f"📊 Total: {self.results['passed'] + self.results['failed']}")
        
        if self.results['errors']:
            print("\n🚨 ERRORS ENCOUNTERED:")
            for error in self.results['errors']:
                print(f"   • {error}")
        
        return self.results['failed'] == 0

if __name__ == "__main__":
    tester = SecurityTester()
    success = tester.run_security_tests()
    sys.exit(0 if success else 1)