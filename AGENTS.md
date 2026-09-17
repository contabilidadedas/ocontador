# Base44 Dev Environment

## Overview
Single-origin Express app (`server.js`) serving static HTML frontend + REST API on port 3000.
Uses PostgreSQL for persistence and JWT for auth. File uploads (PDFs) stored in DB as BYTEA.

## Setup
- `docker compose -f docker-compose.base44.yml up -d --build` starts a PostgreSQL 16 service and a Node 22 service.
- The Node service bind-mounts the repo, runs `npm install` then `npx nodemon server.js` (auto-restarts on server.js changes).
- Frontend HTML changes are served live (static middleware), no restart needed.

## Key env vars
- `DATABASE_URL` — set inline in compose, points to the local postgres service (not a secret; local infra).
- `JWT_SECRET` — delivered via `/run/base44/app.env`; a development placeholder is generated if the user hasn't set one.

## Database
- Tables (`contadores`, `empresas`, `guias`) are auto-created on server startup via `criarTabelasAutomaticamente()`.
- No manual migrations needed. Data persists in the `pgdata` named volume across restarts.

## Verify
- `curl localhost:3000` returns the index.html landing page.
- `curl localhost:3000/api/contador/login -X POST -H 'Content-Type: application/json' -d '{"email":"x","senha":"y"}'` returns a JSON error (confirms API + DB are live).
