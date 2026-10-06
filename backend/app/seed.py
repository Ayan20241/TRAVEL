"""Demo seed data — clearly separated from production logic.

Run:  python -m app.seed  (with DATABASE_URL pointing at your dev DB)
"""
from datetime import date, datetime, timedelta, timezone

from app.database import SessionLocal, engine, Base
from app import models  # noqa: F401  (register models)
from app.models import (
    Role, TripStatus, ItemType, ItemStatus, BookingStatus, Destination,
    Profile, Trip, TripPreference, ItineraryItem, ItineraryDependency,
    Vendor, Hotel, Activity, Transportation, DependencyType,
)
import uuid

DESTINATIONS = [
    ("Paris", "France", "The City of Light — art, cuisine, and timeless boulevards.",
     ["history", "food", "museums", "photography", "culture"], 12000),
    ("Kyoto", "Japan", "Temples, gardens, and centuries of tradition.",
     ["history", "culture", "nature", "photography"], 10000),
    ("Bali", "Indonesia", "Island of the Gods — beaches, temples, rice terraces.",
     ["nature", "adventure", "culture", "photography"], 7000),
    ("Rome", "Italy", "The Eternal City — ancient wonders and la dolce vita.",
     ["history", "food", "culture", "photography"], 11000),
    ("Dubai", "UAE", "Futuristic skyline, desert adventures, luxury shopping.",
     ["shopping", "adventure", "food", "culture"], 15000),
]


def seed():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        if db.query(Destination).count():
            print("Seed data already present, skipping.")
            return

        for name, country, desc, tags, cost in DESTINATIONS:
            db.add(Destination(name=name, country=country, description=desc,
                               tags=tags, avg_daily_cost=cost, currency="INR"))

        # Vendors + catalog
        v1 = Vendor(name="SkyWings Airlines", service_type="transport", city="Delhi", rating=4.5)
        v2 = Vendor(name="Grand Meridian Hotels", service_type="hotel", city="Paris", rating=4.7)
        v3 = Vendor(name="CitySights Tours", service_type="activity", city="Paris", rating=4.6)
        db.add_all([v1, v2, v3])
        db.flush()
        db.add(Hotel(vendor_id=v2.id, name="Grand Meridian Paris", city="Paris",
                     country="France", stars=4, price_per_night=14000,
                     amenities=["wifi", "pool", "spa", "breakfast"]))
        db.add(Activity(vendor_id=v3.id, name="Louvre Guided Tour", city="Paris",
                        category="museums", duration_minutes=180, price=2500))
        db.add(Activity(vendor_id=v3.id, name="Seine Evening Cruise", city="Paris",
                        category="culture", duration_minutes=120, price=1800))
        db.add(Transportation(vendor_id=v1.id, mode="flight", name="SkyWings 204",
                              origin="Delhi", destination="Paris", price=42000))

        # Demo traveler + trip (Paris, 5 days, ₹1,50,000)
        traveler = Profile(id=uuid.uuid4(), email="demo.traveler@tourflow.ai",
                           full_name="Demo Traveler", role=Role.TRAVELER)
        db.add(traveler)
        db.flush()

        start = date.today() + timedelta(days=30)
        trip = Trip(
            traveler_id=traveler.id, title="Paris in 5 Days", destination="Paris",
            start_date=start, end_date=start + timedelta(days=4), duration_days=5,
            budget=150000, currency="INR", status=TripStatus.READY,
            travel_style="relaxed",
        )
        db.add(trip)
        db.flush()
        db.add(TripPreference(
            trip_id=trip.id, budget=150000, accommodation_preference="hotel",
            transportation_preference="flight",
            interests=["history", "food", "museums", "photography"],
            activity_preferences=["guided tours", "river cruise"],
            pace="relaxed", travel_style="relaxed",
            notes="Vegetarian food preferred.",
        ))

        day1 = datetime(start.year, start.month, start.day, 6, 0, tzinfo=timezone.utc)
        items = [
            (ItemType.FLIGHT, "SkyWings 204 — Delhi to Paris", day1, day1 + timedelta(hours=9), 42000, True),
            (ItemType.TRANSFER, "Airport to hotel transfer", day1 + timedelta(hours=10), day1 + timedelta(hours=11), 2500, False),
            (ItemType.HOTEL, "Grand Meridian Paris — check-in", day1 + timedelta(hours=12), day1 + timedelta(hours=12, minutes=30), 70000, True),
            (ItemType.RESTAURANT, "Dinner at Le Petit Zinc", day1 + timedelta(hours=14), day1 + timedelta(hours=16), 4500, False),
            (ItemType.ACTIVITY, "Louvre Guided Tour", day1 + timedelta(days=1, hours=3), day1 + timedelta(days=1, hours=6), 2500, False),
            (ItemType.ACTIVITY, "Seine Evening Cruise", day1 + timedelta(days=1, hours=12), day1 + timedelta(days=1, hours=14), 1800, False),
        ]
        prev = None
        for i, (typ, title, s, e, cost, fixed) in enumerate(items):
            item = ItineraryItem(
                trip_id=trip.id, type=typ, title=title, location="Paris",
                start_time=s, end_time=e, cost=cost, currency="INR",
                status=ItemStatus.CONFIRMED if fixed else ItemStatus.PLANNED,
                booked_status=BookingStatus.CONFIRMED if fixed else BookingStatus.PLANNED,
                is_fixed=fixed, sequence_order=i,
            )
            db.add(item)
            db.flush()
            if prev is not None:
                db.add(ItineraryDependency(
                    trip_id=trip.id, source_item_id=prev.id, target_item_id=item.id,
                    dependency_type=DependencyType.SEQUENTIAL,
                    minimum_required_buffer_minutes=60 if typ == ItemType.HOTEL else 30,
                ))
            prev = item

        db.commit()
        print("Seed data created: 5 destinations, catalog, demo traveler + Paris trip.")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
