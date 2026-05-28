Cloudflare Workers: Supabase proxy for leaderboard

Overview
- This Worker proxies two endpoints for the client to use without exposing Supabase `service_role`:
  - `GET /get-leaderboard?date=YYYY-MM-DD` -> returns JSON array of rows
  - `POST /submit-score` with JSON { name, score, date } -> inserts row

Bindings / Secrets (set these in Cloudflare dashboard or via Wrangler):
- `SUPABASE_URL` - your Supabase project URL (e.g. https://xxxxx.supabase.co)
- `SUPABASE_SERVICE_ROLE` - your Supabase service_role key (keep secret)

Quick deploy with Wrangler (CLI):
1. Install Wrangler: https://developers.cloudflare.com/workers/get-started/guide/

```bash
npm install -g wrangler
wrangler login
wrangler init luck-leaderboard
# Replace the generated worker script with cloudflare/worker.js contents
# or copy this file into the project as index.js
```

2. Add secrets:

```bash
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_SERVICE_ROLE
```

3. Deploy:

```bash
wrangler publish
```

Notes and security
- Cloudflare Workers free tier provides generous usage for small projects.
- The in-worker code is minimal; for production you may want to add:
  - Robust rate-limiting (use Cloudflare KV or Durable Objects)
  - Input sanitization and optional CAPTCHA for anti-abuse
  - Logging/monitoring via Workers-compatible services

Client configuration
- In your `config.js` (served to client), set:
  - `apiBase: 'https://<your-worker-subdomain>.workers.dev'`
- The client will use `${apiBase}/submit-score` and `${apiBase}/get-leaderboard` when present.
