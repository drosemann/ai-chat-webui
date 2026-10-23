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

Still open after Phase 1:

- No application code uses Supabase yet.
- The existing single-user browser chat and unauthenticated `/api/generate`
  behavior are unchanged.
