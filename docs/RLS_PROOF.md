# RLS proof (run before trusting multi-user data)

Row Level Security is the authorization layer. The checks below prove that
the anon key (public by design) exposes nothing and that two users cannot
see each other's rows. Run them after every migration change.

Prerequisites: the stack from `supabase/README.md` is up, the migration is
applied, and two users (A and B) exist via the app sign-up. Get each user's
access token from the browser devtools (Application → Local Storage →
Supabase auth token) or via `signInWithPassword` against `/auth/v1/token`.

Set these in your shell:

```bash
API=https://api.example.com   # your SUPABASE_PUBLIC_URL
ANON=eyJhbG...                # the anon key (public)
A=eyJhbG...                   # user A access token (role: authenticated)
B=eyJhbG...                   # user B access token
```

## 1. Anonymous access exposes nothing

```bash
for t in profiles user_settings projects conversations messages tasks memories; do
  echo "== $t"; curl -s -o /dev/null -w "%{http_code}\n" \
    -H "apikey: $ANON" "$API/rest/v1/$t?select=*&limit=1";
done
```

Expected: `401` for every table (no policy grants `anon` anything). Any
`200` with rows is a release blocker.

## 2. User B cannot read or touch user A's rows

As A, create one row per table (via the app UI). Then, as B:

```bash
for t in projects conversations messages tasks memories; do
  echo "== $t read"; curl -s \
    -H "apikey: $ANON" -H "Authorization: Bearer $B" \
    "$API/rest/v1/$t?select=*";
done
echo "== profiles read"; curl -s \
  -H "apikey: $ANON" -H "Authorization: Bearer $B" \
  "$API/rest/v1/profiles?select=*"
```

Expected: `[]` everywhere (B sees only B's rows; if B created nothing, all
empty). Then attempt a write to A's project id (`$AID` copied from A's UI
network tab or export):

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X PATCH \
  -H "apikey: $ANON" -H "Authorization: Bearer $B" \
  -H "Content-Type: application/json" \
  -d '{"name":"pwned"}' "$API/rest/v1/projects?id=eq.$AID"
```

Expected: `200` with `[]` (PostgREST reports zero affected rows — the policy
matched nothing) and A's row unchanged. Verify A's row is unchanged with A's
token.

## 3. Authenticated API surface

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/generate \
  -H "Content-Type: application/json" -d '{"prompt":"hi"}'
# expected: 401 (no token)

curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/models
# expected: 401 (no token)
```

## 4. No service_role in browser code

```bash
grep -R "service_role\|SERVICE_ROLE" index.html app.js bootstrap.js auth.js \
  supabaseClient.js data.js workspace.js home.js tasks.js projects.js \
  memory.js models.js settings.js utils.js styles.css
```

Expected: no output. The service-role key lives only in server-side operator
hands (and never in this app's `.env`), per `supabase/README.md`.
