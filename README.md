# Kshetram

A restrained Next.js and Express monorepo for agricultural services.

## Supabase setup

The server uses Supabase-hosted PostgreSQL directly through the `pg` driver. Configure `server/.env` with:

```text
DATABASE_URL=postgresql://postgres:aayush%402407@db.xlonssmmybjvvvuccwhj.supabase.co:5432/postgres
DATABASE_SSL=true
```

Initialize the database schema:

```powershell
npm run db:init
npm run dev
```

Open `http://localhost:3000`. The API runs at `http://localhost:4000`.

## Commands

- `npm run dev` - start frontend and backend
- `npm run build` - build both workspaces
- `npm run lint` - type/lint checks
- `npm run db:init` - initialize the Supabase PostgreSQL schema

## Feature scope

The demo includes OTP authentication, stubble listings and procurement, mower availability and booking slots, daily suggestions, seed exchange, cattle-feed catalog, and role-aware dashboards.
