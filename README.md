# RE:Aspect

See how sunlight moves through a home, room by room — featuring **DayTrace**.
For real-estate agents and interior designers. Singapore first.

> Requirements: [`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md) · Notes for AI assistants: [`CLAUDE.md`](CLAUDE.md)

## Run it locally
```bash
npm install
cp .env.example .env    # optional — leave empty for preview mode
npm run dev             # http://localhost:5173
```
Without Supabase values the app runs in **preview mode**: there's no sign-in and data stays in your browser.

## Environments
| | Branch | URL | Cloudflare app | Supabase project |
|---|---|---|---|---|
| **Test** | `dev` | https://re-aspect-dev.clement-392.workers.dev | `re-aspect-dev` (deploy: `npx wrangler deploy --name re-aspect-dev`) | `re-aspect-test` |
| **Live** | `main` | https://re-aspect.clement-392.workers.dev | `re-aspect` (deploy: `npx wrangler deploy`) | `re-aspect-live` |

Both are Cloudflare Workers serving static assets (`wrangler.jsonc`). Keep `"name": "re-aspect"` in `wrangler.jsonc` —
the test app overrides it with `--name`; don't merge Cloudflare's auto-PR that renames it.
The Supabase URL + *publishable* keys are in `vite.config.ts` (public by design; data is protected by Row Level Security).
The build picks test vs live from the branch (`WORKERS_CI_BRANCH`: `main` = live, anything else = test).

Database changes live in `supabase/migrations/` — run each new file in **Supabase → SQL Editor** on test first, then live.

⚠️ Never put the Supabase **secret / service_role** key or any AI key in the repo or build variables — they go in Supabase → Edge Functions → Secrets.

## Workflow
1. Work on the `dev` branch → push → test at the preview URL.
2. When it's good, merge `dev` → `main` → it goes live.

## Credits
Built by [Clement](https://www.linkedin.com/in/clementsg).
