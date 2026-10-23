# Workspace implementation status

The chat app is being restructured into a Workspace with user accounts on a
self-hosted Supabase backend. This file tracks what each phase delivered.

## Phase 1 — Self-hosted Supabase infrastructure and data model

Delivered:

- `supabase/docker-compose.yml`: Postgres, Supabase Auth, PostgREST, and a
  Caddy gateway exposing them as one public Supabase URL.
- `supabase/.env.example`: every stack secret and URL is documented. Real
  secrets live only in the untracked `supabase/.env`.
- `supabase/migrations/0001_workspace.sql`: `profiles`, `user_settings`,
  `projects`, `conversations`, `messages`, `tasks`, and `memories` with
  indexes, signup bootstrap, and row-level security. Anonymous users have no
  table access; authenticated users can only touch their own rows.
- `supabase/README.md`: start, migrate, health-check, backup/restore, and
  production responsibilities.

## Phase 2 — User accounts and authenticated API access

Delivered:

- `supabaseClient.js`: loads supabase-js as a version-pinned ESM module
  (no bundler, no import map) and shares one client plus a session bridge
  (`window.AppAuth`) with the rest of the app.
- `auth.js`: sign-up (email, password, display name), sign-in, password
  reset, profile bootstrap, and a session gate that hides the chat until a
  session exists. No `index.html` changes were needed for this phase.
- `server.js`: new `GET /config.json` (public URL + anon key only, no-store)
  and `POST /api/generate` now requires a valid Supabase access token
  (HS256 signature, expiry, authenticated role). Optional client-chosen
  `model` names are accepted when they match a safe character pattern;
  full history (`messages`) is accepted and composed into the Ollama prompt.
- `app.js`: attaches the session token to every generate request.
- `.env.example`: documents `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and the
  server-only `SUPABASE_JWT_SECRET` (identical to the stack `JWT_SECRET`).

Still open after Phase 2:

- The old single-page chat UI is unchanged apart from the session gate; the
  workspace shell, persistent conversations, projects, tasks, and dashboard
  land in Phases 3–5.
- No two-user RLS proof has been run yet (user asked for no test runs);
  reviewers must run it before trusting multi-user data.
