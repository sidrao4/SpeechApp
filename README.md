# Verbatim Speech Helper

A teleprompter that follows *you* — it advances through your script by listening to what you actually say, at your own pace, instead of scrolling at a fixed speed. Paste a script or have one generated for you, read it aloud, and get your words-per-minute and completion stats when you're done.

https://frontend-production-78ab8.up.railway.app

## Features

- **Speech-driven scrolling** — tracks your voice via the browser's Web Speech API and a custom LCS-based alignment algorithm, so it tolerates skipped or misheard words without losing your place, and pauses (rather than guessing forward) if you go off-script.
- **Paste a script, or generate one** — enter a topic and length (short/medium/long) and it's written for you via Google's Gemini API.
- **Optional accounts** — a username, no password, logs in or creates an account on the spot. Logged-in users get a saved script history and per-session practice stats
- **Camera preview** — see yourself while you read, and save the recording to your device afterward. (In-browser playback of the recording is currently broken — see Known issues.)

## Tech stack

- **Frontend:** React, TypeScript, Vite, Tailwind CSS
- **Backend:** FastAPI (Python), SQLite
- **Deployment:** Railway (frontend and backend as two independent services)

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

Speech recognition and script generation both require the app to be talking to a running backend, but pasting and reading a script works with no backend at all.

## Deployment notes

- Both services deploy independently via `railway up` from their respective directories.
- The backend needs a Railway **volume** mounted (e.g. at `/data`, with `DATABASE_PATH` pointed at it) — without one, the SQLite database is wiped on every redeploy.
- The frontend needs `VITE_API_URL` set to the backend's public URL. Vite inlines this at **build time**, so it's committed in `frontend/.env.production` rather than set as a Railway variable (Railway's remote build cache doesn't reliably pick up env-var-only changes on unrelated redeploys).

## Known issues

- **Camera recording plays back black in-browser.** The recording itself contains real audio/video data (correct file size, plays back once downloaded and opened in an external player) — it's specifically the in-app `<video>` preview that fails to render it. 
- **Web Speech API support is Chrome/Edge-only** — Firefox and Safari don't support the speech recognition this app relies on.
