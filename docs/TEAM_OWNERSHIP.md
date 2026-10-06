# TourFlow AI — Team Ownership

Branch discipline: `Developer-1`, `Developer-2`, `Developer-3`. Never modify `main`
directly; never merge/rebase/cherry-pick another developer's branch; never force-push;
never use destructive git commands without the repo owner's explicit instruction.
Before every commit: `git branch --show-current`, `git status`, `git diff --stat`.

## Developer 1 — Backend, database, security, engines, AI
- `backend/` (FastAPI app, engines, AI layer, tests)
- `supabase/migrations/` (schema, RLS, seed)
- `contracts/openapi.yaml` (API contract)
- Backend docs: TRD, DATABASE_DESIGN, API_SPECIFICATION, SECURITY_ARCHITECTURE,
  AI_ARCHITECTURE, CONSTRAINT_ENGINE, TESTING_STRATEGY, DEVELOPER_1_AUDIT
- Backend deployment config (`backend/Dockerfile`, `render.yaml`)

## Developer 2 — Traveler frontend
- `frontend/app/traveler/**`, `frontend/app/(auth)/**` (login/register), landing page
- Traveler UX: trip wizard, itinerary builder, budget, disruption/recovery UI, profile

## Developer 3 — Operator frontend + deployment/integration
- `frontend/app/operator/**` (dashboard, trips, customers, bookings, catalog,
  disruptions, audit, settings)
- Deployment/integration: `vercel.json`, env documentation, Supabase prod config

## Shared (coordinate, don't duplicate)
- `frontend/lib/`, `frontend/components/` — shared primitives; changes by agreement
- `contracts/openapi.yaml` — Developer 1 owns; others build against it and report mismatches
- `.env.example` — Developer 1 owns backend vars; Developer 3 owns frontend vars

## Cross-developer rule
Need something from another area? Expose/consume it through the API contract —
never modify another developer's owned implementation.
