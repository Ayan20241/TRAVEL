# TourFlow AI — Deployment Guide

## 1. Supabase (database + auth)
1. Create a project at supabase.com.
2. In the SQL editor, run in order:
   - `supabase/migrations/001_schema.sql`
   - `supabase/migrations/002_rls.sql`
   - `supabase/migrations/003_seed.sql`
3. Auth → URL Configuration: add production redirect URLs
   (`https://<vercel-domain>/`, `http://localhost:3000/` for dev).
4. Enable email auth (default). Note the project URL, anon key, service-role key,
   and JWT secret.
5. **RLS verification checklist** (run as an authenticated non-staff user):
   - `SELECT * FROM trips` returns only own trips.
   - `SELECT * FROM trips` as another traveler returns zero rows for their trips.
   - `INSERT INTO bookings ...` with another traveler's id fails.
   - `SELECT * FROM audit_logs` as traveler returns zero rows.

## 2. Backend (container)
`backend/Dockerfile` builds a production image:
```bash
cd backend
docker build -t tourflow-api .
docker run -p 8000:8000 --env-file .env tourflow-api
```
`render.yaml` deploys to Render as a web service (or adapt to Fly.io/Railway —
any container host works; do not migrate frameworks for deployment).
Required env (see `.env.example`): `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL` (use the Supabase pooler URL),
`BACKEND_ENV=production`, `CORS_ORIGINS=https://<vercel-domain>`, AI vars as needed.
Health: `GET /health`.

## 3. Frontend (Vercel)
- Import the repo in Vercel; root directory `frontend`; framework preset Next.js.
- Env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `NEXT_PUBLIC_BACKEND_URL` (the deployed backend URL — no localhost in prod).
- `vercel.json` pins the build. Every push to the frontend branch redeploys.

## 4. Wiring it together
1. Deploy Supabase migrations.
2. Deploy backend; confirm `/health` and `/api/v1/health`.
3. Set `CORS_ORIGINS` to the Vercel domain; redeploy backend.
4. Deploy frontend with `NEXT_PUBLIC_BACKEND_URL` pointing at the backend.
5. Register a traveler, create a trip, simulate a disruption — the full demo.

## 5. Production notes
- Use the Supabase **pooler** `DATABASE_URL` (port 6543) for the backend.
- Set `BACKEND_ENV=production` (disables `/docs`).
- Never put `SUPABASE_SERVICE_ROLE_KEY` in frontend env.
- Backups: Supabase daily backups (project settings).
