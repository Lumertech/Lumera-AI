"""Admin: monthly license management.

Lets admins see and manage each user's license/subscription:
- Extend or shorten trial/paid period
- Activate/suspend/cancel a license
- Bulk view: which users are near expiry
"""
from datetime import datetime, timezone, timedelta
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from shared import db, get_current_user

router = APIRouter(prefix="/admin/licenses", tags=["admin-licenses"])


async def _require_admin(current_user: dict = Depends(get_current_user)):
    if current_user.get('role') != 'admin':
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


class LicenseUpdate(BaseModel):
    status: Optional[str] = None          # trial|active|suspended|cancelled|expired
    plan_type: Optional[str] = None       # monthly|annual|trial|free|custom
    monthly_price: Optional[float] = None
    extend_days: Optional[int] = None     # positive → extend, negative → shorten
    set_end_date: Optional[str] = None    # ISO date (overrides extend_days)
    notes: Optional[str] = None


VALID_STATUSES = {"trial", "active", "suspended", "cancelled", "expired"}
VALID_PLANS = {"monthly", "annual", "trial", "free", "custom"}


def _summarize(sub: dict, user: dict, now: datetime) -> dict:
    """Enrich a subscription doc with expiry stats for the dashboard."""
    end_iso = sub.get("end_date") or sub.get("trial_end")
    days_remaining = None
    if end_iso:
        try:
            end_dt = datetime.fromisoformat(end_iso.replace('Z', '+00:00'))
            days_remaining = int((end_dt - now).total_seconds() // 86400)
        except Exception:
            pass
    return {
        "user_id": sub.get("user_id"),
        "name": (user or {}).get("name", ""),
        "email": (user or {}).get("email", ""),
        "phone_number": (user or {}).get("phone_number", ""),
        "profession": (user or {}).get("profession", ""),
        "role": (user or {}).get("role", "user"),
        "status": sub.get("status", "trial"),
        "plan_type": sub.get("plan_type", "trial"),
        "monthly_price": sub.get("monthly_price"),
        "trial_end": sub.get("trial_end"),
        "end_date": end_iso,
        "days_remaining": days_remaining,
        "created_at": sub.get("created_at"),
        "notes": sub.get("admin_notes", ""),
    }


@router.get("")
async def list_licenses(
    status: Optional[str] = None,
    near_expiry_days: Optional[int] = None,
    _: dict = Depends(_require_admin),
):
    """List all licenses; optionally filter by status or near-expiry window."""
    query: dict = {}
    if status:
        if status not in VALID_STATUSES:
            raise HTTPException(status_code=400, detail="Invalid status filter")
        query["status"] = status
    subs = await db.subscriptions.find(query, {"_id": 0}).sort("created_at", -1).to_list(2000)
    # Batch fetch users
    user_ids = list({s.get("user_id") for s in subs if s.get("user_id")})
    users_cur = db.users.find({"id": {"$in": user_ids}}, {"_id": 0, "hashed_password": 0})
    users = {u["id"]: u async for u in users_cur}

    now = datetime.now(timezone.utc)
    out: List[dict] = []
    for s in subs:
        row = _summarize(s, users.get(s.get("user_id")), now)
        if near_expiry_days is not None:
            if row["days_remaining"] is None or row["days_remaining"] > near_expiry_days:
                continue
        out.append(row)
    return out


@router.get("/summary")
async def license_summary(_: dict = Depends(_require_admin)):
    """Aggregate counts for the admin dashboard."""
    pipeline = [{"$group": {"_id": "$status", "count": {"$sum": 1}}}]
    counts = {"trial": 0, "active": 0, "suspended": 0, "cancelled": 0, "expired": 0}
    async for row in db.subscriptions.aggregate(pipeline):
        counts[row["_id"] or "trial"] = row["count"]
    total_users = await db.users.count_documents({"role": {"$ne": "admin"}})
    total_subs = sum(counts.values())
    # Approx monthly recurring revenue from active + monthly plan
    mrr_pipeline = [
        {"$match": {"status": "active", "plan_type": "monthly"}},
        {"$group": {"_id": None, "mrr": {"$sum": "$monthly_price"}}},
    ]
    mrr = 0
    async for row in db.subscriptions.aggregate(mrr_pipeline):
        mrr = row.get("mrr", 0)
    return {
        "counts": counts,
        "total_users": total_users,
        "total_subscriptions": total_subs,
        "mrr": mrr,
    }


@router.put("/{user_id}")
async def update_license(user_id: str, payload: LicenseUpdate, _: dict = Depends(_require_admin)):
    sub = await db.subscriptions.find_one({"user_id": user_id}, {"_id": 0})
    now = datetime.now(timezone.utc)
    if not sub:
        # Create a fresh subscription record if one doesn't exist yet
        sub = {
            "id": user_id,
            "user_id": user_id,
            "status": "trial",
            "plan_type": "trial",
            "trial_start": now.isoformat(),
            "trial_end": (now + timedelta(days=14)).isoformat(),
            "created_at": now.isoformat(),
        }
        await db.subscriptions.insert_one(sub.copy())

    updates: dict = {}
    if payload.status:
        if payload.status not in VALID_STATUSES:
            raise HTTPException(status_code=400, detail="Invalid status")
        updates["status"] = payload.status
    if payload.plan_type:
        if payload.plan_type not in VALID_PLANS:
            raise HTTPException(status_code=400, detail="Invalid plan_type")
        updates["plan_type"] = payload.plan_type
    if payload.monthly_price is not None:
        if payload.monthly_price < 0:
            raise HTTPException(status_code=400, detail="monthly_price must be non-negative")
        updates["monthly_price"] = float(payload.monthly_price)
    if payload.notes is not None:
        updates["admin_notes"] = payload.notes

    # Date changes: prefer explicit set_end_date, else apply extend_days
    if payload.set_end_date:
        try:
            new_end = datetime.fromisoformat(payload.set_end_date.replace('Z', '+00:00'))
            updates["end_date"] = new_end.isoformat()
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid set_end_date ISO format")
    elif payload.extend_days is not None:
        current_end_iso = sub.get("end_date") or sub.get("trial_end")
        current_end = None
        if current_end_iso:
            try:
                current_end = datetime.fromisoformat(current_end_iso.replace('Z', '+00:00'))
            except Exception:
                current_end = None
        if current_end is None:
            current_end = now
        new_end = current_end + timedelta(days=int(payload.extend_days))
        updates["end_date"] = new_end.isoformat()

    if not updates:
        raise HTTPException(status_code=400, detail="No updates provided")
    updates["updated_at"] = now.isoformat()
    updates["updated_by"] = "admin"

    await db.subscriptions.update_one({"user_id": user_id}, {"$set": updates})
    sub2 = await db.subscriptions.find_one({"user_id": user_id}, {"_id": 0})
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "hashed_password": 0})
    return _summarize(sub2, user, now)


@router.get("/{user_id}")
async def get_license(user_id: str, _: dict = Depends(_require_admin)):
    sub = await db.subscriptions.find_one({"user_id": user_id}, {"_id": 0})
    if not sub:
        raise HTTPException(status_code=404, detail="License not found")
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "hashed_password": 0})
    return _summarize(sub, user, datetime.now(timezone.utc))
