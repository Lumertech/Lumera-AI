"""
Monitoring and logging utilities for Lumera
- Structured logging
- Audit trail
- Performance metrics
- Error tracking
"""

import logging
import time
from datetime import datetime, timezone
from typing import Optional, Any
from uuid import uuid4
import structlog

# ============================================================================
# STRUCTURED LOGGING SETUP
# ============================================================================

def setup_structured_logging():
    """Configure structured logging with structlog"""
    structlog.configure(
        processors=[
            structlog.stdlib.filter_by_level,
            structlog.stdlib.add_logger_name,
            structlog.stdlib.add_log_level,
            structlog.stdlib.PositionalArgumentsFormatter(),
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.UnicodeDecoder(),
            structlog.processors.JSONRenderer()
        ],
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )

# Initialize
setup_structured_logging()
logger = structlog.get_logger()

# ============================================================================
# AUDIT LOGGING
# ============================================================================

class AuditAction:
    """Audit action types"""
    CREATE = "CREATE"
    READ = "READ"
    UPDATE = "UPDATE"
    DELETE = "DELETE"
    LOGIN = "LOGIN"
    LOGOUT = "LOGOUT"
    CONSENT_REQUEST = "CONSENT_REQUEST"
    CONSENT_APPROVE = "CONSENT_APPROVE"
    CONSENT_REVOKE = "CONSENT_REVOKE"
    PAYMENT_REQUEST = "PAYMENT_REQUEST"
    PRESCRIPTION_SEND = "PRESCRIPTION_SEND"

class AuditLogger:
    """Log all sensitive actions for compliance"""
    
    def __init__(self, db):
        self.db = db
        self.collection = db.audit_logs
    
    async def log(
        self,
        action: str,
        actor_id: str,
        actor_type: str,
        resource_type: str,
        resource_id: str,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        details: Optional[dict] = None,
        success: bool = True
    ):
        """Log an audit event"""
        try:
            audit_entry = {
                "id": str(uuid4()),
                "action": action,
                "actor_id": actor_id,
                "actor_type": actor_type,
                "resource_type": resource_type,
                "resource_id": resource_id,
                "ip_address": ip_address,
                "user_agent": user_agent,
                "details": details or {},
                "success": success,
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
            
            await self.collection.insert_one(audit_entry)
            
            # Also log to structured logger
            logger.info(
                "audit_event",
                action=action,
                actor_id=actor_id,
                resource_type=resource_type,
                resource_id=resource_id,
                success=success
            )
        except Exception as e:
            logger.error("audit_log_failed", error=str(e))
    
    async def get_audit_trail(
        self,
        resource_type: Optional[str] = None,
        resource_id: Optional[str] = None,
        actor_id: Optional[str] = None,
        limit: int = 100
    ):
        """Retrieve audit trail"""
        query = {}
        if resource_type:
            query["resource_type"] = resource_type
        if resource_id:
            query["resource_id"] = resource_id
        if actor_id:
            query["actor_id"] = actor_id
        
        return await self.collection.find(
            query,
            {"_id": 0}
        ).sort("timestamp", -1).limit(limit).to_list(limit)

# ============================================================================
# PERFORMANCE MONITORING
# ============================================================================

class PerformanceMonitor:
    """Track performance metrics"""
    
    def __init__(self):
        self.metrics = {}
    
    def record_api_call(
        self,
        endpoint: str,
        method: str,
        duration_ms: float,
        status_code: int
    ):
        """Record API call metrics"""
        key = f"{method}:{endpoint}"
        
        if key not in self.metrics:
            self.metrics[key] = {
                "count": 0,
                "total_duration": 0,
                "min_duration": float('inf'),
                "max_duration": 0,
                "errors": 0
            }
        
        self.metrics[key]["count"] += 1
        self.metrics[key]["total_duration"] += duration_ms
        self.metrics[key]["min_duration"] = min(self.metrics[key]["min_duration"], duration_ms)
        self.metrics[key]["max_duration"] = max(self.metrics[key]["max_duration"], duration_ms)
        
        if status_code >= 500:
            self.metrics[key]["errors"] += 1
        
        # Log slow requests
        if duration_ms > 1000:  # > 1 second
            logger.warning(
                "slow_api_call",
                endpoint=endpoint,
                method=method,
                duration_ms=duration_ms,
                status_code=status_code
            )
    
    def get_metrics(self):
        """Get all metrics with averages"""
        result = {}
        for key, data in self.metrics.items():
            result[key] = {
                **data,
                "avg_duration": data["total_duration"] / data["count"] if data["count"] > 0 else 0,
                "error_rate": (data["errors"] / data["count"] * 100) if data["count"] > 0 else 0
            }
        return result

# ============================================================================
# REQUEST TRACKING
# ============================================================================

class RequestTracker:
    """Track request lifecycle"""
    
    def __init__(self):
        self.active_requests = {}
    
    def start_request(self, request_id: str, endpoint: str, method: str):
        """Start tracking a request"""
        self.active_requests[request_id] = {
            "endpoint": endpoint,
            "method": method,
            "start_time": time.time(),
            "status": "in_progress"
        }
    
    def end_request(self, request_id: str, status_code: int):
        """End tracking a request"""
        if request_id in self.active_requests:
            request_data = self.active_requests[request_id]
            duration = (time.time() - request_data["start_time"]) * 1000  # ms
            
            request_data["status"] = "completed"
            request_data["status_code"] = status_code
            request_data["duration_ms"] = duration
            
            # Log completion
            logger.info(
                "request_completed",
                request_id=request_id,
                endpoint=request_data["endpoint"],
                method=request_data["method"],
                status_code=status_code,
                duration_ms=duration
            )
            
            # Clean up
            del self.active_requests[request_id]
    
    def get_active_requests(self):
        """Get all active requests"""
        now = time.time()
        return [
            {
                "request_id": req_id,
                **data,
                "elapsed_ms": (now - data["start_time"]) * 1000
            }
            for req_id, data in self.active_requests.items()
        ]

# ============================================================================
# ERROR TRACKING
# ============================================================================

class ErrorTracker:
    """Track and categorize errors"""
    
    def __init__(self, db):
        self.db = db
        self.collection = db.error_logs
    
    async def log_error(
        self,
        error_type: str,
        error_message: str,
        stack_trace: Optional[str] = None,
        context: Optional[dict] = None,
        severity: str = "error"
    ):
        """Log an error"""
        error_id = str(uuid4())
        
        error_entry = {
            "id": error_id,
            "error_type": error_type,
            "error_message": error_message,
            "stack_trace": stack_trace,
            "context": context or {},
            "severity": severity,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "resolved": False
        }
        
        await self.collection.insert_one(error_entry)
        
        # Log to structured logger
        logger.error(
            "error_logged",
            error_id=error_id,
            error_type=error_type,
            error_message=error_message,
            severity=severity
        )
        
        return error_id
    
    async def get_error_stats(self, hours: int = 24):
        """Get error statistics"""
        from_time = datetime.now(timezone.utc).timestamp() - (hours * 3600)
        
        errors = await self.collection.find({
            "timestamp": {"$gte": datetime.fromtimestamp(from_time, tz=timezone.utc).isoformat()}
        }, {"_id": 0}).to_list(None)
        
        # Aggregate by type
        error_types = {}
        for error in errors:
            error_type = error.get("error_type", "unknown")
            error_types[error_type] = error_types.get(error_type, 0) + 1
        
        return {
            "total_errors": len(errors),
            "error_types": error_types,
            "time_period_hours": hours
        }

# ============================================================================
# SYSTEM METRICS
# ============================================================================

class SystemMetrics:
    """Track system-level metrics"""
    
    def __init__(self):
        self.metrics = {
            "users_created": 0,
            "appointments_created": 0,
            "prescriptions_sent": 0,
            "payments_processed": 0,
            "whatsapp_messages_sent": 0,
            "consent_requests": 0,
            "api_calls": 0
        }
    
    def increment(self, metric_name: str, count: int = 1):
        """Increment a metric"""
        if metric_name in self.metrics:
            self.metrics[metric_name] += count
        else:
            self.metrics[metric_name] = count
    
    def get_metrics(self):
        """Get all metrics"""
        return self.metrics.copy()
    
    def reset_metrics(self):
        """Reset all metrics"""
        for key in self.metrics:
            self.metrics[key] = 0

# Global instances
performance_monitor = PerformanceMonitor()
request_tracker = RequestTracker()
system_metrics = SystemMetrics()
