# TourFlow AI — Testing Strategy

## 1. Pyramid
- **Unit** (`tests/test_engines.py`): dependency graph (BFS, topo order, cycle
  detection), constraint thresholds, BROKEN/AT_RISK/FLAGGED/UNAFFECTED classification.
  Pure Python, no DB, fast.
- **API** (`tests/test_api.py`): CRUD, validation, pricing math, lifecycle transitions.
- **Security** (`tests/test_api.py`, "security" section): 401 without token, 403
  cross-traveler access, 403 role violations (operator endpoints, booking confirm,
  vendor recovery selection), 422 envelope shape.
- **E2E** (`test_e2e_trip_disruption_recovery`): register→trip→preferences→
  recommendations→itinerary→dependencies→pricing→lifecycle→disruption→impact→
  recovery→select→audit verification. This is the hackathon demo as a test.

## 2. Running
```bash
cd backend
python -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python -m pytest tests/ -q
```
Auth is stubbed via FastAPI dependency overrides — no Supabase needed. SQLite is
used for API tests; engine tests need no DB at all.

## 3. What's covered / not
| Area | Status |
|---|---|
| Engines (deterministic) | ✅ unit-tested |
| API contracts | ✅ tested |
| RBAC matrix | ✅ tested (route-level) |
| RLS policies | ⚠️ reviewed in SQL; verify live per `DEPLOYMENT.md` checklist |
| AI provider calls | ✅ fallback paths tested implicitly (AI disabled in tests) |
| Frontend component tests | ⚠️ not in hackathon scope; flows verified manually against API |
| Load testing | ❌ out of scope |

## 4. Quality gates per phase
Every phase checkpoint: `pytest` green → `git status` clean review → branch verified →
docs updated → then continue. A failing E2E test blocks the phase.
