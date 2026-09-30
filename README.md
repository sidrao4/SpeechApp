# Verbatim Speech Helper

A teleprompter that follows *you* — it advances through your script by listening to what you actually say, at your own pace, instead of scrolling at a fixed speed. Paste a script or have one generated for you, read it aloud, and get your words-per-minute and completion stats when you're done.

<!-- live URL: add your Vercel URL here -->

## Features

- **Speech-driven scrolling** — tracks your voice via the browser's Web Speech API and a custom LCS-based alignment algorithm, so it tolerates skipped or misheard words without losing your place, and pauses (rather than guessing forward) if you go off-script.
- **Paste a script, or generate one** — enter a topic and length (short/medium/long) and it's written for you via Google's Gemini API.
- **Optional accounts** — a username, no password, logs in or creates an account on the spot. Logged-in users get a saved script history and per-session practice stats
- **Camera preview** — see yourself while you read, and save the recording to your device afterward. (In-browser playback of the recording is currently broken — see Known issues.)

## Tech stack

- **Frontend:** React, TypeScript, Vite, Tailwind CSS
- **Backend:** FastAPI (Python), PostgreSQL (Neon)
- **Deployment:** Vercel (frontend), Render (backend)

## Project structure

```
frontend/   React app — teleprompter UI, speech matching, camera capture
backend/    FastAPI app — accounts, script history, session stats, AI script generation
```

## Running locally

### Backend

```
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=verbatim postgres:16
cp .env.example .env   # fill in GEMINI_API_KEY if you want script generation to work
uvicorn app.main:app --reload --port 8000
```

Everything except AI script generation works without a `GEMINI_API_KEY`

### Frontend

```
cd frontend
npm install
echo "VITE_API_URL=http://localhost:8000" > .env.local
npm run dev
```

Speech recognition runs entirely in the browser. Only accounts, history, and script generation need the backend.

## Deployment notes

- **Backend → Render** (free web service), configured by `render.yaml`. Env vars: `DATABASE_URL` (Neon), `ALLOWED_ORIGINS` (the Vercel URL), `GEMINI_API_KEY`.
- **Database → Neon** (free Postgres). Render's free tier has no persistent disk, so the database lives outside it.
- **Frontend → Vercel**, root directory `frontend`. Set `VITE_API_URL` to the Render URL in Vercel's project settings (it's inlined at build time, so redeploy after changing it).
- Render's free tier sleeps after ~15 min idle, so the first request after that takes ~30–60s.

## Known issues

- **Camera recording plays back black in-browser.** The recording itself contains real audio/video data (correct file size, plays back once downloaded and opened in an external player) — it's specifically the in-app `<video>` preview that fails to render it. 
- **Web Speech API support is Chrome/Edge-only** — Firefox and Safari don't support the speech recognition this app relies on.
