# TourFlow AI — Product Requirements Document

**Hackathon PS ID 7 — Personalized Dynamic Tour Planning & Tour Operations Platform**
Version 1.0 · 2026-10-06

## 1. Problem
Traditional travel packages are rigid: fixed itineraries, opaque pricing, and no graceful
handling of disruptions. Travelers juggle spreadsheets and chat threads; operators lack a
single view of tours, vendors, and incidents.

## 2. Product vision
TourFlow AI lets travelers **Discover → Personalize → Plan → Price → Book → Prepare →
Travel → Adapt → Complete → Review**, while operators get centralized visibility into
tours, bookings, vendors, disruptions, and recovery.

## 3. Users & roles
| Role | Capabilities |
|---|---|
| TRAVELER | Register/login, create trips, set preferences, receive AI recommendations, build itinerary, view pricing, manage bookings, see disruptions, accept recovery options, review completed trips |
| OPERATOR | View travelers/trips/bookings, manage vendors/hotels/activities/transport, monitor tours, see disruptions, assist recovery, view analytics & audit logs |
| COORDINATOR | Manage assigned tours, coordinate vendors, respond to disruptions |
| VENDOR | Manage assigned services, update availability, view relevant bookings |
| ADMIN | Manage users/roles, platform config, audit logs, system health |

## 4. Core user journeys
### Journey A — Personalized trip creation
Login → create trip → destination → dates → budget → travel style → interests →
accommodation → transportation → AI recommendations → customize itinerary →
backend-calculated cost → confirm (DRAFT→PLANNING→READY→BOOKED).

### Journey B — Dynamic disruption (the differentiator)
A flight is delayed 3h. The system records the disruption → identifies the affected
item → traverses the dependency graph → computes buffers against centralized
thresholds → classifies items (BROKEN / AT_RISK / FLAGGED / UNAFFECTED) → generates
recovery options → validates each with the deterministic constraint engine → AI ranks
the feasible options → traveler/operator selects → backend revalidates → itinerary
updates → audit log records the change. No manual database edits.

## 5. Functional requirements
- Supabase Auth (registration, login, logout, sessions); role detected from profile.
- Trip CRUD with lifecycle statuses and guarded traveler transitions.
- Preferences that *influence recommendations but never override hard constraints*.
- Day-by-day itinerary with typed items, dependencies, buffers, fixed-item protection.
- Backend-authoritative pricing (transportation + accommodation + activities + other).
- Booking lifecycle: PLANNED → PENDING → CONFIRMED → CANCELLED/REBOOKED/COMPLETED.
- Disruption recording (6 types), deterministic impact analysis, recovery generation,
  AI ranking, selection with backend revalidation.
- Notifications, reviews (completed trips only), audit trail of important mutations.
- Operator console: dashboard, customers, bookings, catalog, disruptions, audit, settings.

## 6. Non-functional requirements
- Responsive (desktop/tablet/mobile); loading/empty/error states on every data page.
- Consistent error envelope; no stack traces to clients.
- RLS on all tables + server-side authorization (defense in depth).
- AI is assistive only; deterministic engines are authoritative; AI failure never breaks flows.
- Tests: engine unit tests, API tests, security tests, full E2E demo flow.

## 7. Out of scope (hackathon)
Real payment gateway (payments are recorded, not processed), real-time flight data
feeds (disruptions are recorded/simulated via API), native mobile apps.

## 8. Success criteria (demo)
The 20-step demo in the build prompt runs end-to-end without manual DB edits.
