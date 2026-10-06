# TourFlow AI — Architecture

```
                    ┌─────────────────────┐
                    │  Traveler Frontend  │  Next.js app/traveler/**
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │  Operator Frontend  │  Next.js app/operator/**
                    └──────────┬──────────┘
                               │ HTTPS / REST (Authorization: Bearer <supabase JWT>)
                    ┌──────────▼──────────┐
                    │     FastAPI API     │  backend/app — /api/v1/*
                    └──────────┬──────────┘
                               │
             ┌─────────────────┼─────────────────┐
             │                 │                 │
       ┌─────▼─────┐    ┌──────▼──────┐   ┌────▼────┐
       │ Auth/RBAC │    │ Domain Logic │   │ AI Layer│  AIClient (replaceable)
       └───────────┘    └──────┬──────┘   └────┬────┘
                               │               │ ranks only
                    ┌──────────▼──────────┐    │
                    │ Constraint Engine   │◄───┘
                    │ Dependency Engine   │
                    │ Disruption Engine   │
                    │ Recovery Engine     │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │ PostgreSQL/Supabase │  RLS on all tables
                    └─────────────────────┘
```

## Request lifecycle
1. Next.js obtains the Supabase session; the access token goes in `Authorization`.
2. FastAPI `get_current_user` validates the JWT via Supabase JWKS (cached 10 min),
   loads/creates the `profiles` row (role source).
3. Route handlers call `require_roles(...)` and/or `assert_trip_access(...)`.
4. Domain logic runs; deterministic engines decide feasibility; AI only ranks/explains.
5. Important mutations write `audit_logs` rows in the same transaction.
6. Errors return `{error: {code, message, details}}`; 5xx messages are generic.

## Key design decisions
- **Engines are pure Python** (`app/engines/`), DB-agnostic, unit-tested without a database.
- **AI is a leaf, not a layer**: it receives validated options and returns rankings;
  the backend revalidates before mutation (see `AI_ARCHITECTURE.md`).
- **Pricing computed server-side** from itinerary items; the client never sends totals.
- **Migrations are plain SQL** (Supabase-first); SQLAlchemy models mirror them.
- **Defense in depth**: RLS policies + server-side authorization + JWT validation.

## Module map
| Path | Responsibility |
|---|---|
| `backend/app/main.py` | App assembly, CORS, error handlers |
| `backend/app/auth.py` | JWT validation, RBAC helpers |
| `backend/app/routers/` | HTTP surface (one module per domain) |
| `backend/app/engines/` | Deterministic business rules |
| `backend/app/ai/` | Provider-agnostic AI |
| `backend/app/models/` + `supabase/migrations/` | Schema (SQL is source of truth) |
| `frontend/app/traveler/**` | Traveler experience |
| `frontend/app/operator/**` | Operator console |
| `contracts/openapi.yaml` | API contract (generated from FastAPI) |
