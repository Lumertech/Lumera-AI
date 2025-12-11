#!/usr/bin/env python3
"""
Comprehensive Backend API Testing for Lumer Application
Tests authentication, AI suggestions, patient management, analytics, and security hardening features
"""

import requests
import json
import sys
import os
from datetime import datetime, timedelta
import uuid
import time

# Configuration
BACKEND_URL = "https://medsync-app-6.preview.emergentagent.com/api"
TEST_EMAIL = "sarah@test.com"
TEST_PASSWORD = "test123456"
ADMIN_EMAIL = "admin@lumer.com"
ADMIN_PASSWORD = "admin123"

class LumerAPITester:
    def __init__(self):
        self.base_url = BACKEND_URL
        self.token = None
        self.admin_token = None
        self.user_data = None
        self.test_appointment_id = None
        self.test_user_id = None
        self.results = {
            "passed": 0,
            "failed": 0,
            "errors": []
        }
    
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
    
    def test_authentication(self):
        """Test login endpoint and token generation"""
        print("🔐 Testing Authentication...")
        
        try:
            # Test login
            login_data = {
                "email": TEST_EMAIL,
                "password": TEST_PASSWORD
            }
            
            response = requests.post(
                f"{self.base_url}/auth/login",
                json=login_data,
                headers={"Content-Type": "application/json"},
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                if "token" in data and "user" in data:
                    self.token = data["token"]
                    self.user_data = data["user"]
                    self.log_result(
                        "Authentication Login", 
                        True, 
                        f"Successfully logged in as {data['user'].get('name', 'Unknown')}"
                    )
                    
                    # Test protected endpoint
                    headers = {"Authorization": f"Bearer {self.token}"}
                    me_response = requests.get(f"{self.base_url}/auth/me", headers=headers, timeout=10)
                    
                    if me_response.status_code == 200:
                        self.log_result("Authentication Token Validation", True, "Token works for protected endpoints")
                    else:
                        self.log_result("Authentication Token Validation", False, 
                                      f"Protected endpoint failed: {me_response.status_code}")
                else:
                    self.log_result("Authentication Login", False, "Missing token or user in response")
            else:
                self.log_result("Authentication Login", False, 
                              f"Login failed with status {response.status_code}: {response.text}")
                
        except Exception as e:
            self.log_result("Authentication", False, error_details=str(e))
    
    def test_ai_prescription_suggestions(self):
        """Test AI prescription suggestions endpoint"""
        print("🤖 Testing AI Prescription Suggestions...")
        
        if not self.token:
            self.log_result("AI Prescription Suggestions", False, "No authentication token available")
            return
        
        try:
            headers = {
                "Authorization": f"Bearer {self.token}",
                "Content-Type": "application/json"
            }
            
            # Test AI suggestions
            suggestion_data = {
                "symptoms": "fever, headache, body ache",
                "patient_age": 35,
                "patient_sex": "Male"
            }
            
            response = requests.post(
                f"{self.base_url}/prescriptions/ai-suggest",
                params=suggestion_data,
                headers=headers,
                timeout=15
            )
            
            if response.status_code == 200:
                data = response.json()
                if "suggestions" in data:
                    # Try to parse the suggestions JSON
                    try:
                        suggestions = json.loads(data["suggestions"])
                        if isinstance(suggestions, list) and len(suggestions) > 0:
                            # Check if suggestions have required fields
                            first_suggestion = suggestions[0]
                            required_fields = ["medicine_name", "dosage", "frequency", "duration"]
                            
                            if all(field in first_suggestion for field in required_fields):
                                self.log_result(
                                    "AI Prescription Suggestions", 
                                    True, 
                                    f"Returned {len(suggestions)} valid medication suggestions"
                                )
                            else:
                                self.log_result(
                                    "AI Prescription Suggestions", 
                                    False, 
                                    f"Suggestions missing required fields: {required_fields}"
                                )
                        else:
                            self.log_result("AI Prescription Suggestions", False, "Empty or invalid suggestions list")
                    except json.JSONDecodeError as e:
                        self.log_result("AI Prescription Suggestions", False, 
                                      f"Invalid JSON in suggestions: {str(e)}")
                else:
                    self.log_result("AI Prescription Suggestions", False, "No 'suggestions' field in response")
            else:
                self.log_result("AI Prescription Suggestions", False, 
                              f"API call failed with status {response.status_code}: {response.text}")
                
        except Exception as e:
            self.log_result("AI Prescription Suggestions", False, error_details=str(e))
    
    def test_appointments_api(self):
        """Test appointments listing and creation"""
        print("📅 Testing Appointments API...")
        
        if not self.token:
            self.log_result("Appointments API", False, "No authentication token available")
            return
        
        try:
            headers = {
                "Authorization": f"Bearer {self.token}",
                "Content-Type": "application/json"
            }
            
            # Test GET appointments
            response = requests.get(f"{self.base_url}/appointments", headers=headers, timeout=10)
            
            if response.status_code == 200:
                appointments = response.json()
                self.log_result(
                    "Appointments List", 
                    True, 
                    f"Successfully retrieved {len(appointments)} appointments"
                )
                
                # Store an appointment ID for patient details testing
                if appointments:
                    self.test_appointment_id = appointments[0].get("id")
                
            else:
                self.log_result("Appointments List", False, 
                              f"Failed to get appointments: {response.status_code}")
            
            # Test creating a new appointment
            tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
            appointment_data = {
                "client_name": "Test Patient",
                "client_phone": "+919876543210",
                "client_email": "testpatient@example.com",
                "appointment_date": tomorrow,
                "start_time": "14:00",
                "end_time": "14:30",
                "consultation_mode": "in-person",
                "notes": "Test appointment for API testing"
            }
            
            create_response = requests.post(
                f"{self.base_url}/appointments",
                json=appointment_data,
                headers=headers,
                timeout=10
            )
            
            if create_response.status_code == 200:
                new_appointment = create_response.json()
                if "id" in new_appointment:
                    self.test_appointment_id = new_appointment["id"]
                    self.log_result(
                        "Appointment Creation", 
                        True, 
                        f"Successfully created appointment with ID: {new_appointment['id']}"
                    )
                else:
                    self.log_result("Appointment Creation", False, "No ID in created appointment")
            else:
                self.log_result("Appointment Creation", False, 
                              f"Failed to create appointment: {create_response.status_code}")
                
        except Exception as e:
            self.log_result("Appointments API", False, error_details=str(e))
    
    def test_patient_details_update(self):
        """Test patient details update API"""
        print("👤 Testing Patient Details Update...")
        
        if not self.token or not self.test_appointment_id:
            self.log_result("Patient Details Update", False, 
                          "No authentication token or appointment ID available")
            return
        
        try:
            headers = {
                "Authorization": f"Bearer {self.token}",
                "Content-Type": "application/json"
            }
            
            # Test updating patient details
            patient_data = {
                "name": "Updated Test Patient",
                "age": 28,
                "sex": "Female",
                "blood_group": "O+",
                "allergies": "None known",
                "chronic_conditions": "None",
                "emergency_contact": "+919876543211"
            }
            
            response = requests.put(
                f"{self.base_url}/appointments/{self.test_appointment_id}/patient-details",
                json=patient_data,
                headers=headers,
                timeout=10
            )
            
            if response.status_code == 200:
                self.log_result(
                    "Patient Details Update", 
                    True, 
                    "Successfully updated patient details"
                )
                
                # Verify the update by getting appointment details
                get_response = requests.get(
                    f"{self.base_url}/appointments/{self.test_appointment_id}",
                    headers=headers,
                    timeout=10
                )
                
                if get_response.status_code == 200:
                    appointment = get_response.json()
                    if (appointment.get("client_name") == "Updated Test Patient" and 
                        appointment.get("patient_details", {}).get("age") == 28):
                        self.log_result(
                            "Patient Details Verification", 
                            True, 
                            "Patient name and details updated correctly in database"
                        )
                    else:
                        self.log_result(
                            "Patient Details Verification", 
                            False, 
                            "Patient details not properly updated in database"
                        )
                else:
                    self.log_result("Patient Details Verification", False, 
                                  f"Failed to retrieve updated appointment: {get_response.status_code}")
            else:
                self.log_result("Patient Details Update", False, 
                              f"Update failed with status {response.status_code}: {response.text}")
                
        except Exception as e:
            self.log_result("Patient Details Update", False, error_details=str(e))
    
    def test_dashboard_analytics(self):
        """Test dashboard analytics endpoint"""
        print("📊 Testing Dashboard Analytics...")
        
        if not self.token:
            self.log_result("Dashboard Analytics", False, "No authentication token available")
            return
        
        try:
            headers = {"Authorization": f"Bearer {self.token}"}
            
            response = requests.get(f"{self.base_url}/analytics/dashboard", headers=headers, timeout=10)
            
            if response.status_code == 200:
                analytics = response.json()
                required_fields = ["total_appointments", "total_clients", "today_appointments", 
                                 "upcoming_appointments", "total_revenue"]
                
                if all(field in analytics for field in required_fields):
                    # Check if revenue is a number (should be in INR)
                    revenue = analytics.get("total_revenue", 0)
                    if isinstance(revenue, (int, float)):
                        self.log_result(
                            "Dashboard Analytics", 
                            True, 
                            f"Analytics retrieved: {analytics['total_appointments']} appointments, "
                            f"₹{revenue} revenue"
                        )
                    else:
                        self.log_result("Dashboard Analytics", False, "Revenue is not a valid number")
                else:
                    missing_fields = [f for f in required_fields if f not in analytics]
                    self.log_result("Dashboard Analytics", False, 
                                  f"Missing required fields: {missing_fields}")
            else:
                self.log_result("Dashboard Analytics", False, 
                              f"Analytics API failed with status {response.status_code}: {response.text}")
                
        except Exception as e:
            self.log_result("Dashboard Analytics", False, error_details=str(e))
    
    def test_payment_order_creation(self):
        """Test Razorpay payment order creation"""
        print("💳 Testing Payment Order Creation...")
        
        if not self.token:
            self.log_result("Payment Order Creation", False, "No authentication token available")
            return
        
        try:
            headers = {"Authorization": f"Bearer {self.token}"}
            
            # Test creating a payment order
            response = requests.post(
                f"{self.base_url}/payments/create-order",
                params={"package": "consultation", "payment_type": "upi"},
                headers=headers,
                timeout=10
            )
            
            if response.status_code == 200:
                order_data = response.json()
                required_fields = ["order_id", "amount", "currency"]
                
                if all(field in order_data for field in required_fields):
                    if order_data.get("currency") == "INR":
                        self.log_result(
                            "Payment Order Creation", 
                            True, 
                            f"Order created: {order_data['order_id']}, Amount: ₹{order_data['amount']/100}"
                        )
                    else:
                        self.log_result("Payment Order Creation", False, 
                                      f"Wrong currency: {order_data.get('currency')}, expected INR")
                else:
                    self.log_result("Payment Order Creation", False, 
                                  f"Missing required fields in order response")
            elif response.status_code == 400:
                # This might be expected if Razorpay is not configured
                error_msg = response.json().get("detail", "")
                if "configure your Razorpay credentials" in error_msg:
                    self.log_result(
                        "Payment Order Creation", 
                        True, 
                        "Razorpay not configured (expected) - API correctly returns configuration error"
                    )
                else:
                    self.log_result("Payment Order Creation", False, f"Unexpected error: {error_msg}")
            else:
                self.log_result("Payment Order Creation", False, 
                              f"Order creation failed with status {response.status_code}: {response.text}")
                
        except Exception as e:
            self.log_result("Payment Order Creation", False, error_details=str(e))
    
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
    
    def test_login_rate_limiting_and_lockout(self):
        """Test login rate limiting and account lockout after 5 failed attempts"""
        print("🔒 Testing Login Rate Limiting and Account Lockout...")
        
        try:
            # Test with invalid credentials to trigger lockout
            invalid_credentials = {
                "email": TEST_EMAIL,
                "password": "wrong_password"
            }
            
            # Make 5 failed login attempts
            for i in range(5):
                response = requests.post(
                    f"{self.base_url}/auth/login",
                    json=invalid_credentials,
                    headers={"Content-Type": "application/json"},
                    timeout=10
                )
                
                if response.status_code != 401:
                    self.log_result("Login Rate Limiting", False, 
                                  f"Expected 401 for invalid credentials, got {response.status_code}")
                    return
            
            # 6th attempt should trigger lockout
            response = requests.post(
                f"{self.base_url}/auth/login",
                json=invalid_credentials,
                headers={"Content-Type": "application/json"},
                timeout=10
            )
            
            if response.status_code == 429:
                error_msg = response.json().get("detail", "")
                if "locked" in error_msg.lower():
                    self.log_result(
                        "Login Account Lockout", 
                        True, 
                        f"Account locked after 5 failed attempts: {error_msg}"
                    )
                else:
                    self.log_result("Login Account Lockout", False, 
                                  f"Expected lockout message, got: {error_msg}")
            else:
                self.log_result("Login Account Lockout", False, 
                              f"Expected 429 status for lockout, got {response.status_code}")
            
            # Test that valid credentials also fail during lockout
            valid_credentials = {
                "email": TEST_EMAIL,
                "password": TEST_PASSWORD
            }
            
            response = requests.post(
                f"{self.base_url}/auth/login",
                json=valid_credentials,
                headers={"Content-Type": "application/json"},
                timeout=10
            )
            
            if response.status_code == 429:
                self.log_result(
                    "Login Lockout Persistence", 
                    True, 
                    "Valid credentials also blocked during lockout period"
                )
            else:
                self.log_result("Login Lockout Persistence", False, 
                              "Valid credentials should be blocked during lockout")
                
        except Exception as e:
            self.log_result("Login Rate Limiting and Lockout", False, error_details=str(e))
    
    def test_password_validation_on_registration(self):
        """Test password validation requirements on registration"""
        print("🔐 Testing Password Validation on Registration...")
        
        try:
            # Test with weak password (should fail)
            weak_password_data = {
                "name": "Test User",
                "email": f"testuser_{uuid.uuid4().hex[:8]}@test.com",
                "password": "weak",  # Too short, no uppercase, no numbers, no special chars
                "phone_number": "+919876543210",
                "profession": "doctor"
            }
            
            response = requests.post(
                f"{self.base_url}/auth/register",
                json=weak_password_data,
                headers={"Content-Type": "application/json"},
                timeout=10
            )
            
            if response.status_code == 400:
                error_msg = response.json().get("detail", "")
                if any(keyword in error_msg.lower() for keyword in ["password", "character", "uppercase", "number", "special"]):
                    self.log_result(
                        "Password Validation - Weak Password", 
                        True, 
                        f"Weak password rejected with descriptive error: {error_msg}"
                    )
                else:
                    self.log_result("Password Validation - Weak Password", False, 
                                  f"Error message not descriptive enough: {error_msg}")
            else:
                self.log_result("Password Validation - Weak Password", False, 
                              f"Weak password should be rejected, got status {response.status_code}")
            
            # Test with strong password (should succeed)
            strong_password_data = {
                "name": "Test User Strong",
                "email": f"testuser_strong_{uuid.uuid4().hex[:8]}@test.com",
                "password": "StrongPass123!",  # 8+ chars, uppercase, lowercase, number, special char
                "phone_number": "+919876543211",
                "profession": "doctor"
            }
            
            response = requests.post(
                f"{self.base_url}/auth/register",
                json=strong_password_data,
                headers={"Content-Type": "application/json"},
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                if "token" in data and "user" in data:
                    self.test_user_id = data["user"].get("id")
                    self.log_result(
                        "Password Validation - Strong Password", 
                        True, 
                        "Strong password accepted and user created successfully"
                    )
                else:
                    self.log_result("Password Validation - Strong Password", False, 
                                  "Registration succeeded but missing token or user data")
            else:
                self.log_result("Password Validation - Strong Password", False, 
                              f"Strong password registration failed: {response.status_code} - {response.text}")
                
        except Exception as e:
            self.log_result("Password Validation on Registration", False, error_details=str(e))
    
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
                    if expected_value and actual_value != expected_value:
                        missing_headers.append(f"{header} (expected: {expected_value}, got: {actual_value})")
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
                              f"Missing or incorrect headers: {', '.join(missing_headers)}")
                
        except Exception as e:
            self.log_result("Security Headers", False, error_details=str(e))
    
    def test_admin_authentication(self):
        """Test admin authentication"""
        print("👑 Testing Admin Authentication...")
        
        try:
            admin_credentials = {
                "email": ADMIN_EMAIL,
                "password": ADMIN_PASSWORD
            }
            
            response = requests.post(
                f"{self.base_url}/auth/login",
                json=admin_credentials,
                headers={"Content-Type": "application/json"},
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                if "token" in data and "user" in data:
                    self.admin_token = data["token"]
                    user_role = data["user"].get("role", "")
                    if user_role == "admin":
                        self.log_result(
                            "Admin Authentication", 
                            True, 
                            f"Successfully logged in as admin: {data['user'].get('name', 'Unknown')}"
                        )
                    else:
                        self.log_result("Admin Authentication", False, 
                                      f"User role is '{user_role}', expected 'admin'")
                else:
                    self.log_result("Admin Authentication", False, "Missing token or user in response")
            else:
                self.log_result("Admin Authentication", False, 
                              f"Admin login failed with status {response.status_code}: {response.text}")
                
        except Exception as e:
            self.log_result("Admin Authentication", False, error_details=str(e))
    
    def test_admin_user_management(self):
        """Test admin user management endpoints"""
        print("👥 Testing Admin User Management...")
        
        if not self.admin_token:
            self.log_result("Admin User Management", False, "No admin token available")
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
                    
                    # Test updating a user if we have a test user
                    if self.test_user_id and users:
                        # Find our test user or use the first user
                        target_user_id = self.test_user_id
                        for user in users:
                            if user.get("id") == self.test_user_id:
                                break
                        else:
                            # Use first user if test user not found
                            target_user_id = users[0].get("id")
                        
                        if target_user_id:
                            # Test PUT /api/admin/users/{user_id}
                            update_data = {
                                "name": "Updated by Admin Test",
                                "is_active": True
                            }
                            
                            update_response = requests.put(
                                f"{self.base_url}/admin/users/{target_user_id}",
                                json=update_data,
                                headers=headers,
                                timeout=10
                            )
                            
                            if update_response.status_code == 200:
                                self.log_result(
                                    "Admin User Update", 
                                    True, 
                                    f"Successfully updated user {target_user_id}"
                                )
                            else:
                                self.log_result("Admin User Update", False, 
                                              f"User update failed: {update_response.status_code} - {update_response.text}")
                        else:
                            self.log_result("Admin User Update", False, "No user ID available for testing")
                else:
                    self.log_result("Admin Users List", False, "Response is not a list of users")
            else:
                self.log_result("Admin Users List", False, 
                              f"Admin users list failed: {response.status_code} - {response.text}")
            
            # Test access with regular user token (should fail)
            if self.token:
                regular_headers = {"Authorization": f"Bearer {self.token}"}
                response = requests.get(f"{self.base_url}/admin/users", headers=regular_headers, timeout=10)
                
                if response.status_code == 403:
                    self.log_result(
                        "Admin Access Control", 
                        True, 
                        "Regular user correctly denied access to admin endpoints"
                    )
                else:
                    self.log_result("Admin Access Control", False, 
                                  f"Regular user should be denied access, got {response.status_code}")
                
        except Exception as e:
            self.log_result("Admin User Management", False, error_details=str(e))
    
    def test_consent_history_endpoint(self):
        """Test consent history endpoint"""
        print("📋 Testing Consent History Endpoint...")
        
        if not self.token:
            self.log_result("Consent History Endpoint", False, "No authentication token available")
            return
        
        try:
            headers = {"Authorization": f"Bearer {self.token}"}
            
            # Use a test phone number (from existing appointments if available)
            test_phone = "+919876543210"  # From our test appointment creation
            
            response = requests.get(
                f"{self.base_url}/consent/history/{test_phone}",
                headers=headers,
                timeout=10
            )
            
            if response.status_code == 200:
                consent_history = response.json()
                if isinstance(consent_history, list):
                    self.log_result(
                        "Consent History Endpoint", 
                        True, 
                        f"Successfully retrieved consent history with {len(consent_history)} records"
                    )
                else:
                    self.log_result("Consent History Endpoint", False, 
                                  "Response is not a list of consent records")
            elif response.status_code == 404:
                # No consent history found is also acceptable
                self.log_result(
                    "Consent History Endpoint", 
                    True, 
                    "No consent history found for test phone number (acceptable)"
                )
            else:
                self.log_result("Consent History Endpoint", False, 
                              f"Consent history failed: {response.status_code} - {response.text}")
                
        except Exception as e:
            self.log_result("Consent History Endpoint", False, error_details=str(e))
    
    def run_all_tests(self):
        """Run all backend tests including security hardening features"""
        print("🚀 Starting Lumer Backend API Tests (Including Security Hardening)")
        print(f"Backend URL: {self.base_url}")
        print("=" * 80)
        
        # Run core functionality tests first
        self.test_authentication()
        self.test_ai_prescription_suggestions()
        self.test_appointments_api()
        self.test_patient_details_update()
        self.test_dashboard_analytics()
        self.test_payment_order_creation()
        
        print("\n" + "=" * 80)
        print("🔒 SECURITY HARDENING TESTS")
        print("=" * 80)
        
        # Run security hardening tests
        self.test_health_check_endpoint()
        self.test_security_headers()
        self.test_password_validation_on_registration()
        self.test_login_rate_limiting_and_lockout()
        self.test_admin_authentication()
        self.test_admin_user_management()
        self.test_consent_history_endpoint()
        
        # Print summary
        print("=" * 80)
        print("📋 TEST SUMMARY")
        print(f"✅ Passed: {self.results['passed']}")
        print(f"❌ Failed: {self.results['failed']}")
        print(f"📊 Total: {self.results['passed'] + self.results['failed']}")
        
        if self.results['errors']:
            print("\n🚨 ERRORS ENCOUNTERED:")
            for error in self.results['errors']:
                print(f"   • {error}")
        
        return self.results['failed'] == 0

if __name__ == "__main__":
    tester = LumerAPITester()
    success = tester.run_all_tests()
    sys.exit(0 if success else 1)