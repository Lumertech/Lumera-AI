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

# Stripe Setup
stripe_checkout = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    scheduler.add_job(
        send_appointment_reminders,
        CronTrigger(hour=10, minute=0),
        id="appointment_reminders",
        name="Send daily appointment reminders"
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

class UserLogin(BaseModel):
    email: EmailStr
    password: str

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
        logging.warning("Twilio not configured")
        return None
    try:
        msg = twilio_client.messages.create(
            from_=os.environ.get('TWILIO_WHATSAPP_NUMBER'),
            to=f"whatsapp:{to_number}",
            body=message
        )
        return msg.sid
    except Exception as e:
        logging.error(f"Failed to send WhatsApp message: {e}")
        return None

async def send_appointment_reminders():
    tomorrow = (datetime.now(timezone.utc) + timedelta(days=1)).strftime("%Y-%m-%d")
    appointments = await db.appointments.find({
        "appointment_date": tomorrow,
        "status": "scheduled",
        "reminder_sent": False
    }, {"_id": 0}).to_list(None)
    
    for appt in appointments:
        message = f"Reminder: Your appointment with Lumer is tomorrow at {appt['start_time']}. Please arrive 10 minutes early."
        await send_whatsapp_message(appt['client_phone'], message)
        await db.appointments.update_one(
            {"id": appt['id']},
            {"$set": {"reminder_sent": True}}
        )

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
        "password": hash_password(user_data.password),
        "phone_number": user_data.phone_number,
        "profession": user_data.profession,
        "whatsapp_verified": False,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.users.insert_one(user)
    
    token = create_access_token({"user_id": user_id, "email": user_data.email})
    return {"token": token, "user": {k: v for k, v in user.items() if k != "password"}}

@api_router.post("/auth/login")
async def login(credentials: UserLogin):
    user = await db.users.find_one({"email": credentials.email})
    if not user or not verify_password(credentials.password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    token = create_access_token({"user_id": user["id"], "email": user["email"]})
    user_data = {k: v for k, v in user.items() if k not in ["password", "_id"]}
    return {"token": token, "user": user_data}

@api_router.get("/auth/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    return current_user

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
    
    return {**client, "appointments": appointments}

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
    
    # Generate default slots (9 AM to 5 PM, 30-min intervals)
    slots = []
    for hour in range(9, 17):
        for minute in [0, 30]:
            start = f"{hour:02d}:{minute:02d}"
            end_hour = hour if minute == 0 else hour + 1
            end_minute = 30 if minute == 0 else 0
            end = f"{end_hour:02d}:{end_minute:02d}"
            
            available = not any(
                start >= bt[0] and start < bt[1] for bt in booked_times
            )
            slots.append({"start_time": start, "end_time": end, "available": available})
    
    return {"date": date, "slots": slots}

# Payments
@api_router.post("/payments/checkout")
async def create_checkout(request: Request, package: str = "consultation", current_user: dict = Depends(get_current_user)):
    global stripe_checkout
    if not stripe_checkout:
        api_key = os.environ.get('STRIPE_API_KEY')
        host_url = str(request.base_url)
        webhook_url = f"{host_url}api/webhook/stripe"
        stripe_checkout = StripeCheckout(api_key=api_key, webhook_url=webhook_url)
    
    packages = {"consultation": 50.0, "follow_up": 30.0, "full_checkup": 100.0}
    amount = packages.get(package, 50.0)
    
    origin = request.headers.get('origin', str(request.base_url).rstrip('/'))
    success_url = f"{origin}/payment-success?session_id={{{{CHECKOUT_SESSION_ID}}}}"
    cancel_url = f"{origin}/dashboard"
    
    checkout_request = CheckoutSessionRequest(
        amount=amount,
        currency="usd",
        success_url=success_url,
        cancel_url=cancel_url,
        metadata={"user_id": current_user['id'], "package": package}
    )
    
    session = await stripe_checkout.create_checkout_session(checkout_request)
    
    await db.payment_transactions.insert_one({
        "session_id": session.session_id,
        "user_id": current_user['id'],
        "amount": amount,
        "currency": "usd",
        "package": package,
        "payment_status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    return {"url": session.url, "session_id": session.session_id}

@api_router.get("/payments/status/{session_id}")
async def check_payment_status(session_id: str, current_user: dict = Depends(get_current_user)):
    if not stripe_checkout:
        raise HTTPException(status_code=500, detail="Stripe not configured")
    
    status = await stripe_checkout.get_checkout_status(session_id)
    
    transaction = await db.payment_transactions.find_one({"session_id": session_id})
    if transaction and transaction.get('payment_status') != 'paid' and status.payment_status == 'paid':
        await db.payment_transactions.update_one(
            {"session_id": session_id},
            {"$set": {"payment_status": "paid", "updated_at": datetime.now(timezone.utc).isoformat()}}
        )
    
    return status

@api_router.post("/payments/generate-qr")
async def generate_payment_qr(amount: float, current_user: dict = Depends(get_current_user)):
    payment_link = f"https://pay.lumer.app?amount={amount}&user={current_user['id']}"
    qr_code = generate_qr_code(payment_link)
    return {"qr_code": qr_code, "payment_link": payment_link}

# WhatsApp Webhook
@api_router.post("/webhook/whatsapp")
async def whatsapp_webhook(
    request: Request,
    From: str = Form(...),
    Body: str = Form(...),
    MessageSid: str = Form(...)
):
    # Validate signature
    if twilio_validator:
        form_data = await request.form()
        signature = request.headers.get("X-Twilio-Signature", "")
        if not twilio_validator.validate(str(request.url), form_data, signature):
            raise HTTPException(status_code=403, detail="Invalid signature")
    
    phone = From.replace("whatsapp:", "")
    message = Body.strip().lower()
    
    response = MessagingResponse()
    
    # Check if user exists
    client = await db.clients.find_one({"phone": phone})
    
    if "book" in message:
        response.message("To book an appointment, please visit https://lumer.app/book")
    elif "cancel" in message:
        appt = await db.appointments.find_one({
            "client_phone": phone,
            "status": "scheduled"
        }, {"_id": 0})
        if appt:
            await db.appointments.update_one(
                {"id": appt['id']},
                {"$set": {"status": "cancelled"}}
            )
            response.message(f"Your appointment on {appt['appointment_date']} has been cancelled.")
        else:
            response.message("No upcoming appointments found.")
    elif "status" in message:
        appt = await db.appointments.find_one({
            "client_phone": phone,
            "status": "scheduled"
        }, {"_id": 0})
        if appt:
            response.message(
                f"Your appointment: {appt['appointment_date']} at {appt['start_time']}"
            )
        else:
            response.message("No upcoming appointments.")
    else:
        response.message(
            "Welcome to Lumer! Commands:\n"
            "'Book' - Schedule appointment\n"
            "'Cancel' - Cancel appointment\n"
            "'Status' - Check appointment"
        )
    
    return Response(content=str(response), media_type="application/xml")

# Stripe Webhook
@api_router.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    if not stripe_checkout:
        raise HTTPException(status_code=500, detail="Stripe not configured")
    
    body = await request.body()
    signature = request.headers.get("Stripe-Signature")
    
    try:
        webhook_response = await stripe_checkout.handle_webhook(body, signature)
        
        if webhook_response.payment_status == "paid":
            await db.payment_transactions.update_one(
                {"session_id": webhook_response.session_id},
                {"$set": {"payment_status": "paid", "updated_at": datetime.now(timezone.utc).isoformat()}}
            )
        
        return {"status": "success"}
    except Exception as e:
        logging.error(f"Stripe webhook error: {e}")
        raise HTTPException(status_code=400, detail=str(e))

# Prescriptions (Doctor-specific)
@api_router.post("/prescriptions")
async def create_prescription(prescription: PrescriptionCreate, current_user: dict = Depends(get_current_user)):
    if current_user.get('profession') != 'doctor':
        raise HTTPException(status_code=403, detail="Only doctors can create prescriptions")
    
    prescription_id = str(uuid.uuid4())
    prescription_data = {
        "id": prescription_id,
        "professional_id": current_user['id'],
        "appointment_id": prescription.appointment_id,
        "client_name": prescription.client_name,
        "medications": prescription.medications,
        "instructions": prescription.instructions,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.prescriptions.insert_one(prescription_data)
    return prescription_data

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