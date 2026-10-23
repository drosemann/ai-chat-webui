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

## Phase 3 — Workspace shell and persistent chat

Delivered:

- `workspace.js`: builds the shell (sidebar with nav, pinned chats, today
  list, user chip, sign-out; content column with topbar and view root; right
  rail placeholder), hash router (`#/home`, `#/chat`, `#/chat/:id`,
  `#/projects`, `#/tasks`, `#/memory`, `#/models`, `#/settings`), and
  sidebar refresh from real Supabase data. Non-chat views show honest
  placeholders naming their phase.
- `app.js` is now a tiny classic entry point (the existing
  `<script src="app.js">` tag still works); all logic moved to
  `bootstrap.js`, which persists conversations/messages via `data.js`,
  restores them on reload and deep link, adds a working Send button, a chat
  toolbar (new/pin/rename/delete), and resets chat state on account change.
- `data.js`: the single data-access layer (profiles, settings,
  conversations, messages, projects, tasks, memories + task selectors).
- `utils.js`: shared escaping, truncation, date helpers, toasts.
- `styles.css`: auth, shell, sidebar, rail, view, and toast styles, loaded
  dynamically so `index.html` stays byte-identical for now.
- `auth.js`: session gate now toggles the shell and notifies the workspace.
- Chat sends the stored history (last 20 messages, unmodified) plus the
  user's configured default model; prompt content is never policed or
  rewritten by the app.

Still open after Phase 3:

- Home, Projects, Tasks, Memory, Models, and Settings views are placeholders.
- Rail is hidden until Phase 5. Theme syncs to the server in Phase 6.

## Phase 4 — Projects and tasks

Delivered:

- `tasks.js`: task list with status/project filters, create form (title,
  notes, due date, project, needs-input flag), checkbox complete, inline
  edit via prompts (documented as MVP), delete with confirmation.
- `projects.js`: project cards with live open-task and chat counts, detail
  view with open/done tasks, linked chats, archive/unarchive, and delete
  (tasks and chats are orphaned via `ON DELETE SET NULL`, never deleted).
- `workspace.js`: sidebar gains a Projects section; `#/tasks` and
  `#/projects` (list + `#/projects/:id` detail) routes render the real
  views; every data change refreshes the sidebar.
- `styles.css`: form, card, task-row, and project-card styles.

Still open after Phase 4:

- Home, Memory, Models, and Settings views are placeholders.
- Rail is hidden until Phase 5.

## Phase 5 — Home dashboard

Delivered:

- `home.js`: greeting with display name and live counts, three summary
  cards (open / done today / needs input), "Your day, handled" feed
  (needs-input with Review/Not-now, running generation, coming up), home
  composer that starts a chat from a typed prompt, and quick-prompt chips.
  Sections with no data are hidden; the all-empty state links to tasks/chat.
- Right rail on Home and Chat: today's checkboxes, next deadline, recently
  completed.
- `?demo=1` loads clearly labelled demo rows as the signed-in user;
  `clearDemo()` (wired in Settings, Phase 6) removes every `Demo:` row.
- `bootstrap.js`: picks up Home handoffs via `pendingPrompt`, exposes
  `ChatView.isBusy` for the "running" feed card.

Still open after Phase 5:

- Memory, Models, and Settings views are placeholders.

## Phase 6 — Memory, models, settings

Delivered:

- `memory.js`: user-authored notes CRUD with include-in-chat toggle. Chat
  prepends enabled memories (newest 10, verbatim) to outgoing history;
  nothing is extracted or ranked automatically.
- `models.js` + `server.js GET /api/models`: installed Ollama models from
  `/api/tags` (60s cache) with an explicit unreachable-Ollama error state.
  The generate endpoint rejects model names not installed on the server
  (availability check, never a quality judgment); failed tag lookups never
  block generation.
- `settings.js`: display-name edit, theme select (local + server synced both
  ways), default-model select, client-side JSON export, `?demo=1` cleanup,
  and "delete all my data" (typed DELETE confirmation, row-by-row through
  RLS; Auth-user removal stays a documented operator step).
- `bootstrap.js`: the unused `SYSTEM_PROMPT` constant is deleted (decision:
  content filtering stays in the `checkSpam` patterns, unchanged), theme
  toggle writes through to `user_settings`, server theme applies on chat
  mount.

Still open after Phase 6:

- Operator hardening (reverse proxy, backups drill, RLS proof) and final
  documentation.
