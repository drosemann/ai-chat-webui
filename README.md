AI Chat WebUI – Lokal & Privat

> Privacy-fokussiertes Chat-Interface für Ollama mit Workspace: Projekte,
> Tasks, Memory und mehrere Chats – mit Benutzerkonten auf selbst-gehostetem
> Supabase. Kein Framework, pure JS.

Ursprung am 14.03.2025 – first commit `bc38708` mit nur 3 Dateien, hieß noch `super-fast-ai-chat`. Nur `README.md`, `index.html`, `index.js`.

### Entstehung

Früher war mein Mindset: "Lieber meinen $5 VPS auf 100% CPU ballen als ein paar Cent an einen Inference Provider zu zahlen". Heute sehe ich es anders: Ich würde das meiste in der Cloud machen und nur für wirklich private Dinge lokale 4B Modelle nutzen – statt teuren VPS dauerhaft zu quälen.

Genau dafür ist dieses Projekt: Kein Framework, pure JS, lokal chatten – inzwischen als Workspace mit Konten, damit Chats, Projekte und Tasks geräteübergreifend erhalten bleiben.

## Features

- 🚄 **Ultra-schnell** – lokale Antworten ohne Cloud Latenz
- 🔒 **Privacy First** – Backend und Auth laufen auf deiner Infrastruktur
- 💻 **Lokale Modelle** – via Ollama, Modell frei wählbar
- 🗂️ **Workspace** – Home-Dashboard, Projekte, Tasks, Memory, mehrere Chats
- 👤 **Benutzerkonten** – Registrierung, Login, Passwort-Reset via selbst-gehostetem Supabase Auth
- 🎨 **Modernes UI** – clean, responsive, mit Streaming-fähiger Architektur
- 🔧 **Einfach konfigurierbar** – via `.env`, kein Build nötig

## Schnellstart

### 1) Voraussetzungen
- [Ollama](https://ollama.ai) installieren
- Modell pullen:
```bash
ollama pull qwen2.5:0.5b
# oder für private Tasks heute eher:
ollama pull gemma3:4b
```
- [Docker + Docker Compose](https://docs.docker.com/compose/install/) für das Supabase-Backend
- Einen SMTP-Zugang für Bestätigungs- und Reset-Mails (oder `GOTRUE_MAILER_AUTOCONFIRM=true` nur für lokale Entwicklung)

### 2) Backend starten
```bash
cp supabase/.env.example supabase/.env
# Secrets in supabase/.env ersetzen!
docker compose --env-file supabase/.env -f supabase/docker-compose.yml up -d db auth rest gateway
docker compose --env-file supabase/.env -f supabase/docker-compose.yml exec db \
  psql -U postgres -d postgres -f /migrations/0001_workspace.sql
```

Details, Backup/Restore und Produktion (Reverse Proxy, TLS): siehe [`supabase/README.md`](supabase/README.md).

### 3) App starten
```bash
cp .env.example .env
# SUPABASE_URL, SUPABASE_ANON_KEY und SUPABASE_JWT_SECRET eintragen
npm install
npm start
```

Browser öffnen: `http://localhost:3000` – Konto erstellen, loschatten.

> Hinweis: `index.html` direkt zu öffnen funktioniert nicht mehr für den Chat,
> da die App Session-Tokens an `/api/generate` sendet. `npm start` ist der
> einzige unterstützte Startweg.

## Warum heute noch relevant?

Früher wollte ich ALLES lokal hosten um ein paar Cent zu sparen. Heute nutze ich das Tool gezielt für:

- **Private Notizen / sensible Daten** – die nie zu OpenAI & Co sollen
- **Offline Arbeit** – im Zug, ohne Internet
- **Low-Latency Tests** – wenn ich schnell Modelle testen will ohne API Keys

Für den Rest: Cloud. Günstiger und schneller.

## Tech Stack

- Pure JavaScript (kein Framework, kein Build)
- Modernes CSS mit Custom Properties
- Async/Await + Ollama API
- Responsive Design mit Hash-Routing
- Backend: Express (statisch + Ollama-Proxy mit JWT-Prüfung)
- Daten & Auth: selbst-gehostetes Supabase (Postgres + GoTrue + PostgREST + Caddy-Gateway), Row Level Security pro Benutzer
- Ollama API: `http://localhost:11434/api/generate`

## Workspace-Status

Alle 8 Phasen sind umgesetzt: [`docs/WORKSPACE.md`](docs/WORKSPACE.md) beschreibt, was jede Phase geliefert hat. Sicherheits-Checks für Betreiber (u. a. Zwei-Benutzer-RLS-Nachweis): [`docs/RLS_PROOF.md`](docs/RLS_PROOF.md).

Bewusst nicht enthalten: Cloud-Auth (Clerk/WorkOS), eigenes Passwort-Hashing, Prompt-Policing (dein Modell, deine Entscheidung), Kalender-/Mail-Integrationen.

## Konfiguration

App (`.env`):

- `PORT`, `OLLAMA_API_URL`, `OLLAMA_MODEL` (Fallback-Modell)
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_JWT_SECRET` (identisch zu `JWT_SECRET` im Stack)
- `ALLOWED_ORIGIN`, optional `SITE_URL`/`APP_PUBLIC_URL`, `NODE_ENV`

Im UI (Settings): Anzeigename, Theme, Standard-Modell, Datenexport, Demo-Daten bereinigen, alle eigenen Daten löschen.

## Lizenz

GNU GPLv3 – siehe [LICENSE](LICENSE).

## Related

- [Ollama](https://github.com/jmorganca/ollama)
- [LangChain](https://github.com/hwchase17/langchain)
