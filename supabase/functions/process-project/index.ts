// RE:Aspect · process-project
// Traces a floor plan (and places furniture from interior photos) with the admin's active AI key.
// Photos arrive in the request body only — they are never written to storage, so nothing is left to delete.
// Deploy: Supabase → Edge Functions → process-project (Verify JWT on).
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
	deepseek: Deno.env.get('DEEPSEEK_MODEL') ?? 'deepseek-flash' // V4.1 Flash: text + images
};
const KINDS = ['sofa', 'bed', 'table', 'chair', 'counter', 'console', 'wardrobe', 'rug', 'plant', 'desk', 'bath'];
const COLORS: Record<string, string> = {
	bed: '#B7BE9C', sofa: '#9DAE8F', table: '#9C7A57', chair: '#A68B6D', desk: '#9C7A57', wardrobe: '#7F7766',
	console: '#8E6F52', counter: '#C9CBC2', bath: '#E9ECE6', rug: '#CDBFA8', plant: '#6E8A5E'
};
const IMG = /^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+/=]+$/;

type Pt = [number, number];

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

const PROMPT = (sizeSqft: number, nInteriors: number) => `You are tracing an apartment floor plan for a sunlight simulator.
Image 1 is the floor plan, already rotated so NORTH IS UP. ${nInteriors ? `Images 2–${nInteriors + 1} are interior photos of the same unit; use them only to decide which furniture is in which room.` : 'There are no interior photos; furnish each room with typical furniture for its type.'}
The unit's total floor area is about ${sizeSqft} sq ft.

Return ONLY a JSON object, no prose:
{
 "outline": [[x,y], ...],          // the unit's external boundary, corners in order (clockwise), excluding outside ledges/balconies
 "walls":   [{"a":[x,y],"b":[x,y]}], // interior walls between rooms
 "windows": [{"a":[x,y],"b":[x,y]}], // window openings; both ends must lie ON an outline edge
 "rooms":   [{"name":"Living / Dining","x":x,"y":y}], // label position = room centre
 "items":   [{"kind":"bed","cx":x,"cy":y,"w_cm":152,"d_cm":190,"h_cm":50}] // furniture: kind is one of ${KINDS.join(', ')}; cx,cy = centre; w along x, d along y
}
Coordinates: x and y are 0–1000, relative to the floor-plan image (0,0 = top-left, 1000,1000 = bottom-right). Use the drawn walls, not the dimension lines. Ignore legends, text and dimension lines outside the unit.`;

function parseJson(text: string): Record<string, unknown> {
	const s = text.indexOf('{');
	const e = text.lastIndexOf('}');
	if (s < 0 || e < s) throw new Error('AI returned no JSON');
	return JSON.parse(text.slice(s, e + 1));
}

async function callAI(provider: string, key: string, prompt: string, images: string[]): Promise<Record<string, unknown>> {
	const signal = AbortSignal.timeout(110_000);
	if (provider === 'openai' || provider === 'deepseek') {
		// DeepSeek uses the same OpenAI-compatible Chat Completions format.
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
				max_tokens: 8000,
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
	throw new Error('This AI provider is not supported for tracing yet');
}

// ── geometry helpers ─────────────────────────────────────────────────────────
const n01 = (v: unknown) => {
	const x = Number(v);
	return Number.isFinite(x) ? Math.min(1000, Math.max(0, x)) : null;
};
const npt = (v: unknown): Pt | null => (Array.isArray(v) && v.length === 2 && n01(v[0]) !== null && n01(v[1]) !== null ? [n01(v[0])!, n01(v[1])!] : null);
function polyArea(p: Pt[]) {
	let s = 0;
	for (let i = 0; i < p.length; i++) {
		const [a, b] = p[i];
		const [c, d] = p[(i + 1) % p.length];
		s += a * d - c * b;
	}
	return Math.abs(s) / 2;
}
function snapToOutline(q: Pt, outline: Pt[]): Pt {
	let best = q;
	let bd = Infinity;
	for (let i = 0; i < outline.length; i++) {
		const a = outline[i];
		const b = outline[(i + 1) % outline.length];
		const dx = b[0] - a[0];
		const dy = b[1] - a[1];
		const L2 = dx * dx + dy * dy || 1;
		const t = Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / L2));
		const p: Pt = [a[0] + dx * t, a[1] + dy * t];
		const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
		if (d < bd) {
			bd = d;
			best = p;
		}
	}
	return best;
}

function buildPlan(ai: Record<string, unknown>, W: number, H: number, sizeSqft: number) {
	const toPx = (p: Pt): Pt => [(p[0] / 1000) * W, (p[1] / 1000) * H];
	const outlinePx = (Array.isArray(ai.outline) ? ai.outline : []).slice(0, 200).map(npt).filter((p): p is Pt => !!p).map(toPx);
	if (outlinePx.length < 3) throw new Error('No outline found');
	const areaPx = polyArea(outlinePx);
	if (areaPx < 100) throw new Error('Outline too small');
	const s = Math.sqrt((sizeSqft * 929.03) / areaPx); // cm per image pixel
	const cm = (p: Pt): Pt => [Math.round(p[0] * s), Math.round(p[1] * s)];
	const outline = outlinePx.map(cm);

	const seg = (v: unknown) => {
		const o = (v ?? {}) as Record<string, unknown>;
		const a = npt(o.a);
		const b = npt(o.b);
		return a && b ? { a: cm(toPx(a)), b: cm(toPx(b)) } : null;
	};
	const walls = (Array.isArray(ai.walls) ? ai.walls : []).slice(0, 300).map(seg).filter((w) => !!w).map((w) => ({ ...w!, t: 12 }));
	const windows = (Array.isArray(ai.windows) ? ai.windows : [])
		.slice(0, 80)
		.map(seg)
		.filter((w) => !!w)
		.map((w) => ({ a: snapToOutline(w!.a, outline).map(Math.round) as Pt, b: snapToOutline(w!.b, outline).map(Math.round) as Pt, glass: 2 / 3 }))
		.filter((w) => Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]) > 30);
	const rooms = (Array.isArray(ai.rooms) ? ai.rooms : [])
		.slice(0, 30)
		.map((r) => {
			const o = (r ?? {}) as Record<string, unknown>;
			const name = typeof o.name === 'string' ? o.name.replace(/[<>{}\\\u0000-\u001f]/g, '').trim().slice(0, 30) : '';
			const x = n01(o.x);
			const y = n01(o.y);
			if (!name || x === null || y === null) return null;
			const [px, py] = cm(toPx([x, y]));
			return { name, x: px, y: py };
		})
		.filter((r) => !!r);
	const items = (Array.isArray(ai.items) ? ai.items : [])
		.slice(0, 120)
		.map((i) => {
			const o = (i ?? {}) as Record<string, unknown>;
			const kind = typeof o.kind === 'string' && KINDS.includes(o.kind) ? o.kind : null;
			const cx = n01(o.cx);
			const cy = n01(o.cy);
			const w = Math.min(600, Math.max(20, Number(o.w_cm) || 0));
			const d = Math.min(600, Math.max(20, Number(o.d_cm) || 0));
			const h = Math.min(300, Math.max(1, Number(o.h_cm) || 75));
			if (!kind || cx === null || cy === null || !w || !d) return null;
			const [x, y] = cm(toPx([cx, cy]));
			return { kind, x: Math.round(x - w / 2), y: Math.round(y - d / 2), w: Math.round(w), d: Math.round(d), h: Math.round(h), color: COLORS[kind], r: kind === 'plant' ? Math.round(w / 2) : 6 };
		})
		.filter((i) => !!i);
	return { v: 1, outline, walls, windows, items, rooms, imageScale: Math.round(s * 10000) / 10000 };
}

// Projects on the new API keys expose them as JSON maps, e.g. {"default":"sb_secret_…"}.
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
	const authHeader = req.headers.get('Authorization') ?? '';

	// Who is calling?
	const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
	const { data: u, error: ue } = await userClient.auth.getUser();
	if (ue || !u.user) return json(req, { error: 'Please sign in again.' }, 401);

	// Validate the request (repeat every check the app does).
	let body: Record<string, unknown>;
	try {
		body = await req.json();
	} catch {
		return json(req, { error: 'Bad request' }, 400);
	}
	const projectId = typeof body.projectId === 'string' && /^[0-9a-f-]{36}$/i.test(body.projectId) ? body.projectId : null;
	const fp = (body.floorPlan ?? {}) as Record<string, unknown>;
	const fpUrl = typeof fp.dataUrl === 'string' && fp.dataUrl.length < 6_000_000 && IMG.test(fp.dataUrl) ? fp.dataUrl : null;
	const W = Number(fp.w);
	const H = Number(fp.h);
	const sizeSqft = Number(body.sizeSqft);
	const interiors = (Array.isArray(body.interiors) ? body.interiors : [])
		.slice(0, 14)
		.filter((x): x is string => typeof x === 'string' && x.length < 2_000_000 && IMG.test(x));
	if (!projectId || !fpUrl || !(W > 50 && W <= 4096) || !(H > 50 && H <= 4096) || !(sizeSqft >= 150 && sizeSqft <= 20000)) {
		return json(req, { error: 'Bad request' }, 400);
	}

	const admin = createClient(url, service);
	// Limits (also checks ownership and disabled accounts).
	const { error: le } = await admin.rpc('ai_run_take', { p_project: projectId, p_fn: 'trace', p_user: u.user.id });
	if (le) return json(req, { error: le.message }, le.message.includes('limit') ? 429 : 403);
	if (interiors.length) await admin.rpc('ai_run_take', { p_project: projectId, p_fn: 'furnish', p_user: u.user.id });

	const { data: keyRows, error: ke } = await admin.rpc('active_ai_key');
	const k = Array.isArray(keyRows) ? keyRows[0] : null;
	if (ke || !k?.api_key) return json(req, { error: 'No AI key is set up yet.' }, 412);

	try {
		const ai = await callAI(k.provider, k.api_key, PROMPT(sizeSqft, interiors.length), [fpUrl, ...interiors]);
		const plan = buildPlan(ai, W, H, sizeSqft);
		const { error: se } = await admin.from('projects').update({ plan, status: 'ready' }).eq('id', projectId).eq('owner', u.user.id);
		if (se) throw se;
		return json(req, { plan });
	} catch (e) {
		await admin.from('projects').update({ status: 'failed' }).eq('id', projectId).eq('owner', u.user.id);
		console.error('[process-project]', e instanceof Error ? e.message : e);
		return json(req, { error: 'Could not trace this floor plan automatically.' }, 422);
	}
});
