"""Operational health: per-cron-job last-run timestamps so the UI can surface
'scheduler stalled' banners and ops can monitor background tasks."""
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends

from shared import get_current_user, get_scheduler_runs

router = APIRouter(prefix="/health", tags=["health"])

# Stale threshold per job (in minutes). A run older than this triggers a "stale" flag.
STALE_THRESHOLDS = {
    "medication_reminders": 10,   # runs every 5 min, alert if 10+ stale
    "appointment_reminders_4h": 75,
    "appointment_reminders_24h": 26 * 60,
    "trial_expiry_check": 26 * 60,
    "process_expired_trials": 26 * 60,
}


@router.get("/scheduler")
async def scheduler_health(current_user: dict = Depends(get_current_user)):
    runs = get_scheduler_runs()
    now = datetime.now(timezone.utc)
    jobs = []
    any_stale = False
    for job_id, threshold_min in STALE_THRESHOLDS.items():
        last_run_iso = runs.get(job_id)
        stale = True
        age_min = None
        if last_run_iso:
            try:
                last_run = datetime.fromisoformat(last_run_iso)
                age_min = int((now - last_run).total_seconds() // 60)
                stale = age_min > threshold_min
            except Exception:
                stale = True
        if stale:
            any_stale = True
        jobs.append({
            "job_id": job_id,
            "last_run": last_run_iso,
            "age_minutes": age_min,
            "threshold_minutes": threshold_min,
            "stale": stale,
        })
    return {"any_stale": any_stale, "jobs": jobs, "checked_at": now.isoformat()}
