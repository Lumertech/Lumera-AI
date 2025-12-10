from fastapi import FastAPI, APIRouter, HTTPException, Request, Form, Depends, Header, Query
from fastapi.responses import Response, RedirectResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta
from passlib.context import CryptContext
import jwt
from contextlib import asynccontextmanager
import qrcode
import io
import base64
from twilio.rest import Client
from twilio.twiml.messaging_response import MessagingResponse
from twilio.request_validator import RequestValidator
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
import requests
import razorpay
import hmac
import hashlib
import random
import httpx
import json
from emergentintegrations.llm.chat import LlmChat, UserMessage

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Security
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
JWT_SECRET = os.environ.get('JWT_SECRET_KEY', 'your-secret-key')
JWT_ALGORITHM = "HS256"

# Scheduler
scheduler = BackgroundScheduler()

# Twilio Setup
twilio_client = None
twilio_validator = None
if os.environ.get('TWILIO_ACCOUNT_SID') and os.environ.get('TWILIO_AUTH_TOKEN'):
    if os.environ['TWILIO_ACCOUNT_SID'] != 'your_twilio_account_sid':
        twilio_client = Client(os.environ['TWILIO_ACCOUNT_SID'], os.environ['TWILIO_AUTH_TOKEN'])
        twilio_validator = RequestValidator(os.environ['TWILIO_AUTH_TOKEN'])

# Razorpay Setup
razorpay_client = None
if os.environ.get('RAZORPAY_KEY_ID') and os.environ.get('RAZORPAY_KEY_SECRET'):
    if os.environ['RAZORPAY_KEY_ID'] != 'your_razorpay_key_id':
        razorpay_client = razorpay.Client(auth=(os.environ['RAZORPAY_KEY_ID'], os.environ['RAZORPAY_KEY_SECRET']))

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    # 24-hour reminders at 10 AM daily
    scheduler.add_job(
        send_appointment_reminders,
        CronTrigger(hour=10, minute=0),
        id="appointment_reminders_24h",
        name="Send 24h appointment reminders"
    )
    # 4-hour reminders - check every hour
    scheduler.add_job(
        send_4hour_reminders,
        CronTrigger(minute=0),  # Every hour
        id="appointment_reminders_4h",
        name="Send 4h appointment reminders"
    )
    scheduler.start()
    yield
    # Shutdown
    scheduler.shutdown()
    client.close()

app = FastAPI(lifespan=lifespan)
api_router = APIRouter(prefix="/api")

# Models
class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str
    phone_number: str
    profession: str = "doctor"

class RazorpayConfig(BaseModel):
    razorpay_key_id: str
    razorpay_key_secret: str

class PaymentFees(BaseModel):
    consultation_fee: int = 500
    followup_fee: int = 300
    custom_payment_types: Optional[List[Dict[str, Any]]] = []

class PaymentRequest(BaseModel):
    package: str
    payment_type: str  # upi, card, netbanking, cash
    
class CashPaymentRecord(BaseModel):
    appointment_id: str
    amount: int
    collected_by: str
    notes: Optional[str] = None

class WhatsAppTemplateConfig(BaseModel):
    templates: Dict[str, str]

class BotInstructions(BaseModel):
    instructions: str

class TabConfiguration(BaseModel):
    tabs: Dict[str, bool]

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class PhoneVerifyRequest(BaseModel):
    phone_number: str

class TimeOffCreate(BaseModel):
    date: str  # YYYY-MM-DD
    start_time: Optional[str] = None  # HH:MM (None for full day)
    end_time: Optional[str] = None  # HH:MM (None for full day)
    reason: str
    is_full_day: bool = True
    is_recurring: bool = False
    recurrence_pattern: Optional[str] = None  # "weekly", "monthly", etc.

class TimeOffResponse(BaseModel):
    id: str
    user_id: str
    date: str
    start_time: Optional[str]
    end_time: Optional[str]
    reason: str
    is_full_day: bool
    is_recurring: bool
    recurrence_pattern: Optional[str]
    created_at: str

class AdminLogin(BaseModel):
    email: EmailStr
    password: str

class LandingPageContent(BaseModel):
    hero_title: str
    hero_subtitle: str
    hero_image_url: str
    tagline: str
    feature_1_title: str
    feature_1_description: str
    feature_2_title: str
    feature_2_description: str
    feature_3_title: str
    feature_3_description: str

class UserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone_number: Optional[str] = None
    profession: Optional[str] = None
    is_active: Optional[bool] = None

class OTPVerifyRequest(BaseModel):
    phone_number: str
    otp: str

class PatientDetails(BaseModel):
    name: str
    age: int
    sex: str
    blood_group: Optional[str] = None
    allergies: Optional[str] = None
    chronic_conditions: Optional[str] = None
    emergency_contact: Optional[str] = None

class PrescriptionItem(BaseModel):
    medicine_name: str
    dosage: str
    frequency: str
    duration: str
    instructions: Optional[str] = None

class User(BaseModel):
    id: str
    name: str
    email: EmailStr
    phone_number: str
    profession: str
    whatsapp_verified: bool = False
    google_tokens: Optional[Dict] = None
    created_at: datetime

class AppointmentCreate(BaseModel):
    client_name: str
    client_phone: str
    client_email: Optional[EmailStr] = None
    appointment_date: str
    start_time: str
    end_time: str
    consultation_mode: str = "in-person"
    notes: Optional[str] = None

class Appointment(BaseModel):
    id: str
    professional_id: str
    client_name: str
    client_phone: str
    client_email: Optional[str] = None
    appointment_date: str
    start_time: str
    end_time: str
    consultation_mode: str
    status: str = "scheduled"
    notes: Optional[str] = None
    reminder_sent: bool = False
    payment_status: str = "pending"
    created_at: datetime

class ClientRecord(BaseModel):
    id: str
    professional_id: str
    name: str
    phone: str
    email: Optional[str] = None
    total_appointments: int = 0
    last_appointment: Optional[datetime] = None
    notes: Optional[str] = None
    created_at: datetime

class TimeSlot(BaseModel):
    date: str
    start_time: str
    end_time: str
    available: bool = True

class ReminderConfig(BaseModel):
    enabled: bool = True
    hours_before: int = 24
    message_template: str

class PrescriptionCreate(BaseModel):
    appointment_id: str
    client_name: str
    medications: List[Dict[str, Any]]
    instructions: str

# Helper Functions
def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def create_access_token(data: dict, expires_delta: timedelta = timedelta(days=7)):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + expires_delta
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)

def verify_token(token: str):
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except:
        return None

async def get_current_user(authorization: str = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = authorization.split(" ")[1]
    payload = verify_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.users.find_one({"id": payload.get("user_id")}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user

async def get_admin_user(current_user: dict = Depends(get_current_user)):
    """Check if current user is admin"""
    if current_user.get('role') != 'admin':
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user

def generate_qr_code(data: str) -> str:
    qr = qrcode.QRCode(version=1, box_size=10, border=5)
    qr.add_data(data)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buffer = io.BytesIO()
    img.save(buffer, format='PNG')
    buffer.seek(0)
    return base64.b64encode(buffer.getvalue()).decode()

async def send_whatsapp_message(to_number: str, message: str):
    if not twilio_client:
        logging.warning("Twilio not configured - check Settings")
        return None
    try:
        # Clean phone number
        clean_number = to_number.replace("whatsapp:", "").strip()
        if not clean_number.startswith("+"):
            clean_number = "+" + clean_number
        
        from_number = os.environ.get('TWILIO_WHATSAPP_NUMBER', 'whatsapp:+14155238886')
        logging.info(f"Sending WhatsApp from {from_number} to whatsapp:{clean_number}")
        
        msg = twilio_client.messages.create(
            from_=from_number,
            to=f"whatsapp:{clean_number}",
            body=message
        )
        logging.info(f"WhatsApp message sent successfully: {msg.sid}")
        return msg.sid
    except Exception as e:
        logging.error(f"Failed to send WhatsApp message to {to_number}: {e}")
        return None

async def send_appointment_reminders():
    """Send 24-hour reminders"""
    tomorrow = (datetime.now(timezone.utc) + timedelta(days=1)).strftime("%Y-%m-%d")
    appointments = await db.appointments.find({
        "appointment_date": tomorrow,
        "status": "scheduled",
        "reminder_24h_sent": {"$ne": True}
    }, {"_id": 0}).to_list(None)
    
    for appt in appointments:
        # Get doctor name
        doctor = await db.users.find_one({"id": appt['professional_id']}, {"_id": 0})
        doctor_name = doctor.get('name', 'Doctor') if doctor else 'Doctor'
        
        message = f"\ud83d\udd14 Reminder: Your appointment with Dr. {doctor_name} is tomorrow at {appt['start_time']}.\n\nPlease arrive 10 minutes early.\n\n\ud83d\udccd Address: [Clinic Address]\n\ud83d\udcde Contact: {doctor.get('phone_number', '')}\n\nSee you soon!"
        
        await send_whatsapp_message(appt['client_phone'], message)
        await db.appointments.update_one(
            {"id": appt['id']},
            {"$set": {"reminder_24h_sent": True}}
        )
        logging.info(f"24h reminder sent for appointment {appt['id']}")

async def send_4hour_reminders():
    """Send 4-hour before reminders"""
    now = datetime.now(timezone.utc)
    four_hours_later = now + timedelta(hours=4)
    
    # Get appointments happening in 4 hours
    today = now.strftime("%Y-%m-%d")
    target_time = four_hours_later.strftime("%H:%M")
    
    appointments = await db.appointments.find({
        "appointment_date": today,
        "status": "scheduled",
        "reminder_4h_sent": {"$ne": True}
    }, {"_id": 0}).to_list(None)
    
    for appt in appointments:
        # Check if appointment is within 4 hours
        appt_time = appt.get('start_time', '00:00')
        
        doctor = await db.users.find_one({"id": appt['professional_id']}, {"_id": 0})
        doctor_name = doctor.get('name', 'Doctor') if doctor else 'Doctor'
        
        message = f"\u23f0 Reminder: Your appointment with Dr. {doctor_name} is in 4 hours at {appt_time}.\n\nPlease be ready!\n\n\ud83d\udccd Address: [Clinic Address]\n\nSee you soon!"
        
        await send_whatsapp_message(appt['client_phone'], message)
        await db.appointments.update_one(
            {"id": appt['id']},
            {"$set": {"reminder_4h_sent": True}}
        )
        logging.info(f"4h reminder sent for appointment {appt['id']}")

# Auth Routes
@api_router.post("/auth/register")
async def register(user_data: UserCreate):
    existing = await db.users.find_one({"email": user_data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    user_id = str(uuid.uuid4())
    user = {
        "id": user_id,
        "name": user_data.name,
        "email": user_data.email,
        "hashed_password": pwd_context.hash(user_data.password),
        "phone_number": user_data.phone_number,
        "profession": user_data.profession,
        "role": "user",  # Default role
        "whatsapp_verified": False,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.users.insert_one(user)
    
    token = create_access_token({"user_id": user_id, "email": user_data.email})
    return {"token": token, "user": {k: v for k, v in user.items() if k not in ["hashed_password", "_id"]}}

@api_router.post("/auth/login")
async def login(credentials: UserLogin):
    user = await db.users.find_one({"email": credentials.email})
    if not user or not pwd_context.verify(credentials.password, user["hashed_password"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    token = create_access_token({"user_id": user["id"], "email": user["email"]})
    user_data = {k: v for k, v in user.items() if k not in ["hashed_password", "_id"]}
    return {"token": token, "user": user_data}

@api_router.get("/auth/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    return current_user

# WhatsApp OTP Authentication
@api_router.post("/auth/send-otp")
async def send_otp(request: PhoneVerifyRequest):
    otp = str(random.randint(100000, 999999))
    
    # Store OTP in database with 10 minute expiry
    await db.otp_codes.update_one(
        {"phone_number": request.phone_number},
        {
            "$set": {
                "otp": otp,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat()
            }
        },
        upsert=True
    )
    
    # Send OTP via WhatsApp
    message = f"Your Lumer verification code is {otp}. Valid for 10 minutes. Do not share this code with anyone."
    await send_whatsapp_message(request.phone_number, message)
    
    return {"message": "OTP sent successfully", "phone_number": request.phone_number}

@api_router.post("/auth/verify-otp")
async def verify_otp(request: OTPVerifyRequest):
    # Check OTP
    otp_record = await db.otp_codes.find_one({"phone_number": request.phone_number})
    
    if not otp_record:
        raise HTTPException(status_code=400, detail="OTP not found or expired")
    
    if otp_record["otp"] != request.otp:
        raise HTTPException(status_code=400, detail="Invalid OTP")
    
    # Check expiry
    expires_at = datetime.fromisoformat(otp_record["expires_at"])
    if datetime.now(timezone.utc) > expires_at:
        raise HTTPException(status_code=400, detail="OTP expired")
    
    # Check if user exists
    user = await db.users.find_one({"phone_number": request.phone_number})
    
    if user:
        # Existing user - login
        token = create_access_token({"user_id": user["id"], "phone": user["phone_number"]})
        user_data = {k: v for k, v in user.items() if k not in ["password", "_id"]}
        
        # Delete used OTP
        await db.otp_codes.delete_one({"phone_number": request.phone_number})
        
        return {"token": token, "user": user_data, "is_new_user": False}
    else:
        # New user - return flag to complete registration
        return {"message": "Phone verified", "phone_number": request.phone_number, "is_new_user": True}

@api_router.post("/auth/complete-registration")
async def complete_registration(name: str, profession: str, phone_number: str):
    # Verify OTP was validated
    otp_record = await db.otp_codes.find_one({"phone_number": phone_number})
    if not otp_record:
        raise HTTPException(status_code=400, detail="Phone number not verified")
    
    user_id = str(uuid.uuid4())
    user = {
        "id": user_id,
        "name": name,
        "email": f"{phone_number}@lumer.app",  # Generate email
        "phone_number": phone_number,
        "profession": profession,
        "whatsapp_verified": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.users.insert_one(user)
    
    # Delete used OTP
    await db.otp_codes.delete_one({"phone_number": phone_number})
    
    token = create_access_token({"user_id": user_id, "phone": phone_number})
    return {"token": token, "user": {k: v for k, v in user.items() if k != "_id"}}

# Google Calendar Auth
@api_router.get("/auth/google/login")
async def google_login():
    client_id = os.environ.get('GOOGLE_CLIENT_ID')
    redirect_uri = os.environ.get('GOOGLE_REDIRECT_URI')
    scope = "https://www.googleapis.com/auth/calendar"
    auth_url = (
        f"https://accounts.google.com/o/oauth2/auth?"
        f"client_id={client_id}&"
        f"redirect_uri={redirect_uri}&"
        f"response_type=code&"
        f"scope={scope}&"
        f"access_type=offline&"
        f"prompt=consent"
    )
    return {"authorization_url": auth_url}

@api_router.get("/auth/google/callback")
async def google_callback(code: str, current_user: dict = Depends(get_current_user)):
    try:
        token_resp = requests.post('https://oauth2.googleapis.com/token', data={
            'code': code,
            'client_id': os.environ.get('GOOGLE_CLIENT_ID'),
            'client_secret': os.environ.get('GOOGLE_CLIENT_SECRET'),
            'redirect_uri': os.environ.get('GOOGLE_REDIRECT_URI'),
            'grant_type': 'authorization_code'
        }).json()
        
        await db.users.update_one(
            {"id": current_user['id']},
            {"$set": {"google_tokens": token_resp}}
        )
        return RedirectResponse("/dashboard?google_connected=true")
    except Exception as e:
        logging.error(f"Google auth failed: {e}")
        raise HTTPException(status_code=400, detail="Failed to connect Google Calendar")

# Appointments
@api_router.post("/appointments")
async def create_appointment(appt: AppointmentCreate, current_user: dict = Depends(get_current_user)):
    appointment_id = str(uuid.uuid4())
    appointment = {
        "id": appointment_id,
        "professional_id": current_user['id'],
        "client_name": appt.client_name,
        "client_phone": appt.client_phone,
        "client_email": appt.client_email,
        "appointment_date": appt.appointment_date,
        "start_time": appt.start_time,
        "end_time": appt.end_time,
        "consultation_mode": appt.consultation_mode,
        "status": "scheduled",
        "notes": appt.notes,
        "reminder_sent": False,
        "payment_status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    result = await db.appointments.insert_one(appointment.copy())
    
    # Update or create client record
    client = await db.clients.find_one({
        "professional_id": current_user['id'],
        "phone": appt.client_phone
    }, {"_id": 0})
    if client:
        await db.clients.update_one(
            {"id": client['id']},
            {"$inc": {"total_appointments": 1}, "$set": {"last_appointment": datetime.now(timezone.utc).isoformat()}}
        )
    else:
        client_id = str(uuid.uuid4())
        await db.clients.insert_one({
            "id": client_id,
            "professional_id": current_user['id'],
            "name": appt.client_name,
            "phone": appt.client_phone,
            "email": appt.client_email,
            "total_appointments": 1,
            "last_appointment": datetime.now(timezone.utc).isoformat(),
            "created_at": datetime.now(timezone.utc).isoformat()
        })
    
    # Send WhatsApp confirmation
    await send_whatsapp_message(
        appt.client_phone,
        f"Your appointment with {current_user['name']} is confirmed for {appt.appointment_date} at {appt.start_time}."
    )
    
    return appointment

@api_router.get("/appointments")
async def get_appointments(current_user: dict = Depends(get_current_user)):
    appointments = await db.appointments.find(
        {"professional_id": current_user['id']},
        {"_id": 0}
    ).sort("appointment_date", -1).to_list(100)
    return appointments

@api_router.get("/appointments/{appointment_id}")
async def get_appointment(appointment_id: str, current_user: dict = Depends(get_current_user)):
    appt = await db.appointments.find_one(
        {"id": appointment_id, "professional_id": current_user['id']},
        {"_id": 0}
    )
    if not appt:
        raise HTTPException(status_code=404, detail="Appointment not found")
    return appt

@api_router.put("/appointments/{appointment_id}")
async def update_appointment(appointment_id: str, updates: dict, current_user: dict = Depends(get_current_user)):
    result = await db.appointments.update_one(
        {"id": appointment_id, "professional_id": current_user['id']},
        {"$set": updates}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Appointment not found")
    return {"message": "Updated successfully"}

@api_router.delete("/appointments/{appointment_id}")
async def delete_appointment(appointment_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.appointments.delete_one(
        {"id": appointment_id, "professional_id": current_user['id']}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Appointment not found")
    return {"message": "Deleted successfully"}

# Clients
@api_router.get("/clients")
async def get_clients(current_user: dict = Depends(get_current_user)):
    clients = await db.clients.find(
        {"professional_id": current_user['id']},
        {"_id": 0}
    ).to_list(1000)
    return clients

@api_router.get("/clients/{client_id}")
async def get_client(client_id: str, current_user: dict = Depends(get_current_user)):
    client = await db.clients.find_one(
        {"id": client_id, "professional_id": current_user['id']},
        {"_id": 0}
    )
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    appointments = await db.appointments.find(
        {"professional_id": current_user['id'], "client_phone": client['phone']},
        {"_id": 0}
    ).to_list(100)
    
    prescriptions = await db.prescriptions.find(
        {"professional_id": current_user['id'], "client_phone": client['phone']},
        {"_id": 0}
    ).to_list(100)
    
    return {**client, "appointments": appointments, "prescriptions": prescriptions}

# Patient Details Management
@api_router.put("/appointments/{appointment_id}/patient-details")
async def update_patient_details(
    appointment_id: str,
    patient_details: PatientDetails,
    current_user: dict = Depends(get_current_user)
):
    appointment = await db.appointments.find_one(
        {"id": appointment_id, "professional_id": current_user['id']},
        {"_id": 0}
    )
    if not appointment:
        raise HTTPException(status_code=404, detail="Appointment not found")
    
    # Update appointment with patient details and name
    await db.appointments.update_one(
        {"id": appointment_id},
        {"$set": {
            "client_name": patient_details.name,
            "patient_details": patient_details.dict(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # Update client record with patient details and name
    await db.clients.update_one(
        {"professional_id": current_user['id'], "phone": appointment["client_phone"]},
        {"$set": {
            "name": patient_details.name,
            "patient_details": patient_details.dict(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {"message": "Patient details updated successfully"}

@api_router.get("/appointments/{appointment_id}/patient-details")
async def get_patient_details(appointment_id: str, current_user: dict = Depends(get_current_user)):
    appointment = await db.appointments.find_one(
        {"id": appointment_id, "professional_id": current_user['id']},
        {"_id": 0}
    )
    if not appointment:
        raise HTTPException(status_code=404, detail="Appointment not found")
    
    return appointment.get("patient_details", {})

# Time Slots
@api_router.get("/slots/available")
async def get_available_slots(date: str, current_user: dict = Depends(get_current_user)):
    # Get existing appointments for the date
    appointments = await db.appointments.find({
        "professional_id": current_user['id'],
        "appointment_date": date,
        "status": {"$ne": "cancelled"}
    }, {"_id": 0}).to_list(100)
    
    booked_times = [(a['start_time'], a['end_time']) for a in appointments]
    
    # Check for time-offs on this date
    time_offs = await db.time_offs.find({
        "user_id": current_user['id'],
        "date": date
    }, {"_id": 0}).to_list(100)
    
    # Check if entire day is blocked
    is_full_day_off = any(to.get('is_full_day', False) for to in time_offs)
    
    # Get time-off slots
    time_off_slots = []
    for to in time_offs:
        if not to.get('is_full_day', False) and to.get('start_time') and to.get('end_time'):
            time_off_slots.append((to['start_time'], to['end_time']))
    
    # Generate default slots (9 AM to 5 PM, 30-min intervals)
    slots = []
    for hour in range(9, 17):
        for minute in [0, 30]:
            start = f"{hour:02d}:{minute:02d}"
            end_hour = hour if minute == 0 else hour + 1
            end_minute = 30 if minute == 0 else 0
            end = f"{end_hour:02d}:{end_minute:02d}"
            
            # Check if slot is available (not booked and not during time-off)
            booked = any(start >= bt[0] and start < bt[1] for bt in booked_times)
            time_off = any(start >= to[0] and start < to[1] for to in time_off_slots)
            available = not (booked or time_off or is_full_day_off)
            
            slots.append({
                "start_time": start, 
                "end_time": end, 
                "available": available,
                "reason": "time-off" if (time_off or is_full_day_off) else ("booked" if booked else "available")
            })
    
    return {"date": date, "slots": slots, "is_full_day_off": is_full_day_off}

# Time-Off Management
@api_router.post("/time-off")
async def create_time_off(time_off: TimeOffCreate, current_user: dict = Depends(get_current_user)):
    """Create a new time-off period"""
    time_off_id = str(uuid.uuid4())
    
    time_off_data = {
        "id": time_off_id,
        "user_id": current_user['id'],
        "date": time_off.date,
        "start_time": time_off.start_time,
        "end_time": time_off.end_time,
        "reason": time_off.reason,
        "is_full_day": time_off.is_full_day,
        "is_recurring": time_off.is_recurring,
        "recurrence_pattern": time_off.recurrence_pattern,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    result = await db.time_offs.insert_one(time_off_data)
    # Return without MongoDB _id
    return {k: v for k, v in time_off_data.items() if k != '_id'}

@api_router.get("/time-off")
async def get_time_offs(current_user: dict = Depends(get_current_user)):
    """Get all time-off periods for current user"""
    time_offs = await db.time_offs.find(
        {"user_id": current_user['id']},
        {"_id": 0}
    ).to_list(1000)
    return time_offs

@api_router.delete("/time-off/{time_off_id}")
async def delete_time_off(time_off_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a time-off period"""
    result = await db.time_offs.delete_one({
        "id": time_off_id,
        "user_id": current_user['id']
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Time-off not found")
    
    return {"message": "Time-off deleted successfully"}

@api_router.get("/calendar/export")
async def export_calendar(current_user: dict = Depends(get_current_user)):
    """Export appointments and time-offs as .ics file"""
    from icalendar import Calendar, Event as ICalEvent
    
    cal = Calendar()
    cal.add('prodid', '-//Lumer Calendar//lumer.app//')
    cal.add('version', '2.0')
    cal.add('calscale', 'GREGORIAN')
    cal.add('method', 'PUBLISH')
    cal.add('x-wr-calname', f'Lumer - {current_user["name"]}')
    cal.add('x-wr-timezone', 'UTC')
    
    # Add appointments
    appointments = await db.appointments.find(
        {"professional_id": current_user['id']},
        {"_id": 0}
    ).to_list(1000)
    
    for appt in appointments:
        event = ICalEvent()
        event.add('uid', appt['id'])
        event.add('summary', f"Appointment: {appt.get('client_name', 'Patient')}")
        
        # Parse date and time
        appt_date = datetime.strptime(appt['appointment_date'], '%Y-%m-%d')
        start_time = appt.get('start_time', '09:00')
        end_time = appt.get('end_time', '09:30')
        
        start_dt = datetime.strptime(f"{appt['appointment_date']} {start_time}", '%Y-%m-%d %H:%M')
        end_dt = datetime.strptime(f"{appt['appointment_date']} {end_time}", '%Y-%m-%d %H:%M')
        
        event.add('dtstart', start_dt)
        event.add('dtend', end_dt)
        event.add('description', appt.get('notes', ''))
        event.add('status', appt.get('status', 'CONFIRMED').upper())
        
        cal.add_component(event)
    
    # Add time-offs
    time_offs = await db.time_offs.find(
        {"user_id": current_user['id']},
        {"_id": 0}
    ).to_list(1000)
    
    for time_off in time_offs:
        event = ICalEvent()
        event.add('uid', time_off['id'])
        event.add('summary', f"Time Off: {time_off['reason']}")
        
        if time_off['is_full_day']:
            # All-day event
            event_date = datetime.strptime(time_off['date'], '%Y-%m-%d').date()
            event.add('dtstart', event_date)
            event.add('dtend', event_date)
        else:
            # Specific time slot
            start_dt = datetime.strptime(f"{time_off['date']} {time_off['start_time']}", '%Y-%m-%d %H:%M')
            end_dt = datetime.strptime(f"{time_off['date']} {time_off['end_time']}", '%Y-%m-%d %H:%M')
            event.add('dtstart', start_dt)
            event.add('dtend', end_dt)
        
        event.add('description', time_off['reason'])
        event.add('status', 'CONFIRMED')
        event.add('transp', 'OPAQUE')  # Show as busy
        
        # Handle recurring events
        if time_off.get('is_recurring') and time_off.get('recurrence_pattern'):
            if time_off['recurrence_pattern'] == 'weekly':
                event.add('rrule', {'freq': 'weekly'})
            elif time_off['recurrence_pattern'] == 'monthly':
                event.add('rrule', {'freq': 'monthly'})
        
        cal.add_component(event)
    
    ics_content = cal.to_ical()
    
    return Response(
        content=ics_content,
        media_type="text/calendar",
        headers={
            "Content-Disposition": f"attachment; filename=lumer_calendar_{current_user['name'].replace(' ', '_')}.ics"
        }
    )

# Razorpay Configuration Management
@api_router.post("/settings/razorpay")
async def save_razorpay_config(config: RazorpayConfig, current_user: dict = Depends(get_current_user)):
    await db.users.update_one(
        {"id": current_user['id']},
        {"$set": {
            "razorpay_key_id": config.razorpay_key_id,
            "razorpay_key_secret": config.razorpay_key_secret,
            "razorpay_configured": True
        }}
    )
    return {"message": "Razorpay configured successfully"}

@api_router.get("/settings/razorpay")
async def get_razorpay_config(current_user: dict = Depends(get_current_user)):
    user = await db.users.find_one({"id": current_user['id']}, {"_id": 0})
    return {
        "configured": user.get("razorpay_configured", False),
        "key_id": user.get("razorpay_key_id", "") if user.get("razorpay_configured") else ""
    }

# Payment Fees Configuration
@api_router.post("/settings/payment-fees")
async def save_payment_fees(fees: PaymentFees, current_user: dict = Depends(get_current_user)):
    await db.users.update_one(
        {"id": current_user['id']},
        {"$set": {
            "payment_fees": fees.dict()
        }}
    )
    return {"message": "Payment fees updated successfully"}

@api_router.get("/settings/payment-fees")
async def get_payment_fees(current_user: dict = Depends(get_current_user)):
    user = await db.users.find_one({"id": current_user['id']}, {"_id": 0})
    return user.get("payment_fees", {
        "consultation_fee": 500,
        "followup_fee": 300,
        "full_checkup_fee": 1000
    })

# WhatsApp Templates Configuration
@api_router.post("/settings/whatsapp-templates")
async def save_whatsapp_templates(config: WhatsAppTemplateConfig, current_user: dict = Depends(get_current_user)):
    await db.users.update_one(
        {"id": current_user['id']},
        {"$set": {"whatsapp_templates": config.templates}}
    )
    return {"message": "WhatsApp templates saved successfully"}

@api_router.get("/settings/whatsapp-templates")
async def get_whatsapp_templates(current_user: dict = Depends(get_current_user)):
    user = await db.users.find_one({"id": current_user['id']}, {"_id": 0})
    return user.get("whatsapp_templates", {
        "welcome": "Welcome to {clinic_name}! I'm here to help you book appointments.",
        "appointment_confirmation": "Your appointment is confirmed for {date} at {time}. See you soon!",
        "reminder": "Reminder: Your appointment is tomorrow at {time}. Please arrive 10 minutes early.",
        "prescription": "Your prescription from Dr. {doctor_name} is ready. Please follow the instructions carefully."
    })

# Bot Instructions Configuration
@api_router.post("/settings/bot-instructions")
async def save_bot_instructions(config: BotInstructions, current_user: dict = Depends(get_current_user)):
    await db.users.update_one(
        {"id": current_user['id']},
        {"$set": {"bot_instructions": config.instructions}}
    )
    return {"message": "Bot instructions saved successfully"}

@api_router.get("/settings/bot-instructions")
async def get_bot_instructions(current_user: dict = Depends(get_current_user)):
    user = await db.users.find_one({"id": current_user['id']}, {"_id": 0})
    return {
        "instructions": user.get("bot_instructions", "You are a helpful medical receptionist. Be polite and professional.")
    }

# Tab Configuration
@api_router.post("/settings/tab-configuration")
async def save_tab_configuration(config: TabConfiguration, current_user: dict = Depends(get_current_user)):
    await db.users.update_one(
        {"id": current_user['id']},
        {"$set": {"tab_configuration": config.tabs}}
    )
    return {"message": "Tab configuration saved successfully"}

@api_router.get("/settings/tab-configuration")
async def get_tab_configuration(current_user: dict = Depends(get_current_user)):
    user = await db.users.find_one({"id": current_user['id']}, {"_id": 0})
    return user.get("tab_configuration", {
        "dashboard": True,
        "appointments": True,
        "clients": True,
        "whatsapp": True,
        "payments": True,
        "reminders": True,
        "tools": True,
        "settings": True
    })

# Cash Payment Recording
@api_router.post("/payments/cash")
async def record_cash_payment(payment: CashPaymentRecord, current_user: dict = Depends(get_current_user)):
    try:
        payment_id = str(uuid.uuid4())
        cash_record = {
            "id": payment_id,
            "appointment_id": payment.appointment_id,
            "user_id": current_user['id'],
            "amount": payment.amount,
            "currency": "INR",
            "payment_type": "cash",
            "payment_status": "paid",
            "collected_by": payment.collected_by,
            "notes": payment.notes,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.payment_transactions.insert_one(cash_record)
        
        # Update appointment payment status
        await db.appointments.update_one(
            {"id": payment.appointment_id},
            {"$set": {"payment_status": "paid", "payment_type": "cash"}}
        )
        
        return {"message": "Cash payment recorded successfully", "payment_id": payment_id}
    except Exception as e:
        logging.error(f"Cash payment recording failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to record cash payment")

# Payments - Razorpay (Per-User) with Payment Type
@api_router.post("/payments/create-order")
async def create_payment_order(
    package: str = "consultation",
    payment_type: str = "upi",
    current_user: dict = Depends(get_current_user)
):
    # Get user's Razorpay credentials
    user = await db.users.find_one({"id": current_user['id']}, {"_id": 0})
    
    if not user.get("razorpay_configured"):
        raise HTTPException(
            status_code=400, 
            detail="Please configure your Razorpay credentials in Settings first"
        )
    
    try:
        # Create user-specific Razorpay client
        user_razorpay = razorpay.Client(auth=(user["razorpay_key_id"], user["razorpay_key_secret"]))
        
        # Get user's configured payment fees
        payment_fees = user.get("payment_fees", {
            "consultation_fee": 500,
            "followup_fee": 300,
            "full_checkup_fee": 1000
        })
        
        # Package prices in INR (₹)
        fee_mapping = {
            "consultation": payment_fees.get("consultation_fee", 500),
            "follow_up": payment_fees.get("followup_fee", 300),
            "full_checkup": payment_fees.get("full_checkup_fee", 1000)
        }
        amount_inr = fee_mapping.get(package, 500)
        amount_paise = amount_inr * 100  # Convert to paise
        
        order_data = {
            "amount": amount_paise,
            "currency": "INR",
            "payment_capture": 1,
            "notes": {
                "user_id": current_user['id'],
                "package": package,
                "payment_type": payment_type
            }
        }
        razorpay_order = user_razorpay.order.create(data=order_data)
        
        # Create payment link
        payment_link_data = {
            "amount": amount_paise,
            "currency": "INR",
            "description": f"{package.replace('_', ' ').title()} - Lumer",
            "customer": {
                "name": current_user['name'],
                "email": current_user.get('email', ''),
                "contact": current_user.get('phone_number', '')
            },
            "notify": {
                "sms": False,
                "email": False,
                "whatsapp": False
            },
            "callback_url": f"{os.environ.get('REACT_APP_BACKEND_URL', '')}/dashboard",
            "callback_method": "get"
        }
        
        payment_link = user_razorpay.payment_link.create(payment_link_data)
        
        # Store order in database
        await db.payment_transactions.insert_one({
            "order_id": razorpay_order['id'],
            "payment_link_id": payment_link['id'],
            "payment_link": payment_link['short_url'],
            "user_id": current_user['id'],
            "amount": amount_inr,
            "currency": "INR",
            "package": package,
            "payment_type": payment_type,
            "payment_status": "created",
            "created_at": datetime.now(timezone.utc).isoformat()
        })
        
        # Generate QR code for the payment link
        qr_code_base64 = generate_qr_code(payment_link['short_url'])
        
        return {
            "order_id": razorpay_order['id'],
            "payment_link": payment_link['short_url'],
            "qr_code": qr_code_base64,
            "amount": amount_paise,
            "currency": "INR",
            "payment_type": payment_type,
            "key_id": user["razorpay_key_id"]
        }
    except Exception as e:
        logging.error(f"Razorpay order creation failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to create payment order")

@api_router.post("/payments/verify")
async def verify_payment(
    razorpay_order_id: str,
    razorpay_payment_id: str,
    razorpay_signature: str,
    current_user: dict = Depends(get_current_user)
):
    if not razorpay_client:
        raise HTTPException(status_code=500, detail="Razorpay not configured")
    
    try:
        # Verify payment signature
        params_dict = {
            'razorpay_order_id': razorpay_order_id,
            'razorpay_payment_id': razorpay_payment_id,
            'razorpay_signature': razorpay_signature
        }
        razorpay_client.utility.verify_payment_signature(params_dict)
        
        # Update payment status in database
        await db.payment_transactions.update_one(
            {"order_id": razorpay_order_id},
            {"$set": {
                "payment_id": razorpay_payment_id,
                "payment_status": "paid",
                "updated_at": datetime.now(timezone.utc).isoformat()
            }}
        )
        
        return {"status": "success", "message": "Payment verified successfully"}
    except razorpay.errors.SignatureVerificationError:
        logging.error("Payment signature verification failed")
        raise HTTPException(status_code=400, detail="Invalid payment signature")

@api_router.get("/payments/status/{order_id}")
async def check_payment_status(order_id: str, current_user: dict = Depends(get_current_user)):
    transaction = await db.payment_transactions.find_one(
        {"order_id": order_id, "user_id": current_user['id']},
        {"_id": 0}
    )
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    return transaction

@api_router.post("/payments/generate-qr")
async def generate_payment_qr(amount: int, current_user: dict = Depends(get_current_user)):
    if not razorpay_client:
        raise HTTPException(status_code=500, detail="Razorpay not configured")
    
    try:
        # Create Razorpay payment link
        payment_link = razorpay_client.payment_link.create({
            "amount": amount * 100,  # Convert to paise
            "currency": "INR",
            "description": "Lumer Appointment Payment",
            "customer": {
                "name": current_user['name'],
                "email": current_user['email'],
                "contact": current_user['phone_number']
            },
            "notify": {
                "sms": True,
                "email": True
            },
            "callback_url": f"{os.environ.get('BACKEND_URL', '')}/dashboard",
            "callback_method": "get"
        })
        
        # Generate QR code for the payment link
        qr_code = generate_qr_code(payment_link['short_url'])
        
        return {
            "qr_code": qr_code,
            "payment_link": payment_link['short_url'],
            "link_id": payment_link['id']
        }
    except Exception as e:
        logging.error(f"Failed to generate payment link: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate payment QR code")

# Conversational AI WhatsApp Bot
async def translate_text(text: str, target_language: str = "en") -> str:
    """Translate text using AI"""
    try:
        api_key = os.environ.get('EMERGENT_LLM_KEY')
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": "gpt-4o-mini",
                    "messages": [{
                        "role": "user",
                        "content": f"Translate this to {target_language}, keep it natural and conversational: {text}"
                    }],
                    "temperature": 0.3
                },
                timeout=10.0
            )
            result = response.json()
            return result["choices"][0]["message"]["content"]
    except:
        return text

async def get_bot_response(message: str, phone: str, conversation_state: dict) -> str:
    """Get AI-powered bot response"""
    try:
        # Detect language and translate
        api_key = os.environ.get('EMERGENT_LLM_KEY')
        
        # Build conversation context
        context = f"""You are Lumer, a helpful medical appointment booking assistant for a clinic.

Current conversation state: {conversation_state}
Patient message: {message}

Your tasks:
1. If no name yet: Ask for their full name
2. If have name: Ask if they want clinic visit or phone consultation
3. If have type: Offer available time slots (9 AM - 5 PM, today or tomorrow)
4. If have slot: Confirm booking details

Be friendly, professional, and conversational. Keep responses under 100 words.
Detect the language and respond in the same language (Hindi, English, etc.)."""

        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": "gpt-4o-mini",
                    "messages": [{"role": "user", "content": context}],
                    "temperature": 0.7
                },
                timeout=15.0
            )
            result = response.json()
            return result["choices"][0]["message"]["content"]
    except Exception as e:
        logging.error(f"Bot AI error: {e}")
        return "Hello! Welcome to Lumer. Please share your full name to book an appointment."

@api_router.post("/webhook/whatsapp")
async def whatsapp_webhook(
    request: Request,
    From: str = Form(...),
    Body: str = Form(None),
    MessageSid: str = Form(...),
    NumMedia: int = Form(0),
    MediaUrl0: str = Form(None),
    MediaContentType0: str = Form(None)
):
    # Validate signature
    if twilio_validator:
        form_data = await request.form()
        signature = request.headers.get("X-Twilio-Signature", "")
        if not twilio_validator.validate(str(request.url), form_data, signature):
            raise HTTPException(status_code=403, detail="Invalid signature")
    
    phone = From.replace("whatsapp:", "")
    message = Body.strip() if Body else ""
    
    # Find the professional associated with this patient
    professional = None
    client = await db.clients.find_one({"phone": phone}, {"_id": 0})
    if client:
        professional = await db.users.find_one({"id": client['professional_id']}, {"_id": 0})
    
    # Store incoming message in health records
    if professional and message:
        try:
            message_id = str(uuid.uuid4())
            await db.whatsapp_messages.insert_one({
                "id": message_id,
                "professional_id": professional['id'],
                "client_phone": phone,
                "message_type": "text",
                "content": message,
                "direction": "incoming",
                "message_sid": MessageSid,
                "created_at": datetime.now(timezone.utc).isoformat()
            })
        except Exception as e:
            logging.error(f"Failed to store WhatsApp message: {e}")
    
    # Store media (photos/documents) in health records
    if professional and NumMedia > 0 and MediaUrl0:
        try:
            # Download the media file
            async with httpx.AsyncClient() as client_http:
                media_response = await client_http.get(
                    MediaUrl0,
                    auth=(os.environ.get('TWILIO_ACCOUNT_SID'), os.environ.get('TWILIO_AUTH_TOKEN'))
                )
                if media_response.status_code == 200:
                    # Convert to base64
                    media_base64 = base64.b64encode(media_response.content).decode()
                    
                    # Determine record type from content type
                    record_type = "other"
                    if MediaContentType0 and "image" in MediaContentType0:
                        record_type = "photo"
                    elif MediaContentType0 and "pdf" in MediaContentType0:
                        record_type = "document"
                    
                    # Store in health records
                    record_id = str(uuid.uuid4())
                    await db.health_records.insert_one({
                        "id": record_id,
                        "professional_id": professional['id'],
                        "client_phone": phone,
                        "record_type": record_type,
                        "file_base64": media_base64,
                        "file_name": f"whatsapp_media_{MessageSid}",
                        "notes": message if message else "Received via WhatsApp",
                        "source": "whatsapp",
                        "media_url": MediaUrl0,
                        "content_type": MediaContentType0,
                        "created_at": datetime.now(timezone.utc).isoformat()
                    })
                    
                    # Also store in WhatsApp messages
                    message_id = str(uuid.uuid4())
                    await db.whatsapp_messages.insert_one({
                        "id": message_id,
                        "professional_id": professional['id'],
                        "client_phone": phone,
                        "message_type": "media",
                        "content": message if message else "Media file",
                        "media_url": MediaUrl0,
                        "media_type": MediaContentType0,
                        "direction": "incoming",
                        "message_sid": MessageSid,
                        "health_record_id": record_id,
                        "created_at": datetime.now(timezone.utc).isoformat()
                    })
        except Exception as e:
            logging.error(f"Failed to store WhatsApp media: {e}")
    
    response = MessagingResponse()
    
    # Get or create conversation state
    conversation = await db.whatsapp_conversations.find_one({"phone": phone})
    if not conversation:
        conversation = {
            "phone": phone,
            "state": "new",
            "data": {},
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.whatsapp_conversations.insert_one(conversation)
    
    state = conversation.get("state", "new")
    data = conversation.get("data", {})
    
    # Check for reset command
    if message.lower() in ["reset", "restart", "start over", "new booking"]:
        await db.whatsapp_conversations.update_one(
            {"phone": phone},
            {"$set": {"state": "new", "data": {}}}
        )
        response.message("Let's start fresh! What is your full name?")
        return Response(content=str(response), media_type="application/xml")
    
    # State machine for booking flow
    if state == "new":
        reply = "Hello! Welcome to Lumer 🏥\n\nI'll help you book an appointment.\n\nWhat is your full name?"
        await db.whatsapp_conversations.update_one(
            {"phone": phone},
            {"$set": {"state": "awaiting_name", "last_message": message}}
        )
        response.message(reply)
        
    elif state == "awaiting_name":
        # Store name
        data["name"] = message
        reply = f"Thanks {message}! What is your age?"
        await db.whatsapp_conversations.update_one(
            {"phone": phone},
            {"$set": {
                "state": "awaiting_age",
                "data.name": message,
                "last_message": message
            }}
        )
        response.message(reply)
        
    elif state == "awaiting_age":
        # Store age
        data["age"] = message
        reply = "What is your sex? (Male/Female/Other)"
        await db.whatsapp_conversations.update_one(
            {"phone": phone},
            {"$set": {
                "state": "awaiting_sex",
                "data.age": message,
                "last_message": message
            }}
        )
        response.message(reply)
        
    elif state == "awaiting_sex":
        # Store sex
        data["sex"] = message
        reply = f"Got it! Would you like a clinic visit or phone consultation?"
        await db.whatsapp_conversations.update_one(
            {"phone": phone},
            {"$set": {
                "state": "awaiting_type",
                "data.sex": message,
                "last_message": message
            }}
        )
        response.message(reply)
        
    elif state == "awaiting_type":
        # Store consultation type
        consultation_type = "phone" if "phone" in message.lower() or "call" in message.lower() else "clinic"
        data["type"] = consultation_type
        
        # Get available slots
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        slots_msg = f"Available slots for {consultation_type} consultation:\n\n"
        slots_msg += "Today:\n• 2:00 PM\n• 4:00 PM\n\n"
        slots_msg += "Tomorrow:\n• 10:00 AM\n• 2:00 PM\n• 4:00 PM\n\n"
        slots_msg += "Reply with your preferred time!"
        
        await db.whatsapp_conversations.update_one(
            {"phone": phone},
            {"$set": {
                "state": "awaiting_slot",
                "data.type": consultation_type,
                "last_message": message
            }}
        )
        response.message(slots_msg)
        
    elif state == "awaiting_slot":
        # Confirm booking
        confirmation = f"✅ Appointment Confirmed!\n\n"
        confirmation += f"Name: {data.get('name')}\n"
        confirmation += f"Type: {data.get('type', 'clinic')} consultation\n"
        confirmation += f"Time: {message}\n\n"
        confirmation += "You'll receive a reminder 24 hours before your appointment.\n\n"
        confirmation += "See you soon! 🏥"
        
        # Create appointment in database
        professional = await db.users.find_one({"profession": "doctor"}, {"_id": 0})
        if professional:
            appointment_id = str(uuid.uuid4())
            tomorrow = (datetime.now(timezone.utc) + timedelta(days=1)).strftime("%Y-%m-%d")
            await db.appointments.insert_one({
                "id": appointment_id,
                "professional_id": professional['id'],
                "client_name": data.get('name'),
                "client_phone": phone,
                "appointment_date": tomorrow,
                "start_time": "14:00",
                "end_time": "14:30",
                "consultation_mode": data.get('type', 'in-person'),
                "status": "scheduled",
                "notes": f"Booked via WhatsApp: {message}",
                "reminder_sent": False,
                "payment_status": "pending",
                "created_at": datetime.now(timezone.utc).isoformat()
            })
        
        await db.whatsapp_conversations.update_one(
            {"phone": phone},
            {"$set": {"state": "completed", "last_message": message}}
        )
        response.message(confirmation)
    elif state == "completed":
        # If conversation completed, offer new booking
        welcome = "Your previous appointment is booked! 🎉\n\n"
        welcome += "Would you like to:\n"
        welcome += "• Book another appointment (reply 'book')\n"
        welcome += "• Check status (reply 'status')\n\n"
        welcome += "Or just say 'Hi' to start over!"
        await db.whatsapp_conversations.update_one(
            {"phone": phone},
            {"$set": {"state": "new", "data": {}}}
        )
        response.message(welcome)
    else:
        # Default welcome
        welcome = "Hello! Welcome to Lumer 🏥\n\n"
        welcome += "I can help you:\n"
        welcome += "• Book appointments (just say Hi!)\n"
        welcome += "• Check appointment status\n"
        welcome += "• Cancel appointments\n\n"
        welcome += "Type 'reset' anytime to start over!"
        response.message(welcome)
    
    return Response(content=str(response), media_type="application/xml")

# Razorpay Webhook
@api_router.post("/webhook/razorpay")
async def razorpay_webhook(request: Request):
    if not razorpay_client:
        raise HTTPException(status_code=500, detail="Razorpay not configured")
    
    body = await request.body()
    signature = request.headers.get("X-Razorpay-Signature", "")
    webhook_secret = os.environ.get('RAZORPAY_WEBHOOK_SECRET', '')
    
    try:
        # Verify webhook signature
        razorpay_client.utility.verify_webhook_signature(
            body.decode(),
            signature,
            webhook_secret
        )
        
        payload = await request.json()
        event = payload.get('event')
        
        if event == 'payment.captured':
            payment_entity = payload['payload']['payment']['entity']
            order_id = payment_entity.get('order_id')
            payment_id = payment_entity['id']
            
            await db.payment_transactions.update_one(
                {"order_id": order_id},
                {"$set": {
                    "payment_id": payment_id,
                    "payment_status": "paid",
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }}
            )
        
        return {"status": "success"}
    except Exception as e:
        logging.error(f"Razorpay webhook error: {e}")
        raise HTTPException(status_code=400, detail=str(e))

class AISuggestionRequest(BaseModel):
    symptoms: str
    patient_age: int
    patient_sex: str

# AI Prescription Suggestions
@api_router.post("/prescriptions/ai-suggest")
async def get_ai_prescription_suggestions(
    request: AISuggestionRequest,
    current_user: dict = Depends(get_current_user)
):
    if current_user.get('profession') != 'doctor':
        raise HTTPException(status_code=403, detail="Only doctors can access this feature")
    
    try:
        api_key = os.environ.get('EMERGENT_LLM_KEY')
        
        if not api_key or api_key == 'your_openai_api_key':
            # Return mock data if API key not configured
            return {"suggestions": json.dumps([
                {
                    "medicine_name": "Paracetamol",
                    "dosage": "500mg",
                    "frequency": "Three times daily",
                    "duration": "5 days",
                    "instructions": "Take after meals"
                },
                {
                    "medicine_name": "Vitamin C",
                    "dosage": "500mg",
                    "frequency": "Once daily",
                    "duration": "7 days",
                    "instructions": "Take with water"
                }
            ])}
        
        prompt = f"""You are an AI medical assistant helping a doctor write a prescription.

Patient Information:
- Age: {request.patient_age} years
- Sex: {request.patient_sex}
- Symptoms: {request.symptoms}

Provide 3-5 commonly prescribed medications for these symptoms, formatted as JSON:
[
  {{
    "medicine_name": "Medicine name",
    "dosage": "Dosage amount",
    "frequency": "How often (e.g., twice daily)",
    "duration": "How long (e.g., 7 days)",
    "instructions": "Special instructions"
  }}
]

IMPORTANT: 
- Only suggest commonly prescribed, safe medications
- Include appropriate dosages for the patient's age
- Add relevant precautions
- This is only a suggestion - the doctor will review and modify

Return ONLY the JSON array, no other text."""

        # Use emergentintegrations for LLM calls
        chat = LlmChat(
            api_key=api_key,
            session_id=f"prescription_{current_user['id']}_{uuid.uuid4()}",
            system_message="You are an AI medical assistant. Respond only with valid JSON arrays."
        ).with_model("openai", "gpt-4o-mini")
        
        user_message = UserMessage(text=prompt)
        response_text = await chat.send_message(user_message)
        
        # Clean up the response to ensure it's valid JSON
        suggestions = response_text.strip()
        if suggestions.startswith("```json"):
            suggestions = suggestions[7:]
        if suggestions.startswith("```"):
            suggestions = suggestions[3:]
        if suggestions.endswith("```"):
            suggestions = suggestions[:-3]
        suggestions = suggestions.strip()
        
        # Validate it's valid JSON
        json.loads(suggestions)
        
        return {"suggestions": suggestions}
    except json.JSONDecodeError as e:
        logging.error(f"AI returned invalid JSON: {e}")
        # Return mock data if JSON parsing fails
        return {"suggestions": json.dumps([
            {
                "medicine_name": "Paracetamol",
                "dosage": "500mg",
                "frequency": "Twice daily",
                "duration": "5 days",
                "instructions": "Take after meals with water"
            }
        ])}
    except Exception as e:
        logging.error(f"AI suggestion error: {e}")
        # Return mock data instead of error
        return {"suggestions": json.dumps([
            {
                "medicine_name": "Paracetamol",
                "dosage": "500mg",
                "frequency": "Twice daily",
                "duration": "5 days",
                "instructions": "Take after meals with water"
            },
            {
                "medicine_name": "Cetirizine",
                "dosage": "10mg",
                "frequency": "Once daily at night",
                "duration": "7 days",
                "instructions": "May cause drowsiness"
            }
        ])}

# Prescriptions (Doctor-specific)
@api_router.post("/prescriptions")
async def create_prescription(prescription: PrescriptionCreate, current_user: dict = Depends(get_current_user)):
    if current_user.get('profession') != 'doctor':
        raise HTTPException(status_code=403, detail="Only doctors can create prescriptions")
    
    prescription_id = str(uuid.uuid4())
    
    # Get appointment details
    appointment = await db.appointments.find_one(
        {"id": prescription.appointment_id, "professional_id": current_user['id']},
        {"_id": 0}
    )
    if not appointment:
        raise HTTPException(status_code=404, detail="Appointment not found")
    
    prescription_data = {
        "id": prescription_id,
        "professional_id": current_user['id'],
        "appointment_id": prescription.appointment_id,
        "client_name": prescription.client_name,
        "client_phone": appointment["client_phone"],
        "medications": prescription.medications,
        "instructions": prescription.instructions,
        "doctor_name": current_user['name'],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.prescriptions.insert_one(prescription_data)
    
    # Generate prescription text for WhatsApp
    meds_text = "\n".join([
        f"{i+1}. {med['medicine_name']} - {med['dosage']}\n   {med['frequency']} for {med['duration']}\n   {med.get('instructions', '')}"
        for i, med in enumerate(prescription.medications)
    ])
    
    prescription_message = f"""
\ud83d\udcdc PRESCRIPTION

Patient: {prescription.client_name}
Doctor: Dr. {current_user['name']}
Date: {datetime.now().strftime('%d %b %Y')}

MEDICATIONS:
{meds_text}

GENERAL INSTRUCTIONS:
{prescription.instructions}

\u26a0\ufe0f Important:
- Take medications as prescribed
- Complete the full course
- Contact doctor if symptoms worsen
- Do not share medications

For queries, contact: {current_user.get('phone_number', 'clinic')}
"""
    
    # Send prescription via WhatsApp
    message_sent = await send_whatsapp_message(appointment["client_phone"], prescription_message)
    
    if message_sent:
        logging.info(f"Prescription sent successfully to {appointment['client_phone']}")
    else:
        logging.error(f"Failed to send prescription to {appointment['client_phone']}")
    
    return {**prescription_data, "whatsapp_sent": bool(message_sent)}

@api_router.get("/prescriptions")
async def get_prescriptions(current_user: dict = Depends(get_current_user)):
    prescriptions = await db.prescriptions.find(
        {"professional_id": current_user['id']},
        {"_id": 0}
    ).to_list(100)
    return prescriptions

# Analytics
@api_router.get("/analytics/dashboard")
async def get_dashboard_analytics(current_user: dict = Depends(get_current_user)):
    total_appointments = await db.appointments.count_documents({"professional_id": current_user['id']})
    total_clients = await db.clients.count_documents({"professional_id": current_user['id']})
    
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    today_appointments = await db.appointments.count_documents({
        "professional_id": current_user['id'],
        "appointment_date": today
    })
    
    upcoming = await db.appointments.find({
        "professional_id": current_user['id'],
        "status": "scheduled",
        "appointment_date": {"$gte": today}
    }, {"_id": 0}).sort("appointment_date", 1).limit(5).to_list(5)
    
    revenue = await db.payment_transactions.aggregate([
        {"$match": {"user_id": current_user['id'], "payment_status": "paid"}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]).to_list(1)
    
    return {
        "total_appointments": total_appointments,
        "total_clients": total_clients,
        "today_appointments": today_appointments,
        "upcoming_appointments": upcoming,
        "total_revenue": revenue[0]['total'] if revenue else 0
    }

# Admin Endpoints
@api_router.post("/admin/login")
async def admin_login(credentials: AdminLogin):
    """Admin login endpoint"""
    # Check if admin user exists
    admin = await db.users.find_one({"email": credentials.email, "role": "admin"}, {"_id": 0})
    
    if not admin or not pwd_context.verify(credentials.password, admin['hashed_password']):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    token = create_access_token({"user_id": admin['id'], "email": admin['email']})
    return {"token": token, "user": {
        "id": admin['id'],
        "name": admin['name'],
        "email": admin['email'],
        "role": admin['role']
    }}

@api_router.get("/admin/users")
async def get_all_users(admin: dict = Depends(get_admin_user)):
    """Get all users (admin only)"""
    users = await db.users.find(
        {"role": {"$ne": "admin"}},
        {"_id": 0, "hashed_password": 0}
    ).to_list(1000)
    return users

@api_router.get("/admin/analytics")
async def get_admin_analytics(admin: dict = Depends(get_admin_user)):
    """Get analytics for admin dashboard"""
    # Count users by profession
    pipeline = [
        {"$match": {"role": {"$ne": "admin"}}},
        {"$group": {"_id": "$profession", "count": {"$sum": 1}}}
    ]
    profession_stats = await db.users.aggregate(pipeline).to_list(100)
    
    # Total users
    total_users = await db.users.count_documents({"role": {"$ne": "admin"}})
    
    # Total appointments across all users
    total_appointments = await db.appointments.count_documents({})
    
    # Recent registrations (last 30 days)
    thirty_days_ago = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    recent_users = await db.users.count_documents({
        "role": {"$ne": "admin"},
        "created_at": {"$gte": thirty_days_ago}
    })
    
    return {
        "total_users": total_users,
        "total_appointments": total_appointments,
        "recent_registrations": recent_users,
        "users_by_profession": {stat['_id']: stat['count'] for stat in profession_stats}
    }

@api_router.put("/admin/users/{user_id}")
async def update_user(user_id: str, user_data: UserUpdate, admin: dict = Depends(get_admin_user)):
    """Update user details (admin only)"""
    update_data = {k: v for k, v in user_data.dict().items() if v is not None}
    
    if not update_data:
        raise HTTPException(status_code=400, detail="No data to update")
    
    result = await db.users.update_one(
        {"id": user_id},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    
    return {"message": "User updated successfully"}

@api_router.delete("/admin/users/{user_id}")
async def delete_user(user_id: str, admin: dict = Depends(get_admin_user)):
    """Delete user (admin only)"""
    result = await db.users.delete_one({"id": user_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Also delete user's appointments and time-offs
    await db.appointments.delete_many({"professional_id": user_id})
    await db.time_offs.delete_many({"user_id": user_id})
    
    return {"message": "User deleted successfully"}

@api_router.get("/admin/content")
async def get_landing_content():
    """Get landing page content"""
    content = await db.landing_content.find_one({}, {"_id": 0})
    if not content:
        # Return default content
        return {
            "hero_title": "Smart Booking, Happy Clients",
            "hero_subtitle": "Transform your practice with WhatsApp booking, automated reminders, and an all-in-one CRM. Perfect for doctors, therapists, spas, lawyers, and wellness professionals.",
            "hero_image_url": "https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=800",
            "tagline": "WhatsApp-Powered Appointments",
            "feature_1_title": "WhatsApp Integration",
            "feature_1_description": "Book appointments via WhatsApp with automated reminders",
            "feature_2_title": "Smart CRM",
            "feature_2_description": "Manage clients, prescriptions, and payments in one place",
            "feature_3_title": "Automated Reminders",
            "feature_3_description": "24h and 4h reminders sent automatically via WhatsApp"
        }
    return content

@api_router.put("/admin/content")
async def update_landing_content(content: LandingPageContent, admin: dict = Depends(get_admin_user)):
    """Update landing page content (admin only)"""
    await db.landing_content.update_one(
        {},
        {"$set": content.dict()},
        upsert=True
    )
    return {"message": "Content updated successfully"}

# Payment Request for Clients
@api_router.post("/clients/{client_phone}/request-payment")
async def request_payment_for_client(
    client_phone: str,
    package: str,
    amount: Optional[int] = None,
    current_user: dict = Depends(get_current_user)
):
    """Generate payment link and send to client via WhatsApp"""
    try:
        # Get user's Razorpay credentials
        user = await db.users.find_one({"id": current_user['id']}, {"_id": 0})
        
        if not user.get("razorpay_configured"):
            raise HTTPException(
                status_code=400,
                detail="Please configure your Razorpay credentials in Settings first"
            )
        
        # Create user-specific Razorpay client
        user_razorpay = razorpay.Client(auth=(user["razorpay_key_id"], user["razorpay_key_secret"]))
        
        # Determine amount
        if amount:
            amount_inr = amount
        else:
            # Get user's configured payment fees
            payment_fees = user.get("payment_fees", {
                "consultation_fee": 500,
                "followup_fee": 300,
                "full_checkup_fee": 1000
            })
            
            fee_mapping = {
                "consultation": payment_fees.get("consultation_fee", 500),
                "follow_up": payment_fees.get("followup_fee", 300),
                "full_checkup": payment_fees.get("full_checkup_fee", 1000)
            }
            amount_inr = fee_mapping.get(package, 500)
        
        amount_paise = amount_inr * 100
        
        # Get client info
        client = await db.clients.find_one({
            "professional_id": current_user['id'],
            "phone": client_phone
        }, {"_id": 0})
        
        if not client:
            raise HTTPException(status_code=404, detail="Client not found")
        
        # Create payment link
        payment_link_data = {
            "amount": amount_paise,
            "currency": "INR",
            "description": f"{package.replace('_', ' ').title()} - {current_user['name']}",
            "customer": {
                "name": client['name'],
                "contact": client_phone.replace("+", "")
            },
            "notify": {
                "sms": False,
                "email": False,
                "whatsapp": True
            },
            "reminder_enable": False,
            "callback_url": f"{os.environ.get('REACT_APP_BACKEND_URL', '')}/dashboard",
            "callback_method": "get"
        }
        
        payment_link = user_razorpay.payment_link.create(payment_link_data)
        
        # Store payment request in database
        payment_request_id = str(uuid.uuid4())
        await db.payment_requests.insert_one({
            "id": payment_request_id,
            "payment_link_id": payment_link['id'],
            "payment_link": payment_link['short_url'],
            "user_id": current_user['id'],
            "client_phone": client_phone,
            "client_name": client['name'],
            "amount": amount_inr,
            "currency": "INR",
            "package": package,
            "payment_status": "pending",
            "created_at": datetime.now(timezone.utc).isoformat()
        })
        
        # Generate QR code
        qr_code_base64 = generate_qr_code(payment_link['short_url'])
        
        # Send payment link via WhatsApp
        message = f"""💳 Payment Request from {current_user['name']}

Amount: ₹{amount_inr}
Service: {package.replace('_', ' ').title()}

Please click the link below to complete your payment:
{payment_link['short_url']}

Thank you!"""
        
        await send_whatsapp_message(client_phone, message)
        
        return {
            "payment_request_id": payment_request_id,
            "payment_link": payment_link['short_url'],
            "qr_code": qr_code_base64,
            "amount": amount_inr,
            "status": "sent"
        }
    except Exception as e:
        logging.error(f"Payment request creation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/clients/{client_phone}/payment-history")
async def get_client_payment_history(
    client_phone: str,
    current_user: dict = Depends(get_current_user)
):
    """Get payment history for a specific client"""
    payments = await db.payment_requests.find(
        {
            "user_id": current_user['id'],
            "client_phone": client_phone
        },
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    
    return payments

# Health Records Management
class HealthRecordUpload(BaseModel):
    client_phone: str
    record_type: str  # "prescription_photo", "lab_report", "case_notes", "other"
    file_base64: str
    file_name: str
    notes: Optional[str] = None

@api_router.post("/health-records/upload")
async def upload_health_record(
    record: HealthRecordUpload,
    current_user: dict = Depends(get_current_user)
):
    """Upload health record (photo/document) for a client"""
    try:
        record_id = str(uuid.uuid4())
        
        health_record = {
            "id": record_id,
            "professional_id": current_user['id'],
            "client_phone": record.client_phone,
            "record_type": record.record_type,
            "file_base64": record.file_base64,
            "file_name": record.file_name,
            "notes": record.notes,
            "source": "manual_upload",
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        
        await db.health_records.insert_one(health_record)
        
        # Update client record
        await db.clients.update_one(
            {"professional_id": current_user['id'], "phone": record.client_phone},
            {"$set": {"updated_at": datetime.now(timezone.utc).isoformat()}}
        )
        
        return {"message": "Health record uploaded successfully", "record_id": record_id}
    except Exception as e:
        logging.error(f"Health record upload failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to upload health record")

@api_router.get("/health-records/{client_phone}")
async def get_health_records(
    client_phone: str,
    current_user: dict = Depends(get_current_user)
):
    """Get all health records for a client"""
    records = await db.health_records.find(
        {
            "professional_id": current_user['id'],
            "client_phone": client_phone
        },
        {"_id": 0}
    ).sort("created_at", -1).to_list(1000)
    
    # Also get WhatsApp messages
    whatsapp_messages = await db.whatsapp_messages.find(
        {
            "professional_id": current_user['id'],
            "client_phone": client_phone
        },
        {"_id": 0}
    ).sort("created_at", -1).to_list(1000)
    
    return {
        "health_records": records,
        "whatsapp_messages": whatsapp_messages
    }

@api_router.delete("/health-records/{record_id}")
async def delete_health_record(
    record_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a health record"""
    result = await db.health_records.delete_one({
        "id": record_id,
        "professional_id": current_user['id']
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Health record not found")
    
    return {"message": "Health record deleted successfully"}

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()