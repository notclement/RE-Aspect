// RE:Aspect · detect-north
// Infers true north from ALL the photos together (north arrows, the unit's position on a site plan, streets on a
// location map vs the address, views out of the windows) plus the project details, and suggests how far to turn
// the floor plan. Gives a best estimate with a confidence level even without an explicit arrow.
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
	google: Deno.env.get('GOOGLE_MODEL') ?? 'gemini-3.5-flash', // 2.5 Flash was retired in June 2026
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

const PROMPT = (n: number, ctx: string) => `You help orient an apartment floor plan so TRUE NORTH points up, for a sunlight simulator.
Image 1 is the floor plan as photographed.${n ? ` Images 2–${n + 1} are ALL the other photos the user provided — any mix of site plans, block plans, location maps, brochure pages, interior photos and views out of the windows.` : ''}
${ctx ? `Known details: ${ctx}.` : ''}
Look at EVERY image together and combine all the clues before answering:
- north arrows / compass roses on the floor plan, site plan, block plan or location map;
- where this unit sits in its block on a site plan (match the unit number / block, the unit's shape, the lift core and corridor side);
- streets, MRT stations, parks or landmarks on a location map compared with the address;
- what is visible out of the windows in interior photos (roads, landmarks, open views) and which room/window it is from;
- sunlight or shadows in interior photos only as weak supporting evidence.
Even without an explicit north arrow, give your best estimate when the clues point one way, and lower the confidence accordingly.
Answer: by how many degrees must IMAGE 1 be rotated CLOCKWISE so that true north points straight up?
Return ONLY JSON, no prose:
{"found": true|false, "rotate_cw_deg": <0-359>, "confidence": "high"|"medium"|"low", "evidence": "<one or two short sentences naming the clues you combined, e.g. 'Site plan north arrow + unit 125 on the south side of block 88B; window view matches the park on the location map'>"}
Use found=false only if the images give no usable clue at all.`;

function parseJson(text: string): Record<string, unknown> {
	const s = text.indexOf('{');
	const e = text.lastIndexOf('}');
	if (s < 0 || e < s) throw new Error('AI returned no JSON');
	return JSON.parse(text.slice(s, e + 1));
}

async function callAI(provider: string, key: string, prompt: string, images: string[]): Promise<Record<string, unknown>> {
	const signal = AbortSignal.timeout(90_000);
	if (provider === 'openai' || provider === 'deepseek') {
		// DeepSeek uses the same OpenAI-compatible Chat Completions format (deepseek-flash reads images).
		const ds = provider === 'deepseek';
		const name = ds ? 'DeepSeek' : 'OpenAI';
		const send = (jsonMode: boolean) =>
			fetch(ds ? 'https://api.deepseek.com/chat/completions' : 'https://api.openai.com/v1/chat/completions', {
				method: 'POST',
				signal,
				headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
				body: JSON.stringify({
					model: ds ? MODELS.deepseek : MODELS.openai,
					...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
					messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, ...images.map((url) => ({ type: 'image_url', image_url: { url, detail: 'high' } }))] }]
				})
			});
		let r = await send(true);
		// Some models / providers reject JSON mode together with images — retry once without it.
		if (r.status === 400 || r.status === 422) {
			const first = await r.text().catch(() => '');
			console.warn(`[ai] ${name} ${r.status} with JSON mode, retrying without:`, first.slice(0, 300));
			r = await send(false);
		}
		if (!r.ok) throw new Error(`${name} ${r.status}: ${(await r.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 300)}`);
		const d = await r.json();
		const msg = d.choices?.[0]?.message ?? {};
		const text: string = msg.content || '';
		if (!text) throw new Error(`${name} returned an empty reply (finish: ${d.choices?.[0]?.finish_reason ?? '?'}${msg.refusal ? `, refusal: ${String(msg.refusal).slice(0, 120)}` : ''})`);
		return parseJson(text);
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
		if (!r.ok) throw new Error(`Anthropic ${r.status}: ${(await r.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 300)}`);
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
		if (!r.ok) throw new Error(`Gemini ${r.status}: ${(await r.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 300)}`);
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
		.slice(0, 14)
		.filter((x): x is string => typeof x === 'string' && x.length < 1_200_000 && IMG.test(x));
	if (!plan) return json(req, { error: 'Bad request' }, 400);
	// Optional project details to help match the unit on site plans / maps (cleaned, short).
	const c = (body.context ?? {}) as Record<string, unknown>;
	const clean = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/[<>{}\\\u0000-\u001f`]/g, '').trim().slice(0, n) : '');
	const lat = Number(c.lat);
	const lon = Number(c.lon);
	const ctx = [
		clean(c.address, 120) && `address ${clean(c.address, 120)}`,
		clean(c.unitNo, 12) && `unit ${clean(c.unitNo, 12)}`,
		Number.isFinite(Number(c.level)) && c.level !== null ? `floor ${Math.round(Number(c.level))}` : '',
		clean(c.propertyType, 20) && `type ${clean(c.propertyType, 20)}`,
		Number.isFinite(lat) && Number.isFinite(lon) && lat > 1 && lat < 1.6 ? `location ${lat.toFixed(5)}, ${lon.toFixed(5)}` : ''
	]
		.filter(Boolean)
		.join('; ');

	const admin = createClient(url, service);
	const { error: le } = await admin.rpc('ai_daily_take', { p_user: u.user.id, p_fn: 'north', p_limit: DAILY_LIMIT });
	if (le) return json(req, { error: le.message }, le.message.includes('limit') ? 429 : 403);

	const { data: keyRows } = await admin.rpc('active_ai_key');
	const k = Array.isArray(keyRows) ? keyRows[0] : null;
	if (!k?.api_key) return json(req, { found: false, reason: 'no-key' });

	try {
		const ai = await callAI(k.provider, k.api_key, PROMPT(others.length, ctx), [plan, ...others]);
		const found = ai.found === true;
		let deg = Number(ai.rotate_cw_deg);
		deg = Number.isFinite(deg) ? ((Math.round(deg * 2) / 2) % 360 + 360) % 360 : 0;
		const confidence = ['high', 'medium', 'low'].includes(String(ai.confidence)) ? String(ai.confidence) : 'low';
		const evidence = typeof ai.evidence === 'string' ? ai.evidence.replace(/[<>{}\\\u0000-\u001f]/g, '').trim().slice(0, 240) : '';
		return json(req, { found, angle: found ? deg : 0, confidence, evidence });
	} catch (e) {
		const detail = (e instanceof Error ? e.message : String(e)).replace(/[<>{}\\\u0000-\u001f]/g, '').replace(/\b(sk|key|AIza)[-_A-Za-z0-9*]{8,}/g, '[key]').slice(0, 240);
		console.error('[detect-north]', k.provider, detail);
		return json(req, { found: false, reason: 'error', provider: k.provider, detail });
	}
});
