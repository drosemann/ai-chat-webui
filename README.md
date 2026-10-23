AI Chat WebUI – Lokal & Privat

> Blitzschnelles, privacy-fokussiertes Chat-Interface für Ollama – alles läuft lokal, nichts geht in die Cloud.

Ursprung am 14.03.2025 – first commit `bc38708` mit nur 3 Dateien, hieß noch `super-fast-ai-chat`. Nur `README.md`, `index.html`, `index.js`.

### Entstehung

Früher war mein Mindset: "Lieber meinen $5 VPS auf 100% CPU ballern als ein paar Cent an einen Inference Provider zu zahlen". Heute sehe ich es anders: Ich würde das meiste in der Cloud machen und nur für wirklich private Dinge lokale 4B Modelle nutzen – statt teuren VPS dauerhaft zu quälen.

Genau dafür ist dieses Projekt: Kein Framework, pure JS, einfach `index.html` öffnen und lokal chatten.

## Features

- 🚄 **Ultra-schnell** – lokale Antworten ohne Cloud Latenz
- 🔒 **Privacy First** – alle Chats bleiben auf deiner Maschine
- 💻 **Lokale Modelle** – via Ollama
- 🎨 **Modernes UI** – clean, responsive, mit Streaming
- 🔧 **Einfach konfigurierbar** – API URL ändern fertig

## Schnellstart

### 1) Voraussetzungen
- [Ollama](https://ollama.ai) installieren
- Modell pullen:
```bash
ollama pull qwen2.5:0.5b
# oder für private Tasks heute eher:
ollama pull gemma3:4b
```

### 2) Installation
```bash
git clone https://github.com/drosemann/ai-chat-webui
cd ai-chat-webui
```

### 3) Nutzung
- `index.html` im Browser öffnen
- Loschatten

Kein Build, kein npm, kein Docker nötig.

## Warum heute noch relevant?

Früher wollte ich ALLES lokal hosten um ein paar Cent zu sparen. Heute nutze ich das Tool gezielt für:

- **Private Notizen / sensible Daten** – die nie zu OpenAI & Co sollen
- **Offline Arbeit** – im Zug, ohne Internet
- **Low-Latency Tests** – wenn ich schnell Modelle testen will ohne API Keys

Für den Rest: Cloud. Günstiger und schneller.

## Tech Stack

- Pure JavaScript (kein Framework)
- Modernes CSS mit Custom Properties
- Async/Await + Ollama API
- Responsive Design
- Ollama API: `http://localhost:11434/api/generate`

## Workspace-Backend (Phasen 1–6)

Der Chat wird zu einem Workspace mit Benutzerkonten umgebaut. Die dafür
benötigte selbst-gehostete Supabase-Infrastruktur liegt unter
[`supabase/`](supabase/README.md); das Schema und der Phasenstatus stehen in
[`docs/WORKSPACE.md`](docs/WORKSPACE.md).

## Konfiguration

Im Settings Panel:

- Ollama API URL (default `http://localhost:11434/api/generate`)
- Modell wechseln

## Lizenz

GNU GPLv3 – siehe [LICENSE](LICENSE).

## Related

- [Ollama](https://github.com/jmorganca/ollama)
- [LangChain](https://github.com/hwchase17/langchain)
