# TourFlow AI — API Specification

Full machine-readable contract: `contracts/openapi.yaml` (generated from the
FastAPI implementation — regenerate after router changes).

Base URL: `{BACKEND_URL}/api/v1` · Auth: `Authorization: Bearer <supabase_jwt>` ·
Errors: `{error: {code, message, details}}`

## Endpoints

### System
- `GET /health`, `GET /api/v1/health`

### Auth / users
- `GET /api/v1/me` — current profile (role source for the frontend)
- `PATCH /api/v1/me` — update own profile
- `GET /api/v1/users?role=` — staff only
- `PATCH /api/v1/users/{id}/role` — admin only

### Trips
- `POST /api/v1/trips` — create (traveler/operator/admin)
- `GET /api/v1/trips?status=&page=` — scoped by role
- `GET/PATCH/DELETE /api/v1/trips/{id}` — trip-level auth; guarded status transitions
- `PUT /api/v1/trips/{id}/preferences`, `GET /api/v1/trips/{id}/preferences`

### Itinerary
- `GET/POST /api/v1/trips/{id}/itinerary`
- `PATCH/DELETE /api/v1/itinerary/{item_id}` (fixed items protected)
- `GET/POST /api/v1/trips/{id}/dependencies`, `DELETE /api/v1/dependencies/{id}`

### Disruptions & recovery (the core loop)
- `POST /api/v1/trips/{id}/disruptions` — records + runs impact analysis
- `GET /api/v1/trips/{id}/disruptions`
- `POST /api/v1/disruptions/{id}/impact` — deterministic evaluation → `ImpactOut`
- `POST /api/v1/disruptions/{id}/recovery-options` — generate + validate + AI-rank
- `GET /api/v1/disruptions/{id}/recovery-options` — feasible options only
- `POST /api/v1/recovery-options/{id}/select` — revalidate → mutate → audit

### Bookings & pricing
- `POST /api/v1/trips/{id}/bookings`, `GET /api/v1/trips/{id}/bookings`
- `PATCH /api/v1/bookings/{id}` — travelers can't CONFIRM (staff-only)
- `GET /api/v1/bookings` — staff/coordinator scoped
- `GET /api/v1/trips/{id}/pricing` — backend-authoritative breakdown

### AI
- `GET /api/v1/trips/{id}/recommendations`
- `GET /api/v1/trips/{id}/itinerary-suggestion`
- `POST /api/v1/trips/{id}/ask`

### Catalog
- `GET/POST /api/v1/vendors`, `PATCH /api/v1/vendors/{id}`
- `GET/POST/PATCH/DELETE /api/v1/hotels|activities|transportation[/...]`
- `GET /api/v1/destinations?q=&tag=`

### Ops
- `GET /api/v1/operator/summary` — staff only
- `GET /api/v1/notifications`, `POST /api/v1/notifications/{id}/read`
- `GET /api/v1/audit-logs` — staff only
- `POST/GET /api/v1/trips/{id}/reviews` — completed trips, traveler-only creation

## Conventions
- UUIDs as strings; datetimes ISO-8601 with timezone; money as decimal numbers.
- Pagination: `?page=&page_size=` (lists that need it).
- Idempotency: POSTs are not idempotent by design in hackathon scope; selection
  endpoints revalidate before mutating.
