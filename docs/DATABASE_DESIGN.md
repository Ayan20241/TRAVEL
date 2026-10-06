# TourFlow AI — Database Design

Source of truth: `supabase/migrations/001_schema.sql` (tables) and `002_rls.sql` (policies).
SQLAlchemy models in `backend/app/models/` mirror the SQL.

## Entity-relationship (textual)

```
auth.users 1──1 profiles 1──* trips 1──1 trip_preferences
                            │ 1──* itinerary_items 1──* itinerary_dependencies (self-pair)
                            │ 1──* bookings 1──* payments
                            │ 1──* disruptions 1──* recovery_options
                            │ 1──* constraint_evaluations
                            │ 1──* notifications (per user)
                            │ 1──* reviews
vendors 1──* {hotels, activities, transportation, itinerary_items, bookings}
profiles (vendor role) 1──1 vendors (via profile_id)
```

## Tables (16)
| Table | Purpose | Key constraints |
|---|---|---|
| profiles | App user, `id = auth.users.id`, RBAC role | PK=auth id, unique email |
| destinations | Discoverable destinations + tags + avg cost | — |
| trips | Core trip: dates, budget, status, style | end ≥ start, duration ≥ 1 |
| trip_preferences | Soft preferences (never override constraints) | 1:1 with trips |
| itinerary_items | Typed schedule items | end > start, FK trip |
| itinerary_dependencies | source→target + min buffer | unique pair, no self-loop |
| bookings | Service bookings + lifecycle | FK trip/traveler/vendor |
| payments | Payment records (no gateway) | FK booking/trip |
| vendors | Service providers (optional linked profile) | — |
| hotels / activities / transportation | Operational catalog | city indexes |
| disruptions | Recorded incident + delay | FK trip, optional source item |
| constraint_evaluations | Persisted impact analysis | FK trip/disruption |
| recovery_options | Validated options + selection | FK trip/disruption |
| notifications | Per-user inbox | FK user |
| audit_logs | Immutable-ish action trail | indexes on actor/resource/action |
| reviews | Post-trip ratings 1–5 | FK trip/traveler |

## Enums (Postgres types)
`user_role, trip_status, item_type, item_status, booking_status, disruption_type,
disruption_status, recovery_action, dependency_type, payment_status` — mirrored in
`backend/app/models/enums.py`.

## Indexing strategy
- FK columns (`trip_id`, `traveler_id`, `user_id`, `disruption_id`) — B-tree
- Filter columns (`status`, `city`, `country`, `service_type`, `action`)
- Composite `(trip_id, sequence_order)` for itinerary ordering

## RLS summary (`002_rls.sql`)
- All tables: RLS enabled.
- `is_staff()` / `is_admin()` / `can_see_trip()` SECURITY DEFINER helpers.
- Travelers see own trips + everything hanging off them; vendors see own rows +
  relevant bookings; staff see all; notifications are owner-only; audit logs are
  staff-read (writes go through the backend with the service-role key, which bypasses RLS).
- Catalog reads are public to authenticated users; writes are staff-only
  (vendors may update their own vendor row).

## Data lifecycle notes
- Signup trigger `on_auth_user_created` inserts the profile row.
- `trg_updated_at` keeps `updated_at` fresh on 13 tables.
- Recovery option selection is the only flow that rewrites itinerary times, and it
  does so inside the same transaction as the audit entry.
