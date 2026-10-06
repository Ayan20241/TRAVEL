# TourFlow AI

**Personalized Dynamic Tour Planning & Tour Operations Platform** — Hackathon PS ID 7.

Travelers discover, personalize, plan, price, book, and adapt trips dynamically.
Operators get centralized operational visibility: tours, bookings, vendors, disruptions,
recovery, schedules, and analytics.

## Architecture

```
Traveler Frontend (Next.js) ─┐
Operator Frontend (Next.js) ─┴─▶ HTTPS/REST ─▶ FastAPI backend ─▶ Supabase PostgreSQL (+RLS)
                                                     │                  ▲
                                   Auth/RBAC ◀── Supabase Auth (JWT) ───┘
                                                     │
                                   Constraint / Dependency / Disruption / Recovery engines
                                                     │
                                                   AI layer (replaceable provider, deterministic fallback)
```

- **Frontend:** Next.js 14 (App Router) + TypeScript + Tailwind, deployed on **Vercel**
- **Backend:** Python + FastAPI + Pydantic v2 + SQLAlchemy + Alembic + Pytest
- **Database/Auth:** Supabase PostgreSQL with Row Level Security + Supabase Auth (JWT)
- **AI:** abstraction layer (`AIClient`) — provider replaceable, never authoritative

## Quick start

```bash
cp .env.example backend/.env        # fill in Supabase values
cd backend && pip install -r requirements.txt
alembic upgrade head                # or apply supabase/migrations/*.sql in Supabase SQL editor
uvicorn app.main:app --reload
cd ../frontend && npm install && npm run dev
```

See `docs/DEVELOPMENT_PLAN.md` and `docs/DEPLOYMENT.md` for the full story.

## Repository layout

```
backend/            FastAPI app (Developer-1)
frontend/           Next.js traveler + operator apps (Developer-2/3)
supabase/migrations SQL migrations with RLS (source of truth for schema)
contracts/openapi.yaml  API contract
docs/               PRD, TRD, SRS, architecture, security, testing, deployment…
```

## Team ownership

See `docs/TEAM_OWNERSHIP.md`.
