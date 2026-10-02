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
- Tables (`contadores`, `empresas`, `guias`, `documentos`, `documento_historico`, etc.) are auto-created on server startup via `criarTabelasAutomaticamente()`.
- The `documentos` table has extended columns: `tipo_documento`, `competencia`, `observacao`, `usuario_envio` (added via ALTER TABLE IF NOT EXISTS).
- `documento_historico` tracks all actions on each document (status changes, observations, uploads).
- No manual migrations needed. Data persists in the `pgdata` named volume across restarts.

## Security & Audit (Stage 5)
- **Row Level Security (RLS)**: Enabled + FORCED on 18 tables (documentos, guias, empresas, pendencias, financeiro, calendario_obrigacoes, procuracoes, notas_fiscais, folha_pagamento, checklist_mensal, avisos, chat_mensagens, crm_contatos, crm_atividades, crm_tarefas, documento_historico, guia_historico, audit_log). Policies use session variable `app.contador_id`; when unset (app pool default), all rows visible; when set (direct DB connection), filtered by contador_id.
- **Ownership validation**: All POST routes that accept `empresa_id` validate via `validarEmpresaContador()` that the empresa belongs to the authenticated contador. Cross-empresa access returns 403.
- **Download authorization**: All download routes (documentos, guias, notas-fiscais) check ownership BEFORE revealing file existence — prevents information leakage via URL ID tampering.
- **Audit log** (`audit_log` table): Enhanced with `entidade`, `entidade_id`, `empresa_id`, `versao`, `detalhe` columns. All important actions (login, CRUD, downloads, status changes, versioning) are logged with full context.
- **Audit endpoints**: `GET /api/admin/auditoria` (admin only, full log with filters) and `GET /api/auditoria` (contador sees only own actions).
- **Document versioning**: `documentos.versao` + `documentos.versao_anterior_id` columns. `POST /api/documentos/:id/nova-versao` cancels the old version and creates a new one (never silently overwrites). `GET /api/documentos/:id/versoes` lists all versions.
- **Guide versioning**: Already existed (`guias.versao`); edits increment version, published guides cannot be edited.
- **File storage**: Files stored as BYTEA in PostgreSQL (private — no public URL, access follows app permissions). All download routes require JWT + ownership verification.

## Central de Pendências e Notificações (Stage 6)
- **Backend**: Two aggregation endpoints that pull from multiple tables (documentos, guias, chat_mensagens, pendencias, crm_tarefas, checklist_mensal) into a single response with per-category arrays + totals.
  - `GET /api/central-pendencias` (contador) — shows what needs the contador's attention across ALL their companies: documentos solicitados, documentos aguardando análise, guias aguardando publicação, guias próximas do vencimento (7 dias), mensagens não lidas (dos clientes), tarefas pendentes (CRM), pendências gerais, checklist pendente.
  - `GET /api/cliente/central-pendencias` (cliente) — shows what needs the cliente's attention for THEIR company only: documentos faltantes, guias disponíveis, guias próximas do vencimento, mensagens não lidas (do contador), solicitações do contador, tarefas pendentes (checklist).
- **Frontend (contador)**: New sidebar item "Central de Pendências" (`views['central-pendencias']`) with 8 summary cards + per-category tables. Dashboard gets a widget summarizing the central with quick-jump buttons.
- **Frontend (cliente)**: New sidebar item "Central de Pendências" (`clientViews['central-pendencias']`) with 6 summary cards + per-category cards. "Início" view gets a resumo widget with alert badges.
- **Security**: Both endpoints use existing JWT middleware (`verificarTokenContador` / `verificarTokenCliente`). Contador queries filter by `contador_id`; cliente queries filter by `empresa_id` / `cnpj` from the token. RLS policies on all queried tables provide defense-in-depth. No cross-empresa data exposure.

## Verify
- `curl localhost:3000` returns the index.html landing page.
- `curl localhost:3000/api/contador/login -X POST -H 'Content-Type: application/json' -d '{"email":"x","senha":"y"}'` returns a JSON error (confirms API + DB are live).
- RLS check: `docker compose -f docker-compose.base44.yml exec -T db psql -U contador -d contadoronline -t -c "SELECT count(*) FROM pg_class WHERE relrowsecurity = true;"` → should return 18.
