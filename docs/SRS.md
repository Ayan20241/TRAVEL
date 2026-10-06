# TourFlow AI — Software Requirements Specification

## 1. Introduction
Purpose: specify the behavior of the TourFlow AI platform (PS ID 7) for developers,
QA, and hackathon judges. Scope: traveler web app, operator console, backend API,
database, AI assistance, deployment.

## 2. Functional requirements

### 2.1 Authentication (Supabase Auth)
- FR-A1: Users register/login with email+password via Supabase Auth.
- FR-A2: A `profiles` row is auto-created on signup (DB trigger) with role TRAVELER.
- FR-A3: Backend validates the Supabase JWT (JWKS, RS256, expiry, audience) on every request.
- FR-A4: Role changes are admin-only via API; RLS additionally guards direct DB access.

### 2.2 Trips
- FR-T1: Create trip with title, destination, dates (end ≥ start), budget ≥ 0, travel style.
- FR-T2: Lifecycle DRAFT→PLANNING→READY→BOOKED→IN_PROGRESS→DISRUPTED→COMPLETED/CANCELLED.
  Travelers follow guarded transitions; staff have full control.
- FR-T3: Preferences (budget, accommodation, transport, interests, pace, style, notes)
  influence recommendations; they never override constraints.
- FR-T4: Trip deletion only for DRAFT/PLANNING/CANCELLED.

### 2.3 Itinerary
- FR-I1: Typed items (FLIGHT…OTHER) with times (end > start), cost, fixed flag, sequence.
- FR-I2: Fixed items cannot be deleted.
- FR-I3: Dependencies (SEQUENTIAL/SPATIAL) with minimum buffer minutes; no self-loops;
  both items must belong to the same trip.

### 2.4 Constraint & dependency engines
- FR-C1: Centralized buffer thresholds (domestic flight 75m, international 120m,
  hotel 60m, activity/event 45m, train/bus/transfer 30m).
- FR-C2: Impact states: buffer ≥ threshold → UNAFFECTED; 0 ≤ buffer < threshold →
  AT_RISK; buffer < 0 → BROKEN; downstream-in-blast-radius with OK buffers → FLAGGED.
- FR-C3: Never mark all downstream items broken blindly.

### 2.5 Disruptions & recovery
- FR-D1: Record disruptions (6 types) with delay minutes or new start time.
- FR-D2: Impact analysis runs deterministically, persists a `constraint_evaluations`
  row, updates item statuses and trip status (→DISRUPTED).
- FR-D3: Recovery options are rule-generated per disruption type and **validated by
  the constraint engine**; only feasible ones are offered.
- FR-D4: AI ranks feasible options; it cannot create options or mark infeasible feasible.
- FR-D5: Selection revalidates on the backend before mutating the itinerary; the
  selection, actor, and changes are audited.

### 2.6 Pricing & bookings
- FR-P1: Pricing endpoint computes transportation/accommodation/activities/other,
  base, additional, discount, total, and budget comparison — backend-authoritative.
- FR-P2: Booking lifecycle PLANNED→PENDING→CONFIRMED→…; travelers cannot confirm
  their own bookings (staff-only); cancellations audited.

### 2.7 Operator console
- FR-O1: Dashboard summary (active/disrupted tours, open disruptions, pending bookings,
  revenue, travelers). FR-O2: Customers, bookings, catalog CRUD (soft delete),
  disruptions queue, audit log viewer, user/role management (admin).

### 2.8 AI
- FR-AI1: `AIClient` with replaceable provider; functions: recommend_experiences,
  generate_itinerary, rank_recovery_options, explain_recovery_option, answer_trip_question.
- FR-AI2: All AI output validated; failures → deterministic fallback; app keeps working.
- FR-AI3: AI never mutates the DB, approves bookings, or bypasses auth.

### 2.9 Audit, notifications, reviews
- FR-N1: Audit entries for TRIP_CREATED/UPDATED, ITINERARY_UPDATED, BOOKING_*,
  DISRUPTION_CREATED, IMPACT_EVALUATED, RECOVERY_GENERATED/SELECTED, ROLE_CHANGED.
- FR-N2: Reviews only on COMPLETED trips, by the trip's traveler.

## 3. Non-functional requirements
- NFR-1: p95 API latency < 500ms for CRUD (excl. AI calls).
- NFR-2: Responsive at 360px/768px/1440px; loading/empty/error states everywhere.
- NFR-3: Secrets only via env; service-role key never leaves the backend.
- NFR-4: No stack traces to clients; structured logs server-side.
- NFR-5: RLS on all tables; indexes on foreign keys and filter columns.

## 4. Acceptance criteria
The 20-step hackathon demo runs without manual DB edits; `pytest` is green;
`openapi.yaml` matches the implementation; Vercel build succeeds.
