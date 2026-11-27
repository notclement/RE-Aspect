// RE:Aspect · detect-north
// Looks at the floor plan and the other photos (site plan, location map, brochure pages) for clues to true north —
// north arrows, compass roses, a site plan that shows the same unit — and suggests how far to turn the floor plan.
// Photos arrive in the request body only and are never stored. Limited per user per day (ai_daily_take).
import { createClient } from 'jsr:@supabase/supabase-js@2';

const ALLOWED_ORIGINS = [
	'https://re-aspect.clement-392.workers.dev',
	'https://re-aspect-dev.clement-392.workers.dev',
	'http://localhost:5173',
	'http://localhost:4173'
];
const MODELS = {
	openai: Deno.env.get('OPENAI_MODEL') ?? 'gpt-4.1',
	anthropic: Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-sonnet-5-5',
	google: Deno.env.get('GOOGLE_MODEL') ?? 'gemini-2.5-flash',
	deepseek: Deno.env.get('DEEPSEEK_MODEL') ?? 'deepseek-flash'
};
const DAILY_LIMIT = 30;
const IMG = /^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+/=]+$/;

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

const PROMPT = (n: number) => `Image 1 is an apartment floor plan as the user photographed it.${n ? ` Images 2–${n + 1} are other photos the user provided (they may include a site plan, block plan, location map or brochure pages).` : ''}
Find clues to TRUE NORTH: a north arrow or compass rose (on the floor plan or any other image), or a site/block plan with a north arrow on which you can recognise this unit's shape or block, then work out the unit's orientation.
Answer: by how many degrees must IMAGE 1 be rotated CLOCKWISE so that true north points straight up?
Return ONLY JSON, no prose:
{"found": true|false, "rotate_cw_deg": <0-359>, "confidence": "high"|"medium"|"low", "evidence": "<one short sentence saying what you used, e.g. 'North arrow on the site plan; unit 125 faces the bottom of block 88B'>"}
If there is no reliable clue, return {"found": false, "rotate_cw_deg": 0, "confidence": "low", "evidence": "<what was missing>"}.`;

function parseJson(text: string): Record<string, unknown> {
	const s = text.indexOf('{');
	const e = text.lastIndexOf('}');
	if (s < 0 || e < s) throw new Error('AI returned no JSON');
	return JSON.parse(text.slice(s, e + 1));
}

async function callAI(provider: string, key: string, prompt: string, images: string[]): Promise<Record<string, unknown>> {
	const signal = AbortSignal.timeout(60_000);
	if (provider === 'openai' || provider === 'deepseek') {
		const ds = provider === 'deepseek';
		const r = await fetch(ds ? 'https://api.deepseek.com/chat/completions' : 'https://api.openai.com/v1/chat/completions', {
			method: 'POST',
			signal,
			headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: ds ? MODELS.deepseek : MODELS.openai,
				response_format: { type: 'json_object' },
				messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, ...images.map((url) => ({ type: 'image_url', image_url: { url, detail: 'high' } }))] }]
			})
		});
		if (!r.ok) throw new Error(`${ds ? 'DeepSeek' : 'OpenAI'} ${r.status}`);
		const d = await r.json();
		return parseJson(d.choices?.[0]?.message?.content ?? '');
	}
	if (provider === 'anthropic') {
		const r = await fetch('https://api.anthropic.com/v1/messages', {
			method: 'POST',
			signal,
			headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: MODELS.anthropic,
				max_tokens: 600,
				messages: [{
					role: 'user',
					content: [
						...images.map((url) => {
							const [head, data] = url.split(',');
							return { type: 'image', source: { type: 'base64', media_type: head.slice(5, head.indexOf(';')), data } };
						}),
						{ type: 'text', text: prompt }
					]
				}]
			})
		});
		if (!r.ok) throw new Error(`Anthropic ${r.status}`);
		const d = await r.json();
		return parseJson((d.content ?? []).map((c: { text?: string }) => c.text ?? '').join(''));
	}
	if (provider === 'google') {
		const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODELS.google}:generateContent`, {
			method: 'POST',
			signal,
			headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
			body: JSON.stringify({
				contents: [{
					parts: [
						{ text: prompt },
						...images.map((url) => {
							const [head, data] = url.split(',');
							return { inline_data: { mime_type: head.slice(5, head.indexOf(';')), data } };
						})
					]
				}],
				generationConfig: { responseMimeType: 'application/json' }
			})
		});
		if (!r.ok) throw new Error(`Gemini ${r.status}`);
		const d = await r.json();
		return parseJson(d.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? '');
	}
	throw new Error('Unsupported AI provider');
}

Deno.serve(async (req) => {
	if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
	if (req.method !== 'POST') return json(req, { error: 'POST only' }, 405);

	const url = Deno.env.get('SUPABASE_URL')!;
	const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? firstKey('SUPABASE_PUBLISHABLE_KEYS');
	const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? firstKey('SUPABASE_SECRET_KEYS');
	if (!anon || !service) return json(req, { error: 'Server is not configured.' }, 500);

	const userClient = createClient(url, anon, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
	const { data: u } = await userClient.auth.getUser();
	if (!u.user) return json(req, { error: 'Please sign in again.' }, 401);

	let body: Record<string, unknown>;
	try {
		body = await req.json();
	} catch {
		return json(req, { error: 'Bad request' }, 400);
	}
	const plan = typeof body.floorPlan === 'string' && body.floorPlan.length < 4_000_000 && IMG.test(body.floorPlan) ? body.floorPlan : null;
	const others = (Array.isArray(body.others) ? body.others : [])
		.slice(0, 6)
		.filter((x): x is string => typeof x === 'string' && x.length < 2_000_000 && IMG.test(x));
	if (!plan) return json(req, { error: 'Bad request' }, 400);

	const admin = createClient(url, service);
	const { error: le } = await admin.rpc('ai_daily_take', { p_user: u.user.id, p_fn: 'north', p_limit: DAILY_LIMIT });
	if (le) return json(req, { error: le.message }, le.message.includes('limit') ? 429 : 403);

	const { data: keyRows } = await admin.rpc('active_ai_key');
	const k = Array.isArray(keyRows) ? keyRows[0] : null;
	if (!k?.api_key) return json(req, { found: false, reason: 'no-key' });

	try {
		const ai = await callAI(k.provider, k.api_key, PROMPT(others.length), [plan, ...others]);
		const found = ai.found === true;
		let deg = Number(ai.rotate_cw_deg);
		deg = Number.isFinite(deg) ? ((Math.round(deg * 2) / 2) % 360 + 360) % 360 : 0;
		const confidence = ['high', 'medium', 'low'].includes(String(ai.confidence)) ? String(ai.confidence) : 'low';
		const evidence = typeof ai.evidence === 'string' ? ai.evidence.replace(/[<>{}\\\u0000-\u001f]/g, '').trim().slice(0, 160) : '';
		return json(req, { found, angle: found ? deg : 0, confidence, evidence });
	} catch (e) {
		console.error('[detect-north]', e instanceof Error ? e.message : e);
		return json(req, { found: false, reason: 'error' });
	}
});
