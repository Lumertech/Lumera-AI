"""Clinical data — Indian drug DB + lab tests search endpoints.

Data is bundled JSON, loaded once at import time and indexed for fast fuzzy
lookup. If we ever need per-doctor overrides, we'll layer a doctor-specific
collection on top.

Search algorithm:
  1. Case-insensitive substring hits are the highest-relevance bucket (rank 0).
  2. Prefix-per-token hits ("panto" → "Pantoprazole") — rank 1.
  3. `difflib.SequenceMatcher` fuzzy score ≥ 0.55 — rank 2.
  Results are sorted by (rank asc, score desc) and truncated to `limit`.
"""
from __future__ import annotations

import json
import logging
from difflib import SequenceMatcher
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
    except Exception as e:  # noqa: BLE001
        logger.error(f"Failed to load {fp}: {e}")
        return []


DRUGS = _load("indian_drugs.json", "drugs")
LAB_TESTS = _load("lab_tests.json", "lab_tests")


def _drug_haystack(d: dict) -> str:
    return f"{d.get('name','')} {d.get('generic','')} {d.get('category','')} {d.get('form','')}".lower()


def _lab_haystack(t: dict) -> str:
    return f"{t.get('name','')} {t.get('code','')} {t.get('category','')} {t.get('sample','')}".lower()


# Pre-compute haystacks once at import time so search stays sub-millisecond.
_DRUG_HAY = [_drug_haystack(d) for d in DRUGS]
_LAB_HAY = [_lab_haystack(t) for t in LAB_TESTS]


def _fuzzy_search(items: list[dict], haystacks: list[str], query: str, limit: int) -> list[dict]:
    """Rank by: substring hit (0) > per-token prefix hit (1) > fuzzy ratio (2)."""
    q = query.strip().lower()
    if not q:
        return items[:limit]
    tokens = [t for t in q.replace(",", " ").split() if t]

    ranked: list[tuple[int, float, dict]] = []
    for i, hay in enumerate(haystacks):
        # Rank 0 — direct substring match on full query
        if q in hay:
            ranked.append((0, 1.0, items[i]))
            continue
        # Rank 1 — every token prefixes some word in the haystack
        words = hay.split()
        if tokens and all(any(w.startswith(tok) for w in words) for tok in tokens):
            ranked.append((1, 0.9, items[i]))
            continue
        # Rank 2 — fuzzy ratio ≥ 0.55 (SequenceMatcher on the name only for speed)
        name = items[i].get("name", "").lower()
        score = SequenceMatcher(None, q, name).ratio()
        if score >= 0.55:
            ranked.append((2, score, items[i]))

    ranked.sort(key=lambda x: (x[0], -x[1]))
    return [r[2] for r in ranked[:limit]]


@router.get("/drugs/search")
async def search_drugs(
    q: str = Query("", description="Search text — brand, generic, category or form"),
    limit: int = Query(15, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
):
    hits = _fuzzy_search(DRUGS, _DRUG_HAY, q, limit)
    return {"results": hits, "total": len(hits), "corpus_size": len(DRUGS)}


@router.get("/drugs/categories")
async def drug_categories(current_user: dict = Depends(get_current_user)):
    cats = sorted({d.get("category", "Other") for d in DRUGS})
    return {"categories": cats, "count": len(cats)}


@router.get("/lab-tests/search")
async def search_lab_tests(
    q: str = Query("", description="Search text — name, LOINC code, category or sample"),
    limit: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
):
    hits = _fuzzy_search(LAB_TESTS, _LAB_HAY, q, limit)
    return {"results": hits, "total": len(hits), "corpus_size": len(LAB_TESTS)}


@router.get("/lab-tests/categories")
async def lab_categories(current_user: dict = Depends(get_current_user)):
    cats = sorted({t.get("category", "Other") for t in LAB_TESTS})
    return {"categories": cats, "count": len(cats)}
