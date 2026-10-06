# TourFlow AI — Technical Requirements Document

## 1. Technology decisions
| Layer | Choice | Rationale |
|---|---|---|
| Frontend | Next.js 14 (App Router) + TypeScript + Tailwind | Vercel-native, SSR-capable, single codebase for traveler + operator |
| Backend | Python + FastAPI + Pydantic v2 + SQLAlchemy 2.0 + Alembic + Pytest | Prescribed by build spec; OpenAPI generated from code |
| Database | Supabase PostgreSQL | Managed Postgres, RLS, Auth in one platform |
| Auth | Supabase Auth (JWT, RS256) | No custom password storage, ever |
| AI | Abstraction (`AIClient`) over OpenAI-compatible endpoints | Provider replaceable; deterministic fallback when unconfigured/failing |

## 2. Backend structure (`backend/app/`)
- `main.py` — app factory, CORS, error handlers, router registration
- `config.py` — pydantic-settings, all secrets from env
- `database.py` — engine/session (Postgres in prod, SQLite for dev/tests)
- `auth.py` — Supabase JWKS validation, `get_current_user`, `require_roles`, trip/vendor access helpers
- `models/` — SQLAlchemy models mirroring `supabase/migrations/*.sql`
- `schemas/` — Pydantic request/response contracts
- `routers/` — trips, itinerary, disruptions, bookings, recommendations, catalog, users
- `engines/` — dependency, constraint, disruption, recovery (pure, tested)
- `ai/client.py` — provider-agnostic AI with validated JSON output
- `services/` — (pricing lives in bookings router; kept simple by design)
- `utils/` — error envelope, audit logging
- `seed.py` — clearly-separated demo seed

## 3. Key technical constraints
- **Deterministic engines are authoritative.** AI output is validated JSON; invalid/timeout/
  missing-key all fall back to deterministic behavior.
- **Pricing is backend-computed.** Frontend totals are display-only.
- **Recovery options must pass the constraint engine** before being offered, and pass
  **revalidation** at selection time before any mutation.
- **Every important mutation writes an audit log** (actor, action, resource, old/new state).
- **Error envelope**: `{error: {code, message, details}}`; 5xx messages are generic.
- **Thresholds live in one place**: `app/engines/constraint_engine.py::BUFFER_THRESHOLDS`.

## 4. API
REST/JSON under `/api/v1`. Contract: `contracts/openapi.yaml`, generated from the
FastAPI implementation (regenerate after router changes). Auth: `Authorization: Bearer <supabase_jwt>`.

## 5. Data
16 tables (see `DATABASE_DESIGN.md`). Migrations are plain SQL in
`supabase/migrations/` (source of truth; Alembic mirrors for local dev).
RLS enabled on all tables; backend also authorizes server-side.

## 6. Testing
`pytest`: engine unit tests, API tests, security tests (401/403/role matrix),
and one E2E test covering the full demo flow (register→trip→itinerary→pricing→
disruption→impact→recovery→select→audit). Target: green on every phase checkpoint.

## 7. Deployment
- Frontend → Vercel (`frontend/`, `vercel.json`), env: `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_BACKEND_URL`.
- Backend → container (`backend/Dockerfile`) on Render/Fly/Railway; `render.yaml` provided.
- Supabase → apply `supabase/migrations/*.sql` in order; configure auth redirect URLs.
- Health: `GET /health` and `GET /api/v1/health`.
