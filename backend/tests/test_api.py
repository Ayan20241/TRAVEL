"""API + security tests. Auth is stubbed via dependency override (no Supabase needed).

Security tests verify: 401 without token, 403 cross-traveler access,
403 role violations, 422 validation, and the full E2E demo flow.
"""
import uuid
from datetime import date, datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.auth import get_current_user, AuthUser
from app.database import Base, get_db
from app import models  # noqa: F401
from app.models import Role, Profile

# --- in-memory DB ---
engine = create_engine("sqlite://", connect_args={"check_same_thread": False},
                       poolclass=StaticPool)
TestingSession = sessionmaker(bind=engine)
Base.metadata.create_all(bind=engine)


def _db():
    db = TestingSession()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = _db

TRAVELER_A = uuid.uuid4()
TRAVELER_B = uuid.uuid4()
OPERATOR = uuid.uuid4()

with TestingSession() as db:
    for uid, email, role in [
        (TRAVELER_A, "a@tourflow.ai", Role.TRAVELER),
        (TRAVELER_B, "b@tourflow.ai", Role.TRAVELER),
        (OPERATOR, "op@tourflow.ai", Role.OPERATOR),
    ]:
        db.add(Profile(id=uid, email=email, full_name=email, role=role))
    db.commit()


def _auth(uid: uuid.UUID):
    def _override():
        with TestingSession() as db:
            p = db.get(Profile, uid)
            return AuthUser(id=p.id, email=p.email, role=p.role, profile=p)
    app.dependency_overrides[get_current_user] = _override


def _no_auth():
    app.dependency_overrides.pop(get_current_user, None)


@pytest.fixture
def client():
    _auth(TRAVELER_A)
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c


def _create_trip(c: TestClient, **kw):
    start = date.today() + timedelta(days=30)
    payload = {
        "title": "Test Trip", "destination": "Paris",
        "start_date": start.isoformat(),
        "end_date": (start + timedelta(days=4)).isoformat(),
        "budget": 150000, "currency": "INR", "travel_style": "relaxed",
    }
    payload.update(kw)
    r = c.post("/api/v1/trips", json=payload)
    assert r.status_code == 201, r.text
    return r.json()


# ---------------- security ----------------
def test_unauthenticated_rejected():
    _no_auth()
    with TestClient(app, raise_server_exceptions=False) as c:
        r = c.get("/api/v1/trips")
        assert r.status_code == 401
    _auth(TRAVELER_A)


def test_traveler_cannot_access_another_travelers_trip(client):
    trip = _create_trip(client)
    _auth(TRAVELER_B)
    with TestClient(app, raise_server_exceptions=False) as c2:
        r = c2.get(f"/api/v1/trips/{trip['id']}")
        assert r.status_code == 403
    _auth(TRAVELER_A)


def test_traveler_cannot_use_operator_endpoints(client):
    r = client.get("/api/v1/operator/summary")
    assert r.status_code == 403


def test_traveler_cannot_confirm_booking(client):
    trip = _create_trip(client)
    b = client.post(f"/api/v1/trips/{trip['id']}/bookings",
                    json={"service_type": "hotel", "service_name": "Test Hotel"}).json()
    r = client.patch(f"/api/v1/bookings/{b['id']}", json={"status": "CONFIRMED"})
    assert r.status_code == 403


def test_invalid_trip_dates_rejected(client):
    start = date.today() + timedelta(days=30)
    r = client.post("/api/v1/trips", json={
        "title": "Bad", "destination": "Paris",
        "start_date": start.isoformat(),
        "end_date": (start - timedelta(days=1)).isoformat(),
    })
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "VALIDATION_ERROR"


def test_operator_can_list_trips():
    _auth(OPERATOR)
    with TestClient(app, raise_server_exceptions=False) as c:
        r = c.get("/api/v1/trips")
        assert r.status_code == 200
    _auth(TRAVELER_A)


def test_vendor_soft_delete_staff_only():
    _auth(OPERATOR)
    with TestClient(app, raise_server_exceptions=False) as c:
        v = c.post("/api/v1/vendors", json={"name": "Temp Vendor", "service_type": "hotel"})
        assert v.status_code == 201, v.text
        vid = v.json()["id"]
        r = c.delete(f"/api/v1/vendors/{vid}")
        assert r.status_code == 204
        # soft-deleted: still present but inactive
        got = c.get("/api/v1/vendors")
        assert all(x["id"] != vid or x["is_active"] is False for x in got.json())
    _auth(TRAVELER_A)
    with TestClient(app, raise_server_exceptions=False) as c2:
        v = c2.post("/api/v1/vendors", json={"name": "X", "service_type": "hotel"})
        assert v.status_code == 403  # travelers can't create vendors either


# ---------------- E2E demo flow ----------------
def test_e2e_trip_disruption_recovery(client):
    trip = _create_trip(client)
    tid = trip["id"]

    # preferences
    r = client.put(f"/api/v1/trips/{tid}/preferences", json={
        "interests": ["history", "food", "museums"], "travel_style": "relaxed",
        "accommodation_preference": "hotel", "transportation_preference": "flight",
        "pace": "relaxed", "budget": 150000})
    assert r.status_code == 200

    # recommendations (AI disabled -> deterministic fallback, still 200)
    r = client.get(f"/api/v1/trips/{tid}/recommendations")
    assert r.status_code == 200 and len(r.json()) > 0

    # itinerary: flight -> transfer -> hotel -> dinner
    day1 = datetime.now(timezone.utc).replace(hour=6, minute=0, second=0, microsecond=0) \
        + timedelta(days=30)
    def item(typ, title, s, e, cost=0, fixed=False):
        rr = client.post(f"/api/v1/trips/{tid}/itinerary", json={
            "type": typ, "title": title, "location": "Paris",
            "start_time": s.isoformat(), "end_time": e.isoformat(),
            "cost": cost, "is_fixed": fixed})
        assert rr.status_code == 201, rr.text
        return rr.json()

    flight = item("FLIGHT", "Flight to Paris", day1, day1 + timedelta(hours=9), 42000, True)
    transfer = item("TRANSFER", "Airport transfer", day1 + timedelta(hours=10),
                    day1 + timedelta(hours=11), 2500)
    hotel = item("HOTEL", "Hotel check-in", day1 + timedelta(hours=12),
                 day1 + timedelta(hours=12, minutes=30), 70000, True)
    dinner = item("RESTAURANT", "Dinner", day1 + timedelta(hours=14),
                  day1 + timedelta(hours=16), 4500)
    for a, b in [(flight, transfer), (transfer, hotel), (hotel, dinner)]:
        rr = client.post(f"/api/v1/trips/{tid}/dependencies", json={
            "source_item_id": a["id"], "target_item_id": b["id"],
            "dependency_type": "SEQUENTIAL", "minimum_required_buffer_minutes": 30})
        assert rr.status_code == 201, rr.text

    # pricing is backend-calculated
    r = client.get(f"/api/v1/trips/{tid}/pricing")
    assert r.status_code == 200
    assert r.json()["estimated_total"] == 42000 + 2500 + 70000 + 4500

    # confirm trip (walk the lifecycle: DRAFT -> PLANNING -> READY -> BOOKED)
    for st in ["PLANNING", "READY", "BOOKED"]:
        r = client.patch(f"/api/v1/trips/{tid}", json={"status": st})
        assert r.status_code == 200, r.text

    # operator sees the trip
    _auth(OPERATOR)
    with TestClient(app, raise_server_exceptions=False) as oc:
        assert oc.get(f"/api/v1/trips/{tid}").status_code == 200
    _auth(TRAVELER_A)

    # simulate disruption: 3h flight delay
    r = client.post(f"/api/v1/trips/{tid}/disruptions", json={
        "type": "FLIGHT_DELAY", "source_item_id": flight["id"],
        "delay_minutes": 180, "reason": "Air traffic congestion"})
    assert r.status_code == 201, r.text
    disruption = r.json()

    # impact analysis
    r = client.post(f"/api/v1/disruptions/{disruption['id']}/impact")
    assert r.status_code == 200, r.text
    impact = r.json()
    assert not impact["feasible"]
    assert transfer["id"] in impact["broken_items"]  # transfer can't wait 3h

    # recovery options (only feasible ones returned)
    r = client.post(f"/api/v1/disruptions/{disruption['id']}/recovery-options")
    assert r.status_code == 200, r.text
    options = r.json()
    assert len(options) > 0
    assert all(o["feasibility"] for o in options)

    # select an option -> itinerary updates
    r = client.post(f"/api/v1/recovery-options/{options[0]['id']}/select")
    assert r.status_code == 200, r.text
    assert r.json()["selected"] is True

    # audit trail recorded
    _auth(OPERATOR)
    with TestClient(app, raise_server_exceptions=False) as oc:
        r = oc.get("/api/v1/audit-logs")
        assert r.status_code == 200
        actions = [a["action"] for a in r.json()]
        assert "DISRUPTION_CREATED" in actions
        assert "IMPACT_EVALUATED" in actions
        assert "RECOVERY_GENERATED" in actions
        assert "RECOVERY_SELECTED" in actions
    _auth(TRAVELER_A)
