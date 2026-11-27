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
| | Branch | URL | Supabase project |
|---|---|---|---|
| **Test** | any branch except `main` (e.g. `dev`) | `https://<branch>.re-aspect.pages.dev` | `re-aspect-test` |
| **Live** | `main` | `https://re-aspect.pages.dev` | `re-aspect-live` |

Cloudflare Pages builds every push. Set the variables below separately for **Production** and **Preview** in
Cloudflare → *Workers & Pages → re-aspect → Settings → Variables and Secrets*:

| Variable | Test (Preview) | Live (Production) |
|---|---|---|
| `SUPABASE_URL` | test project URL | live project URL |
| `SUPABASE_PUBLISHABLE_KEY` | test publishable key | live publishable key |
| `APP_ENV` | `test` | `live` |
| `NODE_VERSION` | `22.17.0` | `22.17.0` |

Cloudflare build settings: **Framework** SvelteKit · **Build command** `npm run build` · **Output** `build`.

⚠️ Never put the Supabase **secret / service_role** key or any AI key in these variables. They go in Supabase → Edge Functions → Secrets.

## Workflow
1. Work on the `dev` branch → push → test at the preview URL.
2. When it's good, merge `dev` → `main` → it goes live.

## Credits
Built by [Clement](https://www.linkedin.com/in/clementsg).
