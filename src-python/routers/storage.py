"""
routers/storage.py — Database export/import endpoints.

POST /storage/export
    Copy the live SQLite database file to a user-specified path.

POST /storage/import
    Replace (or merge, which currently behaves identically) the live database
    with a copy sourced from a user-specified path.
"""

from __future__ import annotations

import os
import shutil

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from db import get_db_path

router = APIRouter()


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------


class ExportRequest(BaseModel):
    path: str


class ImportRequest(BaseModel):
    path: str
    mode: str = "merge"  # "merge" or "replace"


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.post("/export")
def export_db(req: ExportRequest):
    """Copy the live Octave database to the path specified by the caller.

    Returns
    -------
    ``{"status": "ok", "exported_to": "<path>"}``
    """
    db_path = get_db_path()
    if not os.path.exists(db_path):
        raise HTTPException(status_code=404, detail="Database not found")
    dest = req.path
    shutil.copy2(db_path, dest)
    return {"status": "ok", "exported_to": dest}


@router.post("/import")
def import_db(req: ImportRequest):
    """Replace the live Octave database with a copy from the caller's path.

    mode "replace" — direct file copy (destructive).
    mode "merge"   — currently identical to replace; full SQLite ATTACH-based
                     merge is reserved for a future revision.

    Returns
    -------
    ``{"status": "ok", "mode": "<mode>"}``
    """
    src = req.path
    if not os.path.exists(src):
        raise HTTPException(status_code=404, detail="Source file not found")
    db_path = get_db_path()
    if req.mode == "replace":
        shutil.copy2(src, db_path)
        return {"status": "ok", "mode": "replace"}
    elif req.mode == "merge":
        # For now, merge is identical to replace (full merge requires SQLite ATTACH)
        shutil.copy2(src, db_path)
        return {"status": "ok", "mode": "merge"}
    else:
        raise HTTPException(status_code=400, detail="mode must be 'merge' or 'replace'")
