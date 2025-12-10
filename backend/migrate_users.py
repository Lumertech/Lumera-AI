"""Migrate existing users to new schema with hashed_password and role"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext
import os
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

async def migrate():
    # Connect to MongoDB
    mongo_url = os.environ['MONGO_URL']
    client = AsyncIOMotorClient(mongo_url)
    db = client[os.environ['DB_NAME']]
    
    # Find all users with old password field
    users = await db.users.find({"password": {"$exists": True}}).to_list(1000)
    
    print(f"Found {len(users)} users to migrate")
    
    for user in users:
        # Update user with new schema
        update_data = {
            "hashed_password": user['password'],  # Already hashed from before
            "role": "user"  # Default role
        }
        
        await db.users.update_one(
            {"id": user['id']},
            {
                "$set": update_data,
                "$unset": {"password": ""}  # Remove old field
            }
        )
        print(f"✅ Migrated user: {user['email']}")
    
    print(f"\n✅ Migration complete! {len(users)} users updated")
    client.close()

if __name__ == "__main__":
    asyncio.run(migrate())
