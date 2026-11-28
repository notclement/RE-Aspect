// RE:Aspect · ai-key-check
// Admin only. Sends Claude a one-word test with the stored Claude key (costs a tiny fraction of a cent) and says
// in plain words whether it works: ok · out of credit · invalid key · busy. Anthropic has no API that returns the
// remaining balance for individual organisations, so the admin page shows our own spend log next to this and
// links to the Console's billing page for the balance itself.
// Deploy: Supabase → Edge Functions → ai-key-check (Verify JWT on).
import { createClient } from 'jsr:@supabase/supabase-js@2';

const ALLOWED_ORIGINS = [
	'https://re-aspect.clement-392.workers.dev',
	'https://re-aspect-dev.clement-392.workers.dev',
	'http://localhost:5173',
	'http://localhost:4173'
];
const MODEL = 'claude-haiku-5-5';
const PRICE = [0.1, 0.5]; // US$ per million input / output tokens

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
		const v = JSON.parse(Deno.env.get(name) ?? '{}');
		return (Object.values(v)[0] as string) ?? '';
	} catch {
		return '';
	}
}

Deno.serve(async (req) => {
	if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
	if (req.method !== 'POST') return json(req, { error: 'POST only' }, 405);
	const url = Deno.env.get('SUPABASE_URL')!;
	const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? firstKey('SUPABASE_PUBLISHABLE_KEYS');
	const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? firstKey('SUPABASE_SECRET_KEYS');
	if (!anon || !service) return json(req, { error: 'Server is not configured.' }, 500);

	const userClient = createClient(url, anon, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
	const { data: u, error: ue } = await userClient.auth.getUser();
	if (ue || !u.user) return json(req, { error: 'Please sign in again.' }, 401);
	const { data: isAdmin } = await userClient.rpc('is_admin');
	if (isAdmin !== true) return json(req, { error: 'Admins only.' }, 403);

	const admin = createClient(url, service);
	const { data: rows } = await admin.rpc('ai_key_for', { p_provider: 'anthropic' });
	const k = Array.isArray(rows) ? rows[0] : null;
	if (!k?.api_key) return json(req, { status: 'no-key', message: 'No Claude key yet. Add one below — tracing and north detection need it.' });

	const t0 = Date.now();
	try {
		const r = await fetch('https://api.anthropic.com/v1/messages', {
			method: 'POST',
			signal: AbortSignal.timeout(20_000),
			headers: { 'x-api-key': k.api_key, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
			body: JSON.stringify({ model: MODEL, max_tokens: 8, messages: [{ role: 'user', content: 'Reply with the word OK.' }] })
		});
		const ms = Date.now() - t0;
		const text = await r.text();
		if (r.ok) {
			const usage = JSON.parse(text).usage ?? {};
			const usd = ((usage.input_tokens ?? 0) * PRICE[0] + (usage.output_tokens ?? 0) * PRICE[1]) / 1e6;
			await admin.from('ai_usage').insert({ fn: 'key-check', model: MODEL, in_tok: usage.input_tokens ?? 0, out_tok: usage.output_tokens ?? 0, usd, ms });
			return json(req, { status: 'ok', message: `Working — Claude answered in ${(ms / 1000).toFixed(1)} s.`, ms });
		}
		const lower = text.toLowerCase();
		if (lower.includes('credit balance')) return json(req, { status: 'no-credit', message: 'Out of credit — top up in the Claude Console (Settings → Billing → Buy credits).' });
		if (r.status === 401 || r.status === 403) return json(req, { status: 'invalid', message: "Claude rejected this key (revoked or mistyped). Add a new one." });
		if (r.status === 429) return json(req, { status: 'busy', message: 'Claude says the rate limit is reached — try again in a minute.' });
		if (r.status === 529 || r.status >= 500) return json(req, { status: 'busy', message: 'Claude is busy right now — try again shortly.' });
		return json(req, { status: 'error', message: `Claude answered ${r.status}.` });
	} catch (e) {
		return json(req, { status: 'error', message: e instanceof Error && e.name === 'TimeoutError' ? 'Claude did not answer within 20 s.' : 'Could not reach Claude.' });
	}
});
