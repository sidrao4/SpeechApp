Why React : this teleprompter app is a UI-State problem, where everything needs to rerender when any piece changes. Also if i add speech-to-text later, React has many compatible libraries

Why Vite: great feedback-loop behavior for an application like a teleprompter

Why TypeScript: Once the app has many pieces of state passed between components, there can be some type mismatching that TS catches in compile time rather than runtime.

Why Render + Vercel (moved from Railway): Railway's trial ran out and I didn't want to pay for a portfolio project. Vercel is built for static/Vite frontends, and Render runs the FastAPI backend as a real long-running server on a free tier.
Tradeoff: Render's free tier sleeps when idle, so the first request after a while has a cold start.

Why Postgres (Neon) instead of SQLite: Render's free tier has no persistent disk, so a SQLite file would be wiped on every restart. Moving to a hosted Postgres also separates the data from the app server, which is closer to how it'd be done at scale.

How did you choose your stack? I chose options that optimized fast iteration on a state heavy, time sensitive UI, and for a smaller-scale project.