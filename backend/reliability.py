"""
Reliability utilities for Lumer
- Retry logic with exponential backoff
- Circuit breaker pattern
- Health checks
- Graceful degradation
"""

import asyncio
import logging
from typing import Callable, Any, Optional
from datetime import datetime, timezone
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
    before_sleep_log
)
from circuitbreaker import circuit
import httpx

logger = logging.getLogger(__name__)

# ============================================================================
# RETRY LOGIC
# ============================================================================

class RetryConfig:
    """Configuration for retry logic"""
    MAX_ATTEMPTS = 3
    MIN_WAIT = 2  # seconds
    MAX_WAIT = 10  # seconds

def with_retry(
    max_attempts: int = RetryConfig.MAX_ATTEMPTS,
    exceptions: tuple = (httpx.RequestError, httpx.TimeoutException, ConnectionError)
):
    """Decorator for retry logic with exponential backoff"""
    return retry(
        stop=stop_after_attempt(max_attempts),
        wait=wait_exponential(
            multiplier=1,
            min=RetryConfig.MIN_WAIT,
            max=RetryConfig.MAX_WAIT
        ),
        retry=retry_if_exception_type(exceptions),
        before_sleep=before_sleep_log(logger, logging.WARNING)
    )

# ============================================================================
# CIRCUIT BREAKER
# ============================================================================

class CircuitBreakerConfig:
    """Configuration for circuit breaker"""
    FAILURE_THRESHOLD = 5  # Open after 5 failures
    RECOVERY_TIMEOUT = 60  # Try again after 60 seconds
    EXPECTED_EXCEPTION = Exception

@circuit(
    failure_threshold=CircuitBreakerConfig.FAILURE_THRESHOLD,
    recovery_timeout=CircuitBreakerConfig.RECOVERY_TIMEOUT,
    expected_exception=CircuitBreakerConfig.EXPECTED_EXCEPTION
)
async def call_external_api(url: str, method: str = "GET", **kwargs):
    """
    Call external API with circuit breaker
    Opens circuit after 5 consecutive failures
    """
    async with httpx.AsyncClient(timeout=10.0) as client:
        if method == "GET":
            response = await client.get(url, **kwargs)
        elif method == "POST":
            response = await client.post(url, **kwargs)
        elif method == "PUT":
            response = await client.put(url, **kwargs)
        else:
            raise ValueError(f"Unsupported HTTP method: {method}")
        
        response.raise_for_status()
        return response.json()

# ============================================================================
# HEALTH CHECK SYSTEM
# ============================================================================

class HealthCheckStatus:
    """Health check status enum"""
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    UNHEALTHY = "unhealthy"

class HealthChecker:
    """Perform health checks on system components"""
    
    def __init__(self):
        self.checks = {}
    
    async def check_database(self, db_client) -> dict:
        """Check MongoDB connection"""
        try:
            await asyncio.wait_for(
                db_client.admin.command('ping'),
                timeout=5.0
            )
            return {
                "status": HealthCheckStatus.HEALTHY,
                "latency_ms": 0,
                "message": "Database connection OK"
            }
        except asyncio.TimeoutError:
            return {
                "status": HealthCheckStatus.DEGRADED,
                "message": "Database response slow (>5s)"
            }
        except Exception as e:
            return {
                "status": HealthCheckStatus.UNHEALTHY,
                "message": f"Database error: {str(e)}"
            }
    
    async def check_redis(self, redis_client) -> dict:
        """Check Redis connection"""
        if not redis_client:
            return {
                "status": HealthCheckStatus.DEGRADED,
                "message": "Redis not configured"
            }
        
        try:
            await asyncio.wait_for(
                redis_client.ping(),
                timeout=2.0
            )
            return {
                "status": HealthCheckStatus.HEALTHY,
                "message": "Redis connection OK"
            }
        except Exception as e:
            return {
                "status": HealthCheckStatus.DEGRADED,
                "message": f"Redis error: {str(e)}"
            }
    
    async def check_external_service(self, service_name: str, url: str) -> dict:
        """Check external service availability"""
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(url)
                
            if response.status_code == 200:
                return {
                    "status": HealthCheckStatus.HEALTHY,
                    "message": f"{service_name} is reachable"
                }
            else:
                return {
                    "status": HealthCheckStatus.DEGRADED,
                    "message": f"{service_name} returned {response.status_code}"
                }
        except Exception as e:
            return {
                "status": HealthCheckStatus.DEGRADED,
                "message": f"{service_name} error: {str(e)}"
            }
    
    async def get_overall_health(self, db_client, redis_client=None) -> dict:
        """Get overall system health"""
        checks = {
            "database": await self.check_database(db_client),
            "redis": await self.check_redis(redis_client) if redis_client else {"status": HealthCheckStatus.DEGRADED, "message": "Not configured"},
            "twilio": await self.check_external_service("Twilio", "https://api.twilio.com"),
        }
        
        # Determine overall status
        statuses = [check["status"] for check in checks.values()]
        
        if all(s == HealthCheckStatus.HEALTHY for s in statuses):
            overall_status = HealthCheckStatus.HEALTHY
        elif any(s == HealthCheckStatus.UNHEALTHY for s in statuses):
            overall_status = HealthCheckStatus.UNHEALTHY
        else:
            overall_status = HealthCheckStatus.DEGRADED
        
        return {
            "status": overall_status,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "checks": checks
        }

# ============================================================================
# GRACEFUL DEGRADATION
# ============================================================================

class NotificationFallback:
    """Fallback notification system"""
    
    def __init__(self):
        self.methods = []
    
    async def send_with_fallback(
        self,
        primary_method: Callable,
        fallback_methods: list[Callable],
        *args,
        **kwargs
    ) -> tuple[bool, str]:
        """
        Try primary method, fall back to alternatives
        Returns: (success, method_used)
        """
        # Try primary
        try:
            await primary_method(*args, **kwargs)
            return True, "primary"
        except Exception as e:
            logger.warning(f"Primary method failed: {e}")
        
        # Try fallbacks
        for i, fallback in enumerate(fallback_methods):
            try:
                await fallback(*args, **kwargs)
                return True, f"fallback_{i+1}"
            except Exception as e:
                logger.warning(f"Fallback {i+1} failed: {e}")
        
        # All methods failed
        logger.error("All notification methods failed")
        return False, "none"

# ============================================================================
# DATABASE TRANSACTION HELPER
# ============================================================================

class TransactionManager:
    """Manage MongoDB transactions"""
    
    def __init__(self, client):
        self.client = client
    
    async def execute_with_transaction(
        self,
        operations: list[Callable],
        rollback_on_error: bool = True
    ) -> tuple[bool, Any]:
        """
        Execute multiple operations in a transaction
        Returns: (success, result)
        """
        async with await self.client.start_session() as session:
            async with session.start_transaction():
                try:
                    results = []
                    for operation in operations:
                        result = await operation(session)
                        results.append(result)
                    
                    # Commit automatically if no exception
                    return True, results
                    
                except Exception as e:
                    logger.error(f"Transaction failed: {e}")
                    # Transaction automatically aborts
                    return False, str(e)

# ============================================================================
# RATE LIMITER STORAGE
# ============================================================================

class RateLimitStore:
    """In-memory rate limit storage (use Redis in production)"""
    
    def __init__(self):
        self.store = {}
    
    async def increment(self, key: str, window: int) -> int:
        """Increment counter for key within time window"""
        now = datetime.now(timezone.utc).timestamp()
        
        # Clean old entries
        if key in self.store:
            self.store[key] = [
                timestamp for timestamp in self.store[key]
                if now - timestamp < window
            ]
        else:
            self.store[key] = []
        
        # Add new entry
        self.store[key].append(now)
        return len(self.store[key])
    
    async def get_count(self, key: str, window: int) -> int:
        """Get current count for key within window"""
        now = datetime.now(timezone.utc).timestamp()
        
        if key not in self.store:
            return 0
        
        return len([
            timestamp for timestamp in self.store[key]
            if now - timestamp < window
        ])

# Global instances
health_checker = HealthChecker()
notification_fallback = NotificationFallback()
rate_limit_store = RateLimitStore()
