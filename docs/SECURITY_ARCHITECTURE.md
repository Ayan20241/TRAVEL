# TourFlow AI — Security Architecture

## 1. Principles
- Never implement custom password storage — Supabase Auth only.
- Defense in depth: JWT validation → server-side RBAC → PostgreSQL RLS.
- Fail closed: auth service down → 503; unvalidatable recovery option → not offered.
- Least privilege: service-role key lives only in the backend environment.

## 2. Authentication flow
1. User signs in via Supabase Auth (frontend, `@supabase/ssr`).
2. Frontend sends `Authorization: Bearer <access_token>`.
3. `app/auth.py::decode_supabase_jwt` verifies signature against the Supabase JWKS
   (cached 10 min), expiry, and `aud=authenticated`.
4. `get_current_user` loads the `profiles` row (auto-provisions TRAVELER on first sight).
5. Expired/invalid tokens → 401 with "log in again" messaging; no token → 401.

## 3. Authorization
- `require_roles(*roles)` dependency for role-gated routes.
- `assert_trip_access`: owner, assigned coordinator, or staff (operator/admin).
- Vendors: own vendor rows + relevant bookings only.
- Booking confirmation: staff-only (travelers get 403).
- Role changes: admin-only; RLS `WITH CHECK` additionally restricts.

## 4. Row Level Security (`supabase/migrations/002_rls.sql`)
RLS enabled on all 16 tables. Helpers: `is_staff()`, `is_admin()`, `can_see_trip()`.
Trip-scoped tables inherit visibility from the trip. Notifications are owner-only.
Audit logs are staff-readable; writes use the service-role key (bypasses RLS) from the backend.

## 5. Secret handling
- `.env` never committed (gitignored); `.env.example` documents every variable.
- `SUPABASE_SERVICE_ROLE_KEY` is backend-only; frontend uses the anon key.
- Secrets are never logged; error payloads never include tokens or internals.

## 6. Input validation & error handling
- Pydantic v2 schemas on every write path (lengths, ranges, date ordering).
- Central error envelope; validation errors sanitized (non-JSON values stringified).
- Unhandled exceptions → generic 500; details go to server logs.

## 7. AI safety
- AI output parsed as JSON and field-validated; anything invalid is discarded.
- Timeouts, provider failures, bad JSON, missing key, rate limits → deterministic fallback.
- AI cannot mutate the DB, approve bookings, bypass RLS, or override constraints —
  architecturally impossible: it only returns rankings/explanations to the backend.

## 8. Security testing (implemented in `backend/tests/test_api.py`)
- 401 without token · 403 cross-traveler trip access · 403 traveler on operator endpoints ·
  403 traveler confirming a booking · 422 invalid dates with proper envelope ·
  operator visibility of all trips · admin-only role changes (route-gated).
- RLS policies are reviewed in SQL; live-RDS verification steps are in `DEPLOYMENT.md`.

## 9. Deployment hardening
- HTTPS only in production; restrictive CORS allowlist; docs (`/docs`) disabled in prod.
- `BACKEND_ENV=production` gates debug surfaces.
