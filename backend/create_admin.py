"""Script to create admin user"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext
from datetime import datetime, timezone
import uuid
import os
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

async def create_admin():
    # Connect to MongoDB
    mongo_url = os.environ['MONGO_URL']
    client = AsyncIOMotorClient(mongo_url)
    db = client[os.environ['DB_NAME']]
    
    # Migrate old admin@lumer.com → admin@lumer.me if it exists
    old_admin = await db.users.find_one({"email": "admin@lumer.com"})
    if old_admin:
        await db.users.update_one({"email": "admin@lumer.com"}, {"$set": {"email": "admin@lumer.me"}})
        print("✅ Migrated admin email from admin@lumer.com → admin@lumer.me")
        client.close()
        return

    # Check if new admin already exists
    existing_admin = await db.users.find_one({"email": "admin@lumer.me"})
    if existing_admin:
        print("Admin user already exists!")
        client.close()
        return

    # Create admin user
    admin_id = str(uuid.uuid4())
    admin = {
        "id": admin_id,
        "name": "Admin",
        "email": "admin@lumer.me",
        "hashed_password": pwd_context.hash("admin123"),
        "phone_number": "+1234567890",
        "profession": "admin",
        "role": "admin",
        "whatsapp_verified": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    }

    await db.users.insert_one(admin)
    print("✅ Admin user created successfully!")
    print("Email: admin@lumer.me")
    print("Password: admin123")
    print("\n⚠️  IMPORTANT: Change this password after first login!")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(create_admin())
