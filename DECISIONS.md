Why React : this teleprompter app is a UI-State problem, where everything needs to rerender when any piece changes. Also if i add speech-to-text later, React has many compatible libraries

Why Vite: great feedback-loop behavior for an application like a teleprompter

Why TypeScript: Once the app has many pieces of state passed between components, there can be some type mismatching that TS catches in compile time rather than runtime.

Why Render + Vercel (moved from Railway): Railway's trial ran out and I didn't want to pay for a portfolio project. Vercel is built for static/Vite frontends, and Render runs the FastAPI backend as a real long-running server on a free tier.
Tradeoff: Render's free tier sleeps when idle, so the first request after a while has a cold start.

Why Postgres (Neon) instead of SQLite: Render's free tier has no persistent disk, so a SQLite file would be wiped on every restart. Moving to a hosted Postgres also separates the data from the app server, which is closer to how it'd be done at scale.

Why cookie-based JWT auth instead of localStorage tokens: tokens in localStorage can be read by any script on the page, so one XSS bug leaks them. httpOnly cookies can't be read by JavaScript at all. SameSite=Lax plus a same-origin setup (Vercel proxies /api to Render) covers CSRF without a separate CSRF token.
Tradeoff: the proxy adds a hop, and the frontend and backend are now coupled through vercel.json.

Why short access tokens + rotating refresh tokens: a JWT can't be revoked once issued, so access tokens only live 15 minutes. Refresh tokens are opaque random strings stored hashed in Postgres, so they can be revoked (logout), and each one is single-use. If a used refresh token shows up again, that's a stolen copy being replayed, so the whole token family gets revoked.
Tradeoff: two tabs refreshing at the exact same moment can trip reuse detection and log the user out. The frontend funnels refreshes through one in-flight promise to make that rare.

Why Google accounts are matched on Google's `sub` and never linked by email: auto-linking by email would let anyone who controls an email at Google take over a password account that registered with it.

How did you choose your stack? I chose options that optimized fast iteration on a state heavy, time sensitive UI, and for a smaller-scale project.