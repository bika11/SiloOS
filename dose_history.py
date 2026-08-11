"""
Dose history store (SiloOS Console, Phase 5).

ADDITIVE + ISOLATED: a small stdlib sqlite3 log of completed/aborted doses,
written from the bridge's broadcast path and read for the Console's Performance
section. It NEVER participates in the dose control loop — every call is wrapped
so a storage error can never affect dispensing (same rule as the audit log).
"""

import contextlib
import os
import sqlite3
import threading
import time

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "dose_history.db")

_lock = threading.Lock()
_ready = False


def _connect():
    conn = sqlite3.connect(DB_PATH, timeout=5)
    conn.row_factory = sqlite3.Row
    return conn


def init():
    """Create the table if needed. Safe to call repeatedly."""
    global _ready
    try:
        with _lock, contextlib.closing(_connect()) as c:
            c.execute(
                """CREATE TABLE IF NOT EXISTS doses (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ts REAL NOT NULL,
                    silo TEXT NOT NULL,
                    target_kg REAL,
                    actual_kg REAL,
                    error_kg REAL,
                    duration_ms REAL,
                    source TEXT,
                    aborted INTEGER DEFAULT 0,
                    reason TEXT
                )"""
            )
            c.execute("CREATE INDEX IF NOT EXISTS idx_doses_ts ON doses(ts)")
            c.commit()
        _ready = True
    except Exception:
        _ready = False


def record(silo, target_kg=None, actual_kg=None, error_kg=None,
           duration_ms=None, source="dose", aborted=False, reason=None, ts=None):
    """Append one dose row. Guarded — never raises into the caller."""
    try:
        if not _ready:
            init()
        with _lock, contextlib.closing(_connect()) as c:
            c.execute(
                "INSERT INTO doses (ts, silo, target_kg, actual_kg, error_kg, duration_ms, source, aborted, reason)"
                " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (ts or time.time(), silo, target_kg, actual_kg, error_kg,
                 duration_ms, source, 1 if aborted else 0, reason),
            )
            c.commit()
    except Exception:
        pass  # history must NEVER affect dosing


def _empty_summary():
    return {
        "kpis": {"todayKg": 0, "todayCount": 0, "weekKg": 0, "weekCount": 0,
                 "monthKg": 0, "monthCount": 0, "meanAbsErrKg": None, "withinTolPct": None},
        "perSilo": {},
        "doseLog": [],
        "histogram": [],
        "recentBySilo": {},
        "abortCount": 0,
        "totalDoses": 0,
    }


# Signed-error histogram buckets in kg (label → inclusive upper edge logic below).
_HIST_EDGES = [-0.25, -0.15, -0.05, 0.05, 0.15, 0.25]
_HIST_LABELS = ["−.3", "−.2", "−.1", "0", "+.1", "+.2", "+.3"]


def _bucket(err):
    for i, edge in enumerate(_HIST_EDGES):
        if err < edge:
            return i
    return len(_HIST_EDGES)


def summary(recent=12, tol_kg=0.1):
    """Aggregate the store into the shape the Console Performance section reads."""
    try:
        if not _ready:
            init()
        with _lock, contextlib.closing(_connect()) as c:
            done_where = "aborted = 0 AND actual_kg IS NOT NULL"

            def scalar(sql, args=()):
                r = c.execute(sql, args).fetchone()
                return r[0] if r and r[0] is not None else 0

            def totals(day_expr):
                r = c.execute(
                    f"SELECT COALESCE(SUM(actual_kg),0), COUNT(*) FROM doses "
                    f"WHERE {done_where} AND date(ts,'unixepoch','localtime') {day_expr}"
                ).fetchone()
                return (round(r[0] or 0, 1), r[1] or 0)

            today_kg, today_n = totals("= date('now','localtime')")
            week_kg, week_n = totals(">= date('now','-6 days','localtime')")
            month_kg, month_n = totals(">= date('now','start of month','localtime')")

            # Mean absolute error over the last `recent*... ` completed doses.
            errs = [row[0] for row in c.execute(
                f"SELECT error_kg FROM doses WHERE {done_where} ORDER BY ts DESC LIMIT 50")]
            mean_abs = round(sum(abs(e) for e in errs) / len(errs), 3) if errs else None
            within = round(100 * sum(1 for e in errs if abs(e) <= tol_kg) / len(errs), 0) if errs else None

            # Per-silo dispensed (today/week/month).
            per_silo = {}
            for scope, expr in (("today", "= date('now','localtime')"),
                                ("week", ">= date('now','-6 days','localtime')"),
                                ("month", ">= date('now','start of month','localtime')")):
                for row in c.execute(
                        f"SELECT silo, COALESCE(SUM(actual_kg),0) FROM doses "
                        f"WHERE {done_where} AND date(ts,'unixepoch','localtime') {expr} GROUP BY silo"):
                    per_silo.setdefault(row[0], {"today": 0, "week": 0, "month": 0})
                    per_silo[row[0]][scope] = round(row[1] or 0, 1)

            # Recent completed doses for the accuracy log.
            dose_log = [
                {"ts": row["ts"], "silo": row["silo"], "targetKg": row["target_kg"],
                 "actualKg": row["actual_kg"], "errorKg": row["error_kg"]}
                for row in c.execute(
                    f"SELECT ts, silo, target_kg, actual_kg, error_kg FROM doses "
                    f"WHERE {done_where} ORDER BY ts DESC LIMIT ?", (recent,))
            ]

            # Signed-error histogram over the last 200 completed doses.
            counts = [0] * len(_HIST_LABELS)
            for row in c.execute(
                    f"SELECT error_kg FROM doses WHERE {done_where} ORDER BY ts DESC LIMIT 200"):
                counts[_bucket(row[0] or 0)] += 1
            histogram = [{"label": _HIST_LABELS[i], "count": counts[i]} for i in range(len(_HIST_LABELS))]

            # Recent per-silo signed error series (for the learned sparkline).
            recent_by_silo = {}
            for row in c.execute(
                    f"SELECT silo, error_kg FROM doses WHERE {done_where} ORDER BY ts DESC LIMIT 120"):
                recent_by_silo.setdefault(row[0], [])
                if len(recent_by_silo[row[0]]) < 12:
                    recent_by_silo[row[0]].append(round(row[1] or 0, 3))
            for k in recent_by_silo:
                recent_by_silo[k] = list(reversed(recent_by_silo[k]))

            abort_count = scalar(
                "SELECT COUNT(*) FROM doses WHERE aborted = 1 AND ts >= "
                "strftime('%s','now','-6 days')")
            total_done = scalar(f"SELECT COUNT(*) FROM doses WHERE {done_where}")

            return {
                "kpis": {
                    "todayKg": today_kg, "todayCount": today_n,
                    "weekKg": week_kg, "weekCount": week_n,
                    "monthKg": month_kg, "monthCount": month_n,
                    "meanAbsErrKg": mean_abs, "withinTolPct": within,
                },
                "perSilo": per_silo,
                "doseLog": dose_log,
                "histogram": histogram,
                "recentBySilo": recent_by_silo,
                "abortCount": abort_count,
                "totalDoses": total_done,
            }
    except Exception:
        return _empty_summary()
