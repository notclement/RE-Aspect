// RE:Aspect · process-project
// Traces a floor plan — outline, walls, room names, doors and a sensible furniture layout — with the admin's
// active AI key. The furniture is then checked here like an interior designer would (realistic sizes, inside the
// unit, off the walls, clear of every door swing, no overlaps). Windows are added by the user in Studio.
// Photos arrive in the request body only — they are never written to storage, so nothing is left to delete.
// Deploy: Supabase → Edge Functions → process-project (Verify JWT on).
import { createClient } from 'jsr:@supabase/supabase-js@2';

const ALLOWED_ORIGINS = [
	'https://re-aspect.clement-392.workers.dev',
	'https://re-aspect-dev.clement-392.workers.dev',
	'http://localhost:5173',
	'http://localhost:4173'
];
// Fastest model of each provider (tracing must finish well before a phone gives up on the request).
const MODELS = {
	openai: Deno.env.get('OPENAI_TRACE_MODEL') ?? 'gpt-5.6-luna',
	anthropic: Deno.env.get('ANTHROPIC_TRACE_MODEL') ?? 'claude-haiku-5-5',
	google: Deno.env.get('GOOGLE_TRACE_MODEL') ?? 'gemini-3.5-flash-lite',
	deepseek: Deno.env.get('DEEPSEEK_TRACE_MODEL') ?? 'deepseek-flash'
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

const PROMPT = (sizeSqft: number) => `Trace this apartment floor plan for a sunlight simulator, and furnish it like an experienced Singapore interior designer.
The unit's total floor area is about ${sizeSqft} sq ft.
Return ONLY a JSON object, no prose:
{"outline": [[x,y], ...], "walls": [{"a":[x,y],"b":[x,y]}], "rooms": [{"name":"Living / Dining","x":x,"y":y}],
 "doors": [{"a":[x,y],"b":[x,y],"room":"Bath 1"}],
 "items": [{"kind":"bed","cx":x,"cy":y,"w_cm":152,"d_cm":190,"h_cm":50,"rot":0}],
 "scale": {"a":[x,y],"b":[x,y],"mm":9550}}
- outline: the unit's external boundary along the outside walls, every corner in order (include the kitchen / utility and bathrooms; exclude air-con ledges, planters and balconies outside the unit). Flats are drawn on a square grid, so almost every outline edge is exactly horizontal or vertical in the image.
- walls: every interior wall between rooms, including the household shelter's walls, one straight segment per wall run. Walls are horizontal or vertical unless the plan clearly draws them at an angle. Each wall end must touch another wall or the outline (no gaps at corners or T-junctions). Draw a wall straight through any doorway in it — doors are listed separately.
- rooms: every room's name at its centre (Living / Dining, Kitchen, Master Bedroom, Bedroom 2, Bath 1, Shelter, Yard …).
- doors: EVERY room has a door — bedrooms, bathrooms/toilets, household shelter, kitchen, yard — plus the main entrance (room "Entrance"). Use the door openings drawn on the plan: the two ends of the opening on its wall, and the room it opens into. Usual widths: main 90–100 cm, rooms 80–90 cm, toilets 70–80 cm.
- items: a practical, uncluttered furniture layout using what the plan shows (follow any furniture drawn on it). kind is one of ${KINDS.join(', ')}. cx, cy = item centre; w_cm along x and d_cm along y BEFORE rotation; rot = 0, 90, 180 or 270.
  Real sizes (W×D×H cm): queen bed 152×190×50 (master), super single 107×190×50 (other bedrooms), wardrobe 120–200×60×215, desk 100–120×55×75, 3-seat sofa 210×90×80, TV console 160–180×40×48, coffee table 100×55×42 (kind "table"), dining table for 4 140×80×75 with 4 chairs 45×45×90, kitchen counter 60 deep ×90 high along the kitchen walls, shower/WC "bath" 90×100×60 in each bathroom, rug 170×240×1.
  Rules: every item fully inside its room and against a wall where sensible; keep 75–90 cm walkways, 60 cm beside beds, 75 cm behind dining chairs; never place anything in a door's swing or in front of a doorway; don't block windows or balcony doors with tall items; nothing in the household shelter.
- scale: the LONGEST dimension line printed on the plan that you can read clearly (or a drawn scale bar): its two end ticks and its value in millimetres. Use null if the plan shows no dimensions.
Coordinates (except the *_cm sizes) are 0–1000 relative to the image (0,0 top-left, 1000,1000 bottom-right). Follow the thick drawn walls, not dimension lines; ignore legends and text outside the unit. Do not include windows.`;

function parseJson(text: string): Record<string, unknown> {
	const s = text.indexOf('{');
	const e = text.lastIndexOf('}');
	if (s < 0 || e < s) throw new Error('AI returned no JSON');
	return JSON.parse(text.slice(s, e + 1));
}

async function callAI(provider: string, key: string, prompt: string, images: string[]): Promise<Record<string, unknown>> {
	const signal = AbortSignal.timeout(55_000);
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


// ── tidy:start ── squaring up the AI's walls, the way an architect redraws a sketch ──────────────
// The AI reads walls by eye, so they come back a few degrees off, not quite flush with each other and with
// small gaps at the joints. Real flats (HDB, condo) are drawn on a square grid: every wall is parallel or
// at right angles to the others, walls that line up share one line, and every wall end meets another wall.
// So: find the plan's main direction, square every near-straight wall to it, merge lines that are a wall
// thickness apart, then join each loose wall end to the wall it was heading for. Angled walls (> 12° off)
// are kept as drawn. Lengths in cm.
type TW = { a: Pt; b: Pt; t: number };
const RAD = Math.PI / 180;
const SQUARE_TOL = 12; // degrees: closer than this to the grid → square it
const LINE_TOL = 14; // cm: lines closer than this are the same line (about one wall thickness)
const JOIN_TOL = 60; // cm: a wall end this close to another wall is joined to it

/** The plan's main wall direction in degrees (−45…45), from the longest straight runs. */
function mainDirection(segs: [Pt, Pt][]): number {
	const bins = new Array(90).fill(0);
	for (const [a, b] of segs) {
		const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
		if (L < 30) continue;
		const ang = (((Math.atan2(b[1] - a[1], b[0] - a[0]) / RAD) % 90) + 90) % 90;
		for (let d = -2; d <= 2; d++) bins[(Math.round(ang) + d + 90) % 90] += L * Math.exp(-(d * d) / 2);
	}
	let peak = 0;
	for (let i = 1; i < 90; i++) if (bins[i] > bins[peak]) peak = i;
	// refine: length-weighted mean of the runs within 4° of the peak
	let s = 0,
		w = 0;
	for (const [a, b] of segs) {
		const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
		const ang = (((Math.atan2(b[1] - a[1], b[0] - a[0]) / RAD) % 90) + 90) % 90;
		let d = ang - peak;
		if (d > 45) d -= 90;
		if (d < -45) d += 90;
		if (Math.abs(d) <= 4) (s += (peak + d) * L), (w += L);
	}
	const m = w ? s / w : peak;
	return m > 45 ? m - 90 : m;
}
/** 'h' (along x), 'v' (along y) or 'd' (angled), in the squared frame. */
function axisOf(a: Pt, b: Pt): 'h' | 'v' | 'd' {
	const ang = Math.abs(((Math.atan2(b[1] - a[1], b[0] - a[0]) / RAD) % 180 + 180) % 180);
	if (ang < SQUARE_TOL || ang > 180 - SQUARE_TOL) return 'h';
	if (Math.abs(ang - 90) < SQUARE_TOL) return 'v';
	return 'd';
}
/** Group nearby line positions (weighted by length) into shared lines; returns a lookup. */
function lineSnapper(vals: { v: number; w: number }[]): (v: number) => number {
	const s = [...vals].sort((p, q) => p.v - q.v);
	const groups: { lo: number; hi: number; sum: number; w: number }[] = [];
	for (const { v, w } of s) {
		const g = groups[groups.length - 1];
		if (g && v - g.hi <= LINE_TOL && v - g.lo <= 2 * LINE_TOL) (g.hi = v), (g.sum += v * w), (g.w += w);
		else groups.push({ lo: v, hi: v, sum: v * w, w });
	}
	return (v: number) => {
		for (const g of groups) if (v >= g.lo - 0.01 && v <= g.hi + 0.01) return Math.round(g.sum / g.w);
		return Math.round(v);
	};
}
function dropCollinear(p: Pt[]): Pt[] {
	let pts = p.filter((q, i) => Math.hypot(q[0] - p[(i + 1) % p.length][0], q[1] - p[(i + 1) % p.length][1]) > 1);
	for (let changed = true; changed && pts.length > 3; ) {
		changed = false;
		for (let i = 0; i < pts.length; i++) {
			const a = pts[(i - 1 + pts.length) % pts.length];
			const b = pts[i];
			const c = pts[(i + 1) % pts.length];
			const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
			if (Math.abs(cross) < 1 || Math.hypot(b[0] - c[0], b[1] - c[1]) < 1) {
				pts.splice(i, 1);
				changed = true;
				break;
			}
		}
	}
	return pts;
}

function tidyPlan(outline0: Pt[], walls0: TW[], doorMids: Pt[]): { outline: Pt[]; walls: TW[]; tilt: number } {
	const tilt = mainDirection([...outline0.map((p, i): [Pt, Pt] => [p, outline0[(i + 1) % outline0.length]]), ...walls0.map((w): [Pt, Pt] => [w.a, w.b])]);
	const c = Math.cos(-tilt * RAD),
		s = Math.sin(-tilt * RAD);
	const into = (p: Pt): Pt => [p[0] * c - p[1] * s, p[0] * s + p[1] * c]; // squared frame
	const back = (p: Pt): Pt => [Math.round(p[0] * c + p[1] * s), Math.round(-p[0] * s + p[1] * c)];

	// 1. Outline: merge runs that go the same way, so each side of the unit is one edge.
	let out = outline0.map(into);
	for (let pass = 0; pass < 3; pass++) {
		const kinds = out.map((p, i) => axisOf(p, out[(i + 1) % out.length]));
		const keep = out.filter((_, i) => {
			const prev = kinds[(i - 1 + out.length) % out.length];
			return !(prev !== 'd' && prev === kinds[i]);
		});
		if (keep.length === out.length || keep.length < 3) break;
		out = keep;
	}
	const walls = walls0.map((w) => ({ a: into(w.a), b: into(w.b), t: w.t, k: axisOf(into(w.a), into(w.b)) }));

	// 2. Shared lines: every straight edge and wall offers its line; lines a wall-thickness apart merge.
	//    The outline counts 3× so inside walls line up with the outside, not the other way round.
	const xs: { v: number; w: number }[] = [];
	const ys: { v: number; w: number }[] = [];
	out.forEach((p, i) => {
		const q = out[(i + 1) % out.length];
		const k = axisOf(p, q);
		const L = Math.hypot(q[0] - p[0], q[1] - p[1]) * 3;
		if (k === 'h') ys.push({ v: (p[1] + q[1]) / 2, w: L });
		if (k === 'v') xs.push({ v: (p[0] + q[0]) / 2, w: L });
	});
	for (const w of walls) {
		const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
		if (w.k === 'h') ys.push({ v: (w.a[1] + w.b[1]) / 2, w: L });
		if (w.k === 'v') xs.push({ v: (w.a[0] + w.b[0]) / 2, w: L });
	}
	const X = lineSnapper(xs);
	const Y = lineSnapper(ys);

	// 3. Square the outline: each straight edge sits on its line; corners are where two lines cross.
	const kinds = out.map((p, i) => axisOf(p, out[(i + 1) % out.length]));
	const lvl = out.map((p, i) => {
		const q = out[(i + 1) % out.length];
		return kinds[i] === 'h' ? Y((p[1] + q[1]) / 2) : kinds[i] === 'v' ? X((p[0] + q[0]) / 2) : 0;
	});
	let outline: Pt[] = out.map((p, i) => {
		const j = (i - 1 + out.length) % out.length; // edge coming in
		const kin = kinds[j],
			kout = kinds[i];
		let x = p[0],
			y = p[1];
		if (kin === 'h') y = lvl[j];
		if (kin === 'v') x = lvl[j];
		if (kout === 'h') y = lvl[i];
		if (kout === 'v') x = lvl[i];
		return [x, y];
	});
	outline = dropCollinear(outline);

	// 4. Square the walls onto their lines; drop walls that just repeat the outside wall.
	const edges = outline.map((p, i): [Pt, Pt] => [p, outline[(i + 1) % outline.length]]);
	let ws = walls.map((w) => {
		if (w.k === 'h') {
			const y = Y((w.a[1] + w.b[1]) / 2);
			return { ...w, a: [Math.min(w.a[0], w.b[0]), y] as Pt, b: [Math.max(w.a[0], w.b[0]), y] as Pt };
		}
		if (w.k === 'v') {
			const x = X((w.a[0] + w.b[0]) / 2);
			return { ...w, a: [x, Math.min(w.a[1], w.b[1])] as Pt, b: [x, Math.max(w.a[1], w.b[1])] as Pt };
		}
		return w;
	});
	const onOutline = (w: (typeof ws)[number]) =>
		w.k !== 'd' &&
		edges.some(([p, q]) => {
			if (axisOf(p, q) !== w.k) return false;
			const ax = w.k === 'h' ? 0 : 1;
			if (Math.abs(p[1 - ax] - w.a[1 - ax]) > LINE_TOL) return false;
			const lo = Math.max(Math.min(p[ax], q[ax]), w.a[ax]);
			const hi = Math.min(Math.max(p[ax], q[ax]), w.b[ax]);
			return hi - lo > 0.7 * (w.b[ax] - w.a[ax]);
		});
	ws = ws.filter((w) => !onOutline(w));

	// 5. Join loose ends: each end of a straight wall runs on (or is trimmed) to the nearest wall or outside
	//    wall across its path, within JOIN_TOL. Twice, so two walls heading for the same corner both get there.
	type Tgt = { k: 'h' | 'v'; at: number; lo: number; hi: number; own: number };
	for (let pass = 0; pass < 2; pass++) {
		const tg: Tgt[] = [
			...edges.filter(([p, q]) => axisOf(p, q) !== 'd').map(([p, q]): Tgt => {
				const k = axisOf(p, q) as 'h' | 'v';
				return k === 'h' ? { k, at: p[1], lo: Math.min(p[0], q[0]), hi: Math.max(p[0], q[0]), own: -1 } : { k, at: p[0], lo: Math.min(p[1], q[1]), hi: Math.max(p[1], q[1]), own: -1 };
			}),
			...ws.flatMap((w, i): Tgt[] => (w.k === 'h' ? [{ k: 'h', at: w.a[1], lo: w.a[0], hi: w.b[0], own: i }] : w.k === 'v' ? [{ k: 'v', at: w.a[0], lo: w.a[1], hi: w.b[1], own: i }] : []))
		];
		ws = ws.map((w, wi) => {
			if (w.k === 'd') return w;
			const ax = w.k === 'h' ? 0 : 1; // along
			const cross = w.k === 'h' ? 'v' : 'h';
			const line = w.a[1 - ax];
			const ends = [w.a[ax], w.b[ax]];
			for (const e of [0, 1]) {
				let best: number | null = null;
				for (const t of tg) {
					if (t.k !== cross || t.own === wi) continue;
					if (line < t.lo - JOIN_TOL / 2 || line > t.hi + JOIN_TOL / 2) continue; // our line must reach it
					const gap = t.at - ends[e];
					if (Math.abs(gap) > JOIN_TOL) continue;
					// don't run through the wall's own length (only extend outward or trim back a stub)
					const inward = e === 0 ? gap > 0 : gap < 0;
					if (inward && Math.abs(gap) > 25) continue;
					if (best === null || Math.abs(gap) < Math.abs(best - ends[e])) best = t.at;
				}
				if (best !== null) ends[e] = best;
			}
			const lo = Math.min(...ends),
				hi = Math.max(...ends);
			return ax === 0 ? { ...w, a: [lo, line] as Pt, b: [hi, line] as Pt } : { ...w, a: [line, lo] as Pt, b: [line, hi] as Pt };
		});
	}

	// 6. One line, one wall: merge straight walls on the same line that overlap or nearly touch. A longer
	//    gap is only closed when a door sits in it (doors are drawn over walls, not as holes in them).
	const merged: typeof ws = [];
	for (const w of ws) {
		if (w.k === 'd') {
			merged.push(w);
			continue;
		}
		const ax = w.k === 'h' ? 0 : 1;
		const m = merged.find((o) => {
			if (o.k !== w.k || Math.abs(o.a[1 - ax] - w.a[1 - ax]) > 1) return false;
			const gap = Math.max(o.a[ax], w.a[ax]) - Math.min(o.b[ax], w.b[ax]);
			if (gap <= 30) return true;
			if (gap > 120) return false;
			const g0 = Math.min(o.b[ax], w.b[ax]),
				g1 = Math.max(o.a[ax], w.a[ax]);
			return doorMids.some((d) => Math.abs(d[1 - ax] - w.a[1 - ax]) < 30 && d[ax] > g0 && d[ax] < g1);
		});
		if (m) {
			const lo = Math.min(m.a[ax], w.a[ax]),
				hi = Math.max(m.b[ax], w.b[ax]);
			if (ax === 0) (m.a = [lo, m.a[1]]), (m.b = [hi, m.a[1]]);
			else (m.a = [m.a[0], lo]), (m.b = [m.a[0], hi]);
			m.t = Math.max(m.t, w.t);
		} else merged.push({ ...w, a: [...w.a] as Pt, b: [...w.b] as Pt });
	}
	// 7. Drop stubs and anything outside the unit.
	const kept = merged.filter((w) => {
		if (Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]) < 30) return false;
		const mx = (w.a[0] + w.b[0]) / 2,
			my = (w.a[1] + w.b[1]) / 2;
		return inPoly(mx, my, outline) || edges.some(([p, q]) => segD([mx, my], p, q) < 20);
	});
	return { outline: outline.map(back), walls: kept.map((w) => ({ a: back(w.a), b: back(w.b), t: w.t })), tilt };
}
function segD(p: Pt, a: Pt, b: Pt) {
	const dx = b[0] - a[0],
		dy = b[1] - a[1];
	const L2 = dx * dx + dy * dy || 1;
	const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2));
	return Math.hypot(a[0] + dx * t - p[0], a[1] + dy * t - p[1]);
}
// ── tidy:end ──

// ───────────── interior-design checks on the AI's doors and furniture ─────────────
type Item = { kind: string; x: number; y: number; w: number; d: number; h: number; color: string; r: number; rot?: number };
type Seg = { a: Pt; b: Pt; t: number };
type Box = [number, number, number, number];

/** Realistic size ranges (cm) per kind: [min W, max W, min D, max D, min H, max H] in the item's own axes. */
const SIZES: Record<string, [number, number, number, number, number, number]> = {
	bed: [90, 200, 185, 215, 35, 60], wardrobe: [45, 300, 50, 65, 180, 240], desk: [80, 160, 45, 75, 70, 78],
	sofa: [140, 260, 80, 100, 70, 90], table: [45, 200, 40, 110, 35, 78], chair: [40, 55, 40, 55, 80, 100],
	console: [100, 220, 30, 50, 40, 60], counter: [60, 400, 55, 65, 85, 92], bath: [70, 170, 70, 120, 40, 75],
	rug: [100, 300, 100, 300, 1, 2], plant: [25, 60, 25, 60, 40, 180]
};
const clampN = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
function itemBox(i: Item): Box {
	const turned = i.rot === 90 || i.rot === 270;
	const w = turned ? i.d : i.w;
	const d = turned ? i.w : i.d;
	const cx = i.x + i.w / 2;
	const cy = i.y + i.d / 2;
	return [cx - w / 2, cy - d / 2, cx + w / 2, cy + d / 2];
}
const overlap = (a: Box, b: Box, m = 0) => a[0] < b[2] - m && b[0] < a[2] - m && a[1] < b[3] - m && b[1] < a[3] - m;
function segBox(w: Seg): Box {
	const t = w.t / 2;
	return [Math.min(w.a[0], w.b[0]) - t, Math.min(w.a[1], w.b[1]) - t, Math.max(w.a[0], w.b[0]) + t, Math.max(w.a[1], w.b[1]) + t];
}
function inPoly(x: number, y: number, p: Pt[]) {
	let hit = false;
	for (let i = 0, j = p.length - 1; i < p.length; j = i++)
		if (p[i][1] > y !== p[j][1] > y && x < ((p[j][0] - p[i][0]) * (y - p[i][1])) / (p[j][1] - p[i][1]) + p[i][0]) hit = !hit;
	return hit;
}
/** The square a door leaf sweeps (plus a 60 cm landing in front of the opening on both sides). */
function doorZone(d: { a: Pt; b: Pt; flip: number }): Box {
	const [h, e] = d.flip & 1 ? [d.b, d.a] : [d.a, d.b];
	const dx = e[0] - h[0];
	const dy = e[1] - h[1];
	const L = Math.hypot(dx, dy) || 1;
	const reach = Math.max(L, 60);
	const nx = -dy / L;
	const ny = dx / L;
	const xs = [h[0], e[0], h[0] + nx * reach, e[0] + nx * reach, h[0] - nx * reach, e[0] - nx * reach];
	const ys = [h[1], e[1], h[1] + ny * reach, e[1] + ny * reach, h[1] - ny * reach, e[1] - ny * reach];
	return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

/** Snap each door onto its wall, give it a sensible width, and make it swing into its room. */
function fixDoors(raw: unknown, toPx: (p: Pt) => Pt, cm: (p: Pt) => Pt, walls: Seg[], rooms: { name: string; x: number; y: number }[]) {
	const out: { a: Pt; b: Pt; glass: boolean; flip: number }[] = [];
	for (const r of (Array.isArray(raw) ? raw : []).slice(0, 40)) {
		const o = (r ?? {}) as Record<string, unknown>;
		const a0 = npt(o.a);
		const b0 = npt(o.b);
		if (!a0 || !b0) continue;
		const a = cm(toPx(a0));
		const b = cm(toPx(b0));
		const mx = (a[0] + b[0]) / 2;
		const my = (a[1] + b[1]) / 2;
		// nearest wall to the door's middle (within 40 cm)
		let best: { w: Seg; t: number; d: number } | null = null;
		for (const w of walls) {
			const dx = w.b[0] - w.a[0];
			const dy = w.b[1] - w.a[1];
			const L2 = dx * dx + dy * dy || 1;
			const t = clampN(((mx - w.a[0]) * dx + (my - w.a[1]) * dy) / L2, 0, 1);
			const d = Math.hypot(w.a[0] + dx * t - mx, w.a[1] + dy * t - my);
			if (d < 40 && (!best || d < best.d)) best = { w, t, d };
		}
		if (!best) continue;
		const { w } = best;
		const len = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
		if (len < 75) continue;
		const name = typeof o.room === 'string' ? o.room : '';
		const main = /entr|main/i.test(name);
		const wc = /bath|toilet|wc|shower/i.test(name);
		const want = clampN(Math.hypot(b[0] - a[0], b[1] - a[1]), wc ? 70 : 80, main ? 100 : 90);
		const ux = (w.b[0] - w.a[0]) / len;
		const uy = (w.b[1] - w.a[1]) / len;
		const c = clampN(best.t * len, want / 2 + 5, len - want / 2 - 5);
		const A: Pt = [Math.round(w.a[0] + ux * (c - want / 2)), Math.round(w.a[1] + uy * (c - want / 2))];
		const B: Pt = [Math.round(w.a[0] + ux * (c + want / 2)), Math.round(w.a[1] + uy * (c + want / 2))];
		if (out.some((d) => Math.hypot((d.a[0] + d.b[0]) / 2 - (A[0] + B[0]) / 2, (d.a[1] + d.b[1]) / 2 - (A[1] + B[1]) / 2) < 50)) continue;
		// Swing into the named room (the side its label is on); the main door swings inwards.
		const room = rooms.find((q) => q.name.toLowerCase() === name.toLowerCase());
		const nx = -uy;
		const ny = ux; // default leaf side (flip 0)
		let side = 1;
		if (room) side = Math.sign((room.x - (A[0] + B[0]) / 2) * nx + (room.y - (A[1] + B[1]) / 2) * ny) || 1;
		out.push({ a: A, b: B, glass: false, flip: side < 0 ? 2 : 0 });
	}
	return out;
}

/** Realistic sizes, inside the unit, pushed off walls, out of door swings and walkways, no overlaps. */
function fixFurniture(items: Item[], outline: Pt[], walls: Seg[], doors: { a: Pt; b: Pt; flip: number }[]): Item[] {
	const zones = doors.map(doorZone);
	const kept: Item[] = [];
	for (const it0 of items) {
		const z = SIZES[it0.kind];
		if (!z) continue;
		const it: Item = { ...it0 };
		const cx = it.x + it.w / 2;
		const cy = it.y + it.d / 2;
		// beds: keep the long side as the length; everything: clamp to real-world sizes
		if (it.kind === 'bed' && it.w > it.d) [it.w, it.d, it.rot] = [it.d, it.w, ((it.rot ?? 0) + 90) % 360];
		it.w = Math.round(clampN(it.w, z[0], z[1]));
		it.d = Math.round(clampN(it.d, z[2], z[3]));
		it.h = Math.round(clampN(it.h, z[4], z[5]));
		it.x = Math.round(cx - it.w / 2);
		it.y = Math.round(cy - it.d / 2);
		if (!inPoly(cx, cy, outline)) continue;
		if (it.kind !== 'rug') {
			// slide it out of any wall it cuts into (up to 45 cm), like pushing it back against the wall
			for (let pass = 0; pass < 6; pass++) {
				let moved = false;
				for (const w of walls) {
					const b = itemBox(it);
					const s = segBox(w);
					if (!overlap(b, [s[0] - 2, s[1] - 2, s[2] + 2, s[3] + 2])) continue;
					const pens: [number, number, number][] = [[s[2] + 2 - b[0], 1, 0], [b[2] - (s[0] - 2), -1, 0], [s[3] + 2 - b[1], 0, 1], [b[3] - (s[1] - 2), 0, -1]];
					pens.sort((p, q) => p[0] - q[0]);
					const [p, dx, dy] = pens[0];
					if (p > 45) continue;
					it.x += Math.round(dx * p);
					it.y += Math.round(dy * p);
					moved = true;
				}
				if (!moved) break;
			}
			const b = itemBox(it);
			if (walls.some((w) => overlap(b, segBox(w), 1))) continue; // still through a wall → drop it
			if (zones.some((zn) => overlap(b, zn, 1))) continue; // blocks a door → drop it
			if (kept.some((k) => k.kind !== 'rug' && overlap(b, itemBox(k), 1))) continue; // overlaps → drop it
			const corners: Pt[] = [[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]]];
			if (!corners.every(([x, y]) => inPoly(x, y, outline))) continue;
		}
		kept.push(it);
	}
	return kept.slice(0, 80);
}

function buildPlan(ai: Record<string, unknown>, W: number, H: number, sizeSqft: number) {
	const toPx = (p: Pt): Pt => [(p[0] / 1000) * W, (p[1] / 1000) * H];
	const outlinePx = (Array.isArray(ai.outline) ? ai.outline : []).slice(0, 200).map(npt).filter((p): p is Pt => !!p).map(toPx);
	if (outlinePx.length < 3) throw new Error('No outline found');
	const areaPx = polyArea(outlinePx);
	if (areaPx < 100) throw new Error('Outline too small');
	// Scale (cm per image pixel): from a dimension line / scale bar on the plan when it's believable,
	// otherwise fitted so the traced outline matches the unit's sq ft.
	const sArea = Math.sqrt((sizeSqft * 929.03) / areaPx);
	let s = sArea;
	let scaleSource: 'dimensions' | 'area' = 'area';
	let scaleNote = '';
	const sc = (ai.scale ?? null) as Record<string, unknown> | null;
	if (sc && typeof sc === 'object') {
		const a = npt(sc.a);
		const b = npt(sc.b);
		const mm = Number(sc.mm);
		if (a && b && Number.isFinite(mm) && mm >= 500 && mm <= 60000) {
			const pa = toPx(a);
			const pb = toPx(b);
			const dPx = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]);
			const sDim = dPx > 30 ? mm / 10 / dPx : 0;
			// Believable = the floor area it gives is 64–125 % of the stated sq ft (stated sizes include walls and
			// ledges, so the traced inside is usually a little smaller). Otherwise trust the sq ft.
			if (sDim > 0 && sDim / sArea > 0.8 && sDim / sArea < 1.12) {
				s = sDim;
				scaleSource = 'dimensions';
				scaleNote = `${Math.round(mm).toLocaleString('en-US')} mm dimension on the plan`;
			}
		}
	}
	const cm = (p: Pt): Pt => [Math.round(p[0] * s), Math.round(p[1] * s)];
	const rawOutline = outlinePx.map(cm);

	const seg = (v: unknown) => {
		const o = (v ?? {}) as Record<string, unknown>;
		const a = npt(o.a);
		const b = npt(o.b);
		return a && b ? { a: cm(toPx(a)), b: cm(toPx(b)) } : null;
	};
	const rawWalls = (Array.isArray(ai.walls) ? ai.walls : []).slice(0, 300).map(seg).filter((w) => !!w).map((w) => ({ ...w!, t: 12 }));
	const doorMids = (Array.isArray(ai.doors) ? ai.doors : []).map(seg).filter((d) => !!d).map((d): Pt => [(d!.a[0] + d!.b[0]) / 2, (d!.a[1] + d!.b[1]) / 2]);
	// Square up and join the walls before doors and furniture are fitted to them.
	const { outline, walls } = tidyPlan(rawOutline, rawWalls, doorMids);
	if (outline.length < 3) throw new Error('No outline found');
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
			const rot = [0, 90, 180, 270].includes(Number(o.rot)) ? Number(o.rot) : 0;
			return { kind, x: Math.round(x - w / 2), y: Math.round(y - d / 2), w: Math.round(w), d: Math.round(d), h: Math.round(h), color: COLORS[kind], r: kind === 'plant' ? Math.round(w / 2) : 6, ...(rot ? { rot } : {}) };
		})
		.filter((i) => !!i);
	const allWalls: { a: Pt; b: Pt; t: number }[] = [
		...outline.map((p, i) => ({ a: p, b: outline[(i + 1) % outline.length], t: 20 })),
		...walls.map((w) => ({ a: w.a as Pt, b: w.b as Pt, t: 12 }))
	];
	const doors = fixDoors(ai.doors, toPx, cm, allWalls, rooms as { name: string; x: number; y: number }[]);
	const furniture = fixFurniture(items as Item[], outline, allWalls, doors);
	return { v: 1, outline, walls, windows: [], doors, items: furniture, rooms, imageScale: Math.round(s * 10000) / 10000, scaleSource, ...(scaleNote ? { scaleNote } : {}), source: 'ai' };
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
	if (!projectId || !fpUrl || !(W > 50 && W <= 4096) || !(H > 50 && H <= 4096) || !(sizeSqft >= 150 && sizeSqft <= 20000)) {
		return json(req, { error: 'Bad request' }, 400);
	}

	const admin = createClient(url, service);
	// Limits (also checks ownership and disabled accounts).
	const { error: le } = await admin.rpc('ai_run_take', { p_project: projectId, p_fn: 'trace', p_user: u.user.id });
	if (le) return json(req, { error: le.message }, le.message.includes('limit') ? 429 : 403);

	const { data: keyRows, error: ke } = await admin.rpc('active_ai_key');
	const k = Array.isArray(keyRows) ? keyRows[0] : null;
	if (ke || !k?.api_key) return json(req, { error: 'No AI key is set up yet.' }, 412);

	try {
		const ai = await callAI(k.provider, k.api_key, PROMPT(sizeSqft), [fpUrl]);
		const plan = buildPlan(ai, W, H, sizeSqft);
		const { error: se } = await admin.from('projects').update({ plan, status: 'ready' }).eq('id', projectId).eq('owner', u.user.id);
		if (se) throw se;
		return json(req, { plan });
	} catch (e) {
		await admin.from('projects').update({ status: 'failed' }).eq('id', projectId).eq('owner', u.user.id);
		const detail = (e instanceof Error ? (e.name === 'TimeoutError' ? `${k.provider} took too long (over 55 s)` : e.message) : String(e)).replace(/[<>{}\\\u0000-\u001f]/g, '').replace(/\b(sk|key|AIza)[-_A-Za-z0-9*]{8,}/g, '[key]').slice(0, 240);
		console.error('[process-project]', k.provider, detail);
		return json(req, { error: 'Could not trace this floor plan automatically.', provider: k.provider, detail }, 422);
	}
});
