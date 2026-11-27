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
| | Branch | Supabase project |
|---|---|---|
| **Test** | any branch except `main` (e.g. `dev`) | `re-aspect-test` |
| **Live** | `main` | `re-aspect-live` |

Hosted on **Cloudflare Workers (static assets)** — see `wrangler.jsonc`. Every push builds; non-`main` branches get a preview URL.
The Supabase URL + *publishable* keys are in `vite.config.ts` (they're public by design; data is protected by Row Level Security).
The build picks test vs live from the branch name (`WORKERS_CI_BRANCH`).

Database changes live in `supabase/migrations/` — run each new file in **Supabase → SQL Editor** on test first, then live.

⚠️ Never put the Supabase **secret / service_role** key or any AI key in the repo or build variables — they go in Supabase → Edge Functions → Secrets.

## Workflow
1. Work on the `dev` branch → push → test at the preview URL.
2. When it's good, merge `dev` → `main` → it goes live.

## Credits
Built by [Clement](https://www.linkedin.com/in/clementsg).
