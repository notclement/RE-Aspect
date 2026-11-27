// RE:Aspect · geocode — Singapore address / postal code → coordinates, for signed-in users.
// Uses OneMap (SLA) when ONEMAP_EMAIL + ONEMAP_PASSWORD secrets are set (token refreshed here, never in the browser);
// Without OneMap secrets it answers {fallback:true} and the app searches OpenStreetMap from the user's browser
// (Nominatim blocks requests from cloud servers).
import { createClient } from 'jsr:@supabase/supabase-js@2';

const ALLOWED_ORIGINS = [
	'https://re-aspect.clement-392.workers.dev',
	'https://re-aspect-dev.clement-392.workers.dev',
	'http://localhost:5173',
	'http://localhost:4173'
];
function cors(req: Request) {
	const o = req.headers.get('origin') ?? '';
	return {
		'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(o) ? o : ALLOWED_ORIGINS[0],
		'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
		'Access-Control-Allow-Methods': 'POST, OPTIONS',
		Vary: 'Origin'
	};
}
const json = (req: Request, body: unknown, status = 200) =>
	new Response(JSON.stringify(body), { status, headers: { ...cors(req), 'Content-Type': 'application/json' } });

function firstKey(name: string): string {
	try {
		return (Object.values(JSON.parse(Deno.env.get(name) ?? '{}'))[0] as string) ?? '';
	} catch {
		return '';
	}
}

interface Place {
	label: string;
	postal: string;
	lat: number;
	lon: number;
}
const inSG = (p: Place) => p.label && p.lat > 1.1 && p.lat < 1.5 && p.lon > 103.5 && p.lon < 104.1;

// OneMap token cache (lives as long as this function instance).
let token: { value: string; exp: number } | null = null;
async function oneMapToken(): Promise<string | null> {
	const email = Deno.env.get('ONEMAP_EMAIL');
	const password = Deno.env.get('ONEMAP_PASSWORD');
	if (!email || !password) return null;
	if (token && token.exp > Date.now() + 60_000) return token.value;
	const r = await fetch('https://www.onemap.gov.sg/api/auth/post/getToken', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ email, password }),
		signal: AbortSignal.timeout(8000)
	});
	if (!r.ok) {
		console.error('[geocode] OneMap token failed', r.status);
		return null;
	}
	const d = await r.json();
	const exp = Number(d.expiry_timestamp) * 1000 || Date.now() + 2 * 3600_000;
	token = { value: d.access_token, exp };
	return token.value;
}

async function oneMap(q: string, t: string): Promise<Place[]> {
	const u = `https://www.onemap.gov.sg/api/common/elastic/search?searchVal=${encodeURIComponent(q)}&returnGeom=Y&getAddrDetails=Y&pageNum=1`;
	const r = await fetch(u, { headers: { Authorization: t }, signal: AbortSignal.timeout(8000) });
	if (!r.ok) throw new Error(`OneMap ${r.status}`);
	const d = await r.json();
	return (d.results ?? []).slice(0, 6).map((x: Record<string, string>) => ({
		label: (x.ADDRESS ?? '').replace(/\s+/g, ' ').trim(),
		postal: x.POSTAL && x.POSTAL !== 'NIL' ? x.POSTAL : '',
		lat: Number(x.LATITUDE),
		lon: Number(x.LONGITUDE)
	}));
}

Deno.serve(async (req) => {
	if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
	if (req.method !== 'POST') return json(req, { error: 'POST only' }, 405);

	const url = Deno.env.get('SUPABASE_URL')!;
	const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? firstKey('SUPABASE_PUBLISHABLE_KEYS');
	const sb = createClient(url, anon, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
	const { data: u } = await sb.auth.getUser();
	if (!u.user) return json(req, { error: 'Please sign in again.' }, 401);

	let q = '';
	try {
		const b = await req.json();
		q = typeof b.q === 'string' ? b.q.replace(/[<>{}\\\u0000-\u001f]/g, '').trim().slice(0, 80) : '';
	} catch {
		/* fallthrough */
	}
	if (q.length < 3) return json(req, { results: [] });

	try {
		const t = await oneMapToken();
		if (!t) return json(req, { results: [], fallback: true });
		const results = (await oneMap(q, t)).filter(inSG);
		return json(req, { results, source: 'onemap' });
	} catch (e) {
		console.error('[geocode]', e instanceof Error ? e.message : e);
		return json(req, { error: 'Address search is unavailable right now.' }, 502);
	}
});
