#!/usr/bin/env python3
"""
Comprehensive Backend API Testing for Lumer Application
Tests authentication, AI suggestions, patient management, and analytics
"""

import requests
import json
import sys
import os
from datetime import datetime, timedelta
import uuid

# Configuration
BACKEND_URL = "https://medsync-app-6.preview.emergentagent.com/api"
TEST_EMAIL = "sarah@test.com"
TEST_PASSWORD = "test123456"

class LumerAPITester:
    def __init__(self):
        self.base_url = BACKEND_URL
        self.token = None
        self.user_data = None
        self.test_appointment_id = None
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
    
    def run_all_tests(self):
        """Run all backend tests"""
        print("🚀 Starting Lumer Backend API Tests")
        print(f"Backend URL: {self.base_url}")
        print("=" * 60)
        
        # Run tests in order
        self.test_authentication()
        self.test_ai_prescription_suggestions()
        self.test_appointments_api()
        self.test_patient_details_update()
        self.test_dashboard_analytics()
        self.test_payment_order_creation()
        
        # Print summary
        print("=" * 60)
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