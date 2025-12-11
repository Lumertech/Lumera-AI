"""
Security utilities for Lumer
- Password validation
- Encryption/Decryption
- Rate limiting
- Input sanitization
"""

import re
import os
import hashlib
from typing import Optional
from cryptography.fernet import Fernet
from fastapi import HTTPException

# ============================================================================
# ENCRYPTION
# ============================================================================

class EncryptionManager:
    """Field-level encryption for sensitive data"""
    
    def __init__(self):
        # Get or generate encryption key
        encryption_key = os.environ.get('ENCRYPTION_KEY')
        if not encryption_key:
            # Generate new key if not exists (for development)
            encryption_key = Fernet.generate_key().decode()
            print(f"⚠️  ENCRYPTION_KEY not found. Generated new key (save this): {encryption_key}")
        
        self.cipher = Fernet(encryption_key.encode() if isinstance(encryption_key, str) else encryption_key)
    
    def encrypt(self, data: str) -> str:
        """Encrypt sensitive data"""
        if not data:
            return ""
        return self.cipher.encrypt(data.encode()).decode()
    
    def decrypt(self, encrypted_data: str) -> str:
        """Decrypt sensitive data"""
        if not encrypted_data:
            return ""
        try:
            return self.cipher.decrypt(encrypted_data.encode()).decode()
        except Exception as e:
            print(f"Decryption error: {e}")
            return ""

# Global instance
encryption_manager = EncryptionManager()

# ============================================================================
# PASSWORD VALIDATION
# ============================================================================

class PasswordValidator:
    """Validate password strength"""
    
    MIN_LENGTH = 8
    
    @staticmethod
    def validate(password: str) -> tuple[bool, Optional[str]]:
        """
        Validate password strength
        Returns: (is_valid, error_message)
        
        Requirements:
        - At least 8 characters
        - At least 1 uppercase letter
        - At least 1 lowercase letter
        - At least 1 number
        - At least 1 special character
        """
        if len(password) < PasswordValidator.MIN_LENGTH:
            return False, f"Password must be at least {PasswordValidator.MIN_LENGTH} characters long"
        
        if not re.search(r'[A-Z]', password):
            return False, "Password must contain at least one uppercase letter"
        
        if not re.search(r'[a-z]', password):
            return False, "Password must contain at least one lowercase letter"
        
        if not re.search(r'\d', password):
            return False, "Password must contain at least one number"
        
        if not re.search(r'[!@#$%^&*(),.?":{}|<>]', password):
            return False, "Password must contain at least one special character (!@#$%^&*...)"
        
        return True, None
    
    @staticmethod
    def check_common_passwords(password: str) -> bool:
        """Check against common passwords"""
        common_passwords = [
            'password', '12345678', 'qwerty', 'abc123', 'password123',
            'admin', 'letmein', 'welcome', 'monkey', '1234567890'
        ]
        return password.lower() not in common_passwords

# ============================================================================
# INPUT SANITIZATION
# ============================================================================

class InputSanitizer:
    """Sanitize user inputs to prevent injection attacks"""
    
    @staticmethod
    def sanitize_string(text: str, max_length: int = 1000) -> str:
        """Remove potentially harmful characters"""
        if not text:
            return ""
        
        # Remove null bytes
        text = text.replace('\x00', '')
        
        # Limit length
        text = text[:max_length]
        
        # Remove control characters except newline and tab
        text = ''.join(char for char in text if ord(char) >= 32 or char in ['\n', '\t'])
        
        return text.strip()
    
    @staticmethod
    def sanitize_phone(phone: str) -> str:
        """Sanitize phone number"""
        # Remove all non-numeric except +
        phone = re.sub(r'[^\d+]', '', phone)
        
        # Ensure starts with +
        if not phone.startswith('+'):
            phone = '+' + phone
        
        return phone
    
    @staticmethod
    def sanitize_email(email: str) -> str:
        """Sanitize email address"""
        email = email.lower().strip()
        
        # Basic email validation
        if not re.match(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$', email):
            raise ValueError("Invalid email format")
        
        return email
    
    @staticmethod
    def validate_abha_id(abha_id: str) -> tuple[bool, Optional[str]]:
        """Validate ABHA ID format (14 digits)"""
        if not abha_id:
            return True, None  # Optional field
        
        # Remove spaces and dashes
        abha_id = re.sub(r'[\s-]', '', abha_id)
        
        if len(abha_id) != 14:
            return False, "ABHA ID must be exactly 14 digits"
        
        if not abha_id.isdigit():
            return False, "ABHA ID must contain only digits"
        
        return True, None
    
    @staticmethod
    def sanitize_html(text: str) -> str:
        """Remove HTML tags and sanitize text"""
        if not text:
            return ""
        
        # Remove HTML tags
        text = re.sub(r'<[^>]+>', '', text)
        
        # Use existing sanitize_string method
        return InputSanitizer.sanitize_string(text)

# ============================================================================
# MONGO QUERY VALIDATION
# ============================================================================

class MongoQueryValidator:
    """Prevent NoSQL injection attacks"""
    
    DANGEROUS_OPERATORS = [
        '$where', '$eval', '$function', '$accumulator', 
        '$jsonSchema', '$expr'
    ]
    
    @staticmethod
    def validate_query(query: dict) -> dict:
        """Validate MongoDB query for dangerous operators"""
        for key in query.keys():
            if key in MongoQueryValidator.DANGEROUS_OPERATORS:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Dangerous query operator '{key}' not allowed"
                )
            
            # Recursively check nested queries
            if isinstance(query[key], dict):
                MongoQueryValidator.validate_query(query[key])
        
        return query

# ============================================================================
# SECURITY HEADERS
# ============================================================================

SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-XSS-Protection": "1; mode=block",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:;",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "geolocation=(), microphone=(), camera=()"
}

# ============================================================================
# OTP UTILITIES
# ============================================================================

class OTPManager:
    """Manage OTP generation and validation"""
    
    @staticmethod
    def generate_otp(length: int = 6) -> str:
        """Generate secure random OTP"""
        import secrets
        return ''.join([str(secrets.randbelow(10)) for _ in range(length)])
    
    @staticmethod
    def hash_otp(otp: str) -> str:
        """Hash OTP for secure storage"""
        return hashlib.sha256(otp.encode()).hexdigest()
    
    @staticmethod
    def verify_otp(provided_otp: str, hashed_otp: str) -> bool:
        """Verify OTP against hash"""
        return OTPManager.hash_otp(provided_otp) == hashed_otp
