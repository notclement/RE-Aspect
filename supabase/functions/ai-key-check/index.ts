// RE:Aspect · ai-key-check
// Admin only. Tests one stored AI key (any provider; default = the Claude key in use) with the smallest possible
// call and says in plain words whether it works: ok · out of credit · invalid key · busy. Where the provider has a
// balance API (DeepSeek) the remaining balance is returned too; Anthropic, OpenAI and Google have none for normal
// keys, so the admin page links to their billing pages instead. Claude checks are logged to ai_usage.
// Deploy: Supabase → Edge Functions → ai-key-check (Verify JWT off — it checks the admin itself).
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

	let body: Record<string, unknown> = {};
	try {
		body = await req.json();
	} catch {
		/* empty body = the Claude key in use */
	}
	const id = typeof body.id === 'string' && /^[0-9a-f-]{36}$/i.test(body.id) ? body.id : null;
	const admin = createClient(url, service);
	const { data: rows } = id ? await admin.rpc('ai_key_by_id', { p_id: id }) : await admin.rpc('ai_key_for', { p_provider: 'anthropic' });
	const k = Array.isArray(rows) ? rows[0] : null;
	if (!k?.api_key) return json(req, { status: 'no-key', message: id ? 'That key no longer exists.' : 'No Claude key yet. Add one below — tracing and north detection need it.' });
	try {
		return json(req, { provider: k.provider, ...(await check(k.provider, k.api_key, admin)) });
	} catch (e) {
		return json(req, { provider: k.provider, status: 'error', message: e instanceof Error && e.name === 'TimeoutError' ? 'No answer within 20 s.' : 'Could not reach the provider.' });
	}
});

type Result = { status: 'ok' | 'no-credit' | 'invalid' | 'busy' | 'error' | 'untested'; message: string; balance?: string; ms?: number };
const secs = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
/** Common HTTP error → plain words (each provider adds its own "out of credit" signal). */
function fromStatus(name: string, status: number, text: string, noCredit: boolean): Result {
	if (noCredit) return { status: 'no-credit', message: `Out of credit — top up in ${name}'s billing page.` };
	if (status === 401 || status === 403) return { status: 'invalid', message: `${name} rejected this key (revoked or mistyped). Add a new one.` };
	if (status === 429) return { status: 'busy', message: `${name} says the rate limit is reached — try again in a minute.` };
	if (status >= 500) return { status: 'busy', message: `${name} is busy right now — try again shortly.` };
	return { status: 'error', message: `${name} answered ${status}${text ? ': ' + text.replace(/\s+/g, ' ').slice(0, 120) : ''}.` };
}

// deno-lint-ignore no-explicit-any
async function check(provider: string, key: string, admin: any): Promise<Result> {
	const signal = AbortSignal.timeout(20_000);
	const t0 = Date.now();
	if (provider === 'anthropic') {
		const r = await fetch('https://api.anthropic.com/v1/messages', {
			method: 'POST',
			signal,
			headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
			body: JSON.stringify({ model: MODEL, max_tokens: 8, messages: [{ role: 'user', content: 'Reply with the word OK.' }] })
		});
		const ms = Date.now() - t0;
		const text = await r.text();
		if (r.ok) {
			const usage = JSON.parse(text).usage ?? {};
			const usd = ((usage.input_tokens ?? 0) * PRICE[0] + (usage.output_tokens ?? 0) * PRICE[1]) / 1e6;
			await admin.from('ai_usage').insert({ fn: 'key-check', model: MODEL, in_tok: usage.input_tokens ?? 0, out_tok: usage.output_tokens ?? 0, usd, ms });
			return { status: 'ok', message: `Working — Claude answered in ${secs(ms)}.`, ms };
		}
		return fromStatus('Claude', r.status, text, text.toLowerCase().includes('credit balance'));
	}
	if (provider === 'deepseek') {
		// DeepSeek has a real balance API — no model call needed.
		const r = await fetch('https://api.deepseek.com/user/balance', { signal, headers: { Authorization: `Bearer ${key}` } });
		const ms = Date.now() - t0;
		const text = await r.text();
		if (!r.ok) return fromStatus('DeepSeek', r.status, text, r.status === 402);
		const d = JSON.parse(text);
		const balance = (d.balance_infos ?? []).map((b: { currency: string; total_balance: string }) => `${b.currency} ${b.total_balance}`).join(' · ') || undefined;
		return d.is_available ? { status: 'ok', message: `Working — DeepSeek answered in ${secs(ms)}.`, balance, ms } : { status: 'no-credit', message: "Out of credit — top up in DeepSeek's billing page.", balance };
	}
	if (provider === 'openai') {
		const r = await fetch('https://api.openai.com/v1/chat/completions', {
			method: 'POST',
			signal,
			headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
			body: JSON.stringify({ model: Deno.env.get('OPENAI_PING_MODEL') ?? 'gpt-4.1-mini', max_completion_tokens: 8, messages: [{ role: 'user', content: 'Reply with the word OK.' }] })
		});
		const ms = Date.now() - t0;
		const text = await r.text();
		if (r.ok) return { status: 'ok', message: `Working — OpenAI answered in ${secs(ms)}.`, ms };
		const low = text.toLowerCase();
		return fromStatus('OpenAI', r.status, text, low.includes('insufficient_quota') || low.includes('no credits'));
	}
	if (provider === 'google') {
		const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1', { signal, headers: { 'x-goog-api-key': key } });
		const ms = Date.now() - t0;
		const text = await r.text();
		if (r.ok) return { status: 'ok', message: `Working — Gemini answered in ${secs(ms)}.`, ms };
		return fromStatus('Gemini', r.status === 400 && text.includes('API_KEY_INVALID') ? 401 : r.status, text, text.includes('RESOURCE_EXHAUSTED') && text.toLowerCase().includes('billing'));
	}
	return { status: 'untested', message: "This provider can't be tested from here." };
}
