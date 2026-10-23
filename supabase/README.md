# Self-hosted Supabase backend

This folder contains everything needed to run the app's own Supabase stack:
Postgres (with the workspace schema in `migrations/`), Supabase Auth (GoTrue),
PostgREST, and a small Caddy gateway that exposes them as one Supabase URL.

The managed Supabase cloud, Clerk, WorkOS, and hand-rolled password storage
are intentionally not used here: auth data stays on infrastructure you operate.

## 1. Configure secrets

```bash
cp supabase/.env.example supabase/.env
```

Then replace every `change-me-...` value. Generate strong values with:

```bash
openssl rand -hex 32
openssl rand -base64 48 | tr -d '\n'
```

Never commit `supabase/.env`. The root `.gitignore` already excludes `.env`
files everywhere. The browser only ever receives the public gateway URL and
the anon key; row-level security is what protects user data.

## 2. Start the stack

```bash
docker compose --env-file supabase/.env -f supabase/docker-compose.yml up -d db auth rest gateway
```

Apply the workspace schema once per database:

```bash
docker compose --env-file supabase/.env -f supabase/docker-compose.yml exec db \
  psql -U postgres -d postgres -f /migrations/0001_workspace.sql
```

Later schema changes must be added as new immutable files
(`0002_*.sql`, `0003_*.sql`, ...) and applied explicitly with `psql`.

## 3. Check the services

- Gateway health: `SUPABASE_PUBLIC_URL/health`
- Auth health: `http://127.0.0.1:9999/health` (default local port)
- PostgREST is reachable only through `/rest/v1/...` on the gateway.

If SMTP variables are empty, set `GOTRUE_MAILER_AUTOCONFIRM=true` for local
development only. Without working SMTP and without autoconfirm, new accounts
cannot confirm their email address.

## 4. Back up and restore

Back up (run on a schedule in production):

```bash
docker compose --env-file supabase/.env -f supabase/docker-compose.yml exec db \
  pg_dump -U postgres -d postgres -Fc > "backup-$(date +%F).dump"
```

Restore into a fresh stack:

```bash
docker compose --env-file supabase/.env -f supabase/docker-compose.yml up -d db
docker compose --env-file supabase/.env -f supabase/docker-compose.yml exec -T db \
  pg_restore -U postgres -d postgres --clean < backup-YYYY-MM-DD.dump
docker compose --env-file supabase/.env -f supabase/docker-compose.yml up -d auth rest gateway
```

## 5. Reverse proxy (production)

Expose only two HTTPS endpoints: the app and the gateway's public URL.
Database, Auth-direct, and PostgREST-direct ports stay bound to localhost.
Example Caddy configuration on the same host:

```caddy
app.example.com {
    reverse_proxy 127.0.0.1:3000
}

api.example.com {
    reverse_proxy 127.0.0.1:8000
}
```

Set `SUPABASE_PUBLIC_URL=https://api.example.com`,
`API_EXTERNAL_URL=https://api.example.com/auth/v1`, and
`SITE_URL=https://app.example.com` in `supabase/.env`, and add the public
app URL to the app's `ALLOWED_ORIGIN`/`APP_PUBLIC_URL` (see root
`.env.example`). Apply rate limiting at this layer.

## 6. Removing a login (account deletion)

"Delete all my data" in Settings removes every row the user owns. The
Supabase Auth user itself is removed by the operator in Studio
(Authentication → Users → Delete user) or via the Auth admin API with the
service-role key — that key is never placed in app code or the app `.env`.

## 7. Production notes

- Keep all component ports bound to localhost and terminate TLS in a reverse
  proxy. Expose only the app and the gateway's public URL.
- Record the deployed image digests after the first successful deploy and pin
  them in `supabase/.env` via the `*_IMAGE` variables.
- You are responsible for OS patching, Postgres maintenance, backups,
  monitoring, and stack updates.
