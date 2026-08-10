"""Clinical data — Indian drug DB + lab tests search endpoints.

Data is bundled JSON, loaded once at import time. If we ever need to override
per-doctor, we'll layer a doctor-specific collection on top.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import List

from fastapi import APIRouter, Depends, Query

from shared import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/clinical", tags=["clinical"])

_DATA_DIR = Path(__file__).resolve().parent.parent / "data"

def _load(name: str, key: str) -> List[dict]:
    fp = _DATA_DIR / name
    try:
        with open(fp, "r", encoding="utf-8") as f:
            return json.load(f).get(key, [])
    except Exception as e:
        logger.error(f"Failed to load {fp}: {e}")
        return []

DRUGS = _load("indian_drugs.json", "drugs")
LAB_TESTS = _load("lab_tests.json", "lab_tests")


@router.get("/drugs/search")
async def search_drugs(
    q: str = Query("", description="Search text — name, generic or category"),
    limit: int = Query(15, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
):
    ql = q.strip().lower()
    if not ql:
        return {"results": DRUGS[:limit], "total": len(DRUGS)}
    hits = []
    for d in DRUGS:
        hay = f"{d.get('name','')} {d.get('generic','')} {d.get('category','')}".lower()
        if ql in hay:
            hits.append(d)
        if len(hits) >= limit:
            break
    return {"results": hits, "total": len(hits)}


@router.get("/drugs/categories")
async def drug_categories(current_user: dict = Depends(get_current_user)):
    cats = sorted({d.get("category", "Other") for d in DRUGS})
    return {"categories": cats}


@router.get("/lab-tests/search")
async def search_lab_tests(
    q: str = Query("", description="Search text — name, code or category"),
    limit: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
):
    ql = q.strip().lower()
    if not ql:
        return {"results": LAB_TESTS[:limit], "total": len(LAB_TESTS)}
    hits = []
    for t in LAB_TESTS:
        hay = f"{t.get('name','')} {t.get('code','')} {t.get('category','')}".lower()
        if ql in hay:
            hits.append(t)
        if len(hits) >= limit:
            break
    return {"results": hits, "total": len(hits)}


@router.get("/lab-tests/categories")
async def lab_categories(current_user: dict = Depends(get_current_user)):
    cats = sorted({t.get("category", "Other") for t in LAB_TESTS})
    return {"categories": cats}
