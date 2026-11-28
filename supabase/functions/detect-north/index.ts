// RE:Aspect · detect-north
// Infers true north for the floor plan. Step 1: the AI finds the site plan, the unit's stack label (from the unit
// number, #07-125 → stack 125) and the north arrow. Step 2: a zoomed crop around the stack is read three times in
// parallel — unit centre → main door on the floor plan and on the site plan, plus the block's facade line — and the
// angle is computed here exactly (consensus of the three). Fallback: the AI's overall estimate from all clues.
// Tested on HDB Dakota One #07-125 (expected ≈168°): see docs/REQUIREMENTS.md.
// Photos arrive in the request body only and are never stored. Limited per user per day (ai_daily_take).
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { Image } from 'https://deno.land/x/imagescript@1.3.0/mod.ts';

const ALLOWED_ORIGINS = [
	'https://re-aspect.clement-392.workers.dev',
	'https://re-aspect-dev.clement-392.workers.dev',
	'http://localhost:5173',
	'http://localhost:4173'
];
// Claude is required for north detection. Speed: Sonnet 5.5 thinks at "high" effort by default, so each of the
// 8 calls waited on long up-front thinking. Finding the stack and arrow is the hard step and keeps high effort
// (at medium it lost the stack on most cases, 28 Nov); reading a zoomed crop and voting between four turned plans
// are short visual checks (read: low; the four-way vote: medium). Override with secrets.
const MODEL = Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-sonnet-5-5';
const EFFORT_FIND = Deno.env.get('NORTH_EFFORT_FIND') ?? 'high';
const EFFORT_READ = Deno.env.get('NORTH_EFFORT_READ') ?? 'low';
// The four-way vote at low effort flipped some plans 180° (test #3, 28 Nov) — medium.
const EFFORT_CHOOSE = Deno.env.get('NORTH_EFFORT_CHOOSE') ?? 'medium';
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

/** Stack = the digits after the dash in a Singapore unit number (#07-125 → 125). */
const stackOf = (unitNo: string) => (unitNo.match(/-\s*(\d{1,4}[A-Z]?)\s*$/i)?.[1] ?? '').toUpperCase();
/** Block = the leading block number in the address (Blk 88B Jalan Satu → 88B). */
const blockOf = (address: string) => (address.match(/\b(?:blk|block)\s*(\d{1,4}[A-Z]?)\b/i)?.[1] ?? address.match(/^\s*(\d{1,4}[A-Z]?)\s+\D/)?.[1] ?? '').toUpperCase();

const UNIT = (stack: string, block: string) =>
	stack ? `The unit is STACK ${stack}${block ? ` in BLOCK ${block}` : ''} (a unit number like #07-${stack} means floor 07, stack ${stack}; every floor of a stack has the same layout and facing).` : '';
const MAIN_DOOR = `the unit's MAIN ENTRANCE door — the door from the common corridor / lift lobby. On HDB plans it has a double swing (door + metal gate) on the outer wall, often beside the kitchen, household shelter or a small recess. NOT a bedroom, toilet, shelter or balcony door`;

/** Step 1: find the site plan, the stack's label and the north arrow (whole images); plus an overall estimate. */
const PROMPT_FIND = (n: number, ctx: string, stack: string, block: string, sizes: [number, number][]) => `You help orient an apartment floor plan so TRUE NORTH points up, for a sunlight simulator. Work like a Singapore property agent reading HDB / condo brochures.
Image 1 is the unit's floor plan (${sizes[0][0]}×${sizes[0][1]} px).${n ? ` Images 2–${n + 1} are the user's other photos: ${sizes.slice(1).map((z, i) => `image ${i + 2} is ${z[0]}×${z[1]} px`).join(', ')}.` : ''}
${ctx ? `Known details: ${ctx}.` : ''}
${UNIT(stack, block)}
Points are [x, y] in PIXELS of the image they are on (x to the right, y down, [0,0] = top-left).
- "site_image": the image number of a site plan / block plan showing the blocks with unit/stack numbers (null if none).
- "stack_found": true only if the label EXACTLY "${stack || 'the stack number'}"${block ? ` (block ${block})` : ''} is on it (not a similar number); "stack_label": the centre of that label.
- "north_tail", "north_tip": the north arrow on that image (tip = the end marked N); null if none.
- "rotate_cw_deg": your overall estimate from ALL clues (north arrows, the site plan, streets/landmarks on a location map vs the address, window views) of how many degrees image 1 must turn CLOCKWISE so true north points up; "confidence": "high" | "medium" | "low".
Return ONLY JSON, no prose:
{"site_image":2,"stack_found":true,"stack_label":[x,y],"north_tail":[x,y],"north_tip":[x,y],"rotate_cw_deg":0,"confidence":"medium","found":true,"evidence":"<one short sentence>"}
found=false only if there is no usable clue at all.`;

/** Step 2: read the same physical thing on the floor plan and on a zoomed crop of the site plan around the stack. */
const PROMPT_READ = (stack: string, block: string, plan: [number, number], crop: [number, number]) => `Image 1 is an apartment floor plan (${plan[0]}×${plan[1]} px). Image 2 (${crop[0]}×${crop[1]} px) is a ZOOMED crop of the site plan around stack ${stack || '?'}${block ? ` of block ${block}` : ''}; a red ring marks a FIRST GUESS of where its label is (the guess can be on a neighbouring unit).
${UNIT(stack, block)}
Report pixel points [x, y] on the image named (x to the right, y down, [0,0] = top-left). Never give angles.
Image 1:
- "plan_center": the middle of the unit; "plan_door": the middle of ${MAIN_DOOR}.
Image 2:
- "ring_label": the text inside the red ring. "site_label": the centre of the label that reads EXACTLY "${stack || '?'}" in image 2 (it may be next to the ring). Use THAT unit for everything below, not its neighbours.
- "site_unit_center": the middle of that unit's shape.
- "site_door": where that unit meets its common corridor (the shaded walkway strip linking the units to the lifts ⊠ and staircases) — the spot right outside its main door. Match the unit's shape to the floor plan: the door is on the same part of the unit as on the plan (e.g. at a notch/recess next to the kitchen).
- "site_block_line": two points FAR apart along the long straight outer facade of the ROW of units that contains this unit (it and its neighbours on the same side of the corridor) — NOT a linkway, bridge or corridor connector, which can run at other angles.
Return ONLY JSON, no prose, in this order:
{"notes":"<two short sentences: where the main door is on the plan, and where this unit's door meets the corridor in image 2>","ring_label":"","site_label":[x,y],"plan_center":[x,y],"plan_door":[x,y],"site_unit_center":[x,y],"site_door":[x,y],"site_block_line":{"a":[x,y],"b":[x,y]}}
Use null for anything you cannot find.`;

/** Copy a region into a new image (img.clone().crop() would copy the whole bitmap first). */
function region(img: Image, x0: number, y0: number, w: number, h: number): Image {
	const out = new Image(w, h);
	const src = img.bitmap, dst = out.bitmap, W = img.width;
	for (let y = 0; y < h; y++) dst.set(src.subarray(((y0 + y) * W + x0) * 4, ((y0 + y) * W + x0 + w) * 4), y * w * 4);
	return out;
}
/** The block's tilt (0–89°, clockwise) measured from the outline edges around the stack label: a histogram of
 * edge directions modulo 90°, weighted by strength, kept to dark (outline) pixels. Steadier than lines drawn by eye. */
function pixelTilt(img: Image, lx: number, ly: number): number | null {
	const R = Math.max(12, Math.round((32 / 1400) * Math.max(img.width, img.height)));
	const x0 = Math.round(lx - R), y0 = Math.round(ly - R);
	if (x0 < 0 || y0 < 0 || x0 + 2 * R > img.width || y0 + 2 * R > img.height) return null;
	const sub = region(img, x0, y0, 2 * R, 2 * R);
	sub.resize(4 * R, 4 * R);
	const W = sub.width, H = sub.height, px = sub.bitmap, L = new Float32Array(W * H);
	for (let i = 0; i < W * H; i++) L[i] = px[i * 4] * 0.3 + px[i * 4 + 1] * 0.59 + px[i * 4 + 2] * 0.11;
	const mag = new Float32Array(W * H), ang = new Float32Array(W * H);
	const darkNear = (x: number, y: number) => {
		for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (L[(y + dy) * W + x + dx] < 110) return true;
		return false;
	};
	for (let y = 1; y < H - 1; y++)
		for (let x = 1; x < W - 1; x++) {
			const i = y * W + x;
			const gx = L[i - W + 1] + 2 * L[i + 1] + L[i + W + 1] - L[i - W - 1] - 2 * L[i - 1] - L[i + W - 1];
			const gy = L[i + W - 1] + 2 * L[i + W] + L[i + W + 1] - L[i - W - 1] - 2 * L[i - W] - L[i - W + 1];
			mag[i] = darkNear(x, y) ? Math.hypot(gx, gy) : 0;
			ang[i] = ((((Math.atan2(gy, gx) * 180) / Math.PI) % 90) + 90) % 90;
		}
	const sorted = Float32Array.from(mag).sort();
	const cut = sorted[Math.floor(sorted.length * 0.85)];
	const h = new Float64Array(90);
	for (let i = 0; i < W * H; i++) if (mag[i] > cut) h[Math.round(ang[i]) % 90] += mag[i];
	let best = -1, arg = 0, total = 0;
	for (let a = 0; a < 90; a++) {
		let v = 0;
		for (let d = -3; d <= 3; d++) v += h[(a + d + 90) % 90] * Math.exp(-(d * d) / (2 * 1.2 * 1.2));
		total += v;
		if (v > best) { best = v; arg = a; }
	}
	return total > 0 && best > (2 * total) / 90 ? arg : null;
}

/** A zoomed crop of the site plan around the stack label (JPEG / PNG only), with a red ring on the label. */
async function zoomCrop(dataUrl: string, label: [number, number], size: [number, number]): Promise<{ url: string; w: number; h: number; tilt: number | null; img: Image; x0: number; y0: number; k: number } | null> {
	try {
		const bin = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
		const bytes = new Uint8Array(bin.length);
		for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
		const img = await Image.decode(bytes);
		// The model may answer in its own resized pixel space: map its point into the real image.
		const fx = img.width / size[0];
		const fy = img.height / size[1];
		const lx = label[0] * fx;
		const ly = label[1] * fy;
		let tilt: number | null = null;
		try {
			tilt = pixelTilt(img, lx, ly);
		} catch {
			/* keep the AI's tilt */
		}
		const S = Math.round(Math.max(220, Math.min(480, 0.32 * Math.min(img.width, img.height))));
		const x0 = Math.round(Math.max(0, Math.min(img.width - S, lx - S / 2)));
		const y0 = Math.round(Math.max(0, Math.min(img.height - S, ly - S / 2)));
		const crop = region(img, x0, y0, Math.min(S, img.width), Math.min(S, img.height));
		const k = Math.max(1, Math.floor(960 / crop.width));
		const big = crop.resize(crop.width * k, crop.height * k);
		// red ring around the label
		const cx = (lx - x0) * k;
		const cy = (ly - y0) * k;
		const r = 9 * k;
		for (let t = 0; t < 720; t++) {
			const a = (t / 720) * 2 * Math.PI;
			for (let d = -2; d <= 2; d++) {
				const px = Math.round(cx + (r + d) * Math.cos(a));
				const py = Math.round(cy + (r + d) * Math.sin(a));
				if (px >= 1 && py >= 1 && px <= big.width && py <= big.height) big.setPixelAt(px, py, 0xff0000ff);
			}
		}
		const jpg = await big.encodeJPEG(85);
		let s = '';
		for (let i = 0; i < jpg.length; i += 0x8000) s += String.fromCharCode(...jpg.subarray(i, i + 0x8000));
		return { url: `data:image/jpeg;base64,${btoa(s)}`, w: big.width, h: big.height, tilt, img, x0, y0, k };
	} catch (e) {
		console.warn('[detect-north] crop failed', e instanceof Error ? e.message : e);
		return null;
	}
}

async function decodeUrl(dataUrl: string): Promise<Image> {
	const bin = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
	const bytes = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
	return (await Image.decode(bytes)) as Image;
}
/** Crop a floor plan to its drawing: the rows / columns crossed by long dark wall runs (drops titles and notes). */
function cropPlan(img: Image): Image {
	const W = img.width, H = img.height, px = img.bitmap, cols = new Uint32Array(W), rows = new Uint32Array(H);
	for (let y = 0; y < H; y++)
		for (let x = 0; x < W; x++) {
			const i = (y * W + x) * 4;
			if (px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11 < 70) { cols[x]++; rows[y]++; }
		}
	const span = (a: Uint32Array, n: number, thr: number) => { let lo = 0, hi = n - 1; while (lo < n && a[lo] < thr) lo++; while (hi > 0 && a[hi] < thr) hi--; return [lo, hi]; };
	const [x0, x1] = span(cols, W, H * 0.03), [y0, y1] = span(rows, H, W * 0.03);
	if (x1 - x0 < W * 0.2 || y1 - y0 < H * 0.2) return img;
	const m = Math.round(0.03 * Math.max(x1 - x0, y1 - y0));
	const X0 = Math.max(0, x0 - m), Y0 = Math.max(0, y0 - m);
	return region(img, X0, Y0, Math.min(W - X0, x1 - x0 + 2 * m), Math.min(H - Y0, y1 - y0 + 2 * m));
}
/** Turn an image clockwise by deg (nearest neighbour, white fill; the canvas grows to fit). imagescript's own rotate drops content at some angles. */
function rotateCW(img: Image, deg: number): Image {
	const t = (deg * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t), W = img.width, H = img.height;
	const NW = Math.ceil(Math.abs(W * c) + Math.abs(H * s)), NH = Math.ceil(Math.abs(W * s) + Math.abs(H * c));
	const out = new Image(NW, NH);
	const src = img.bitmap, dst = out.bitmap;
	dst.fill(255);
	const cx = W / 2, cy = H / 2, ncx = NW / 2, ncy = NH / 2;
	for (let y = 0; y < NH; y++) {
		const dy = y - ncy;
		for (let x = 0; x < NW; x++) {
			const dx = x - ncx;
			const sx = Math.round(dx * c + dy * s + cx), sy = Math.round(-dx * s + dy * c + cy);
			if (sx >= 0 && sy >= 0 && sx < W && sy < H) {
				const i = (sy * W + sx) * 4, o = (y * NW + x) * 4;
				dst[o] = src[i]; dst[o + 1] = src[i + 1]; dst[o + 2] = src[i + 2]; dst[o + 3] = 255;
			}
		}
	}
	return out;
}
const toUrl = async (img: Image) => {
	const jpg = await img.encodeJPEG(82);
	let s = '';
	for (let i = 0; i < jpg.length; i += 0x8000) s += String.fromCharCode(...jpg.subarray(i, i + 0x8000));
	return `data:image/jpeg;base64,${btoa(s)}`;
};
/** The plan turned to each candidate (site-plan orientation), as T×T tiles (encoded once, shown in a different order to each reading). */
function planTiles(plan: Image, turns: number[], T = 380): Image[] {
	const p = plan;
	const k = 480 / Math.max(p.width, p.height);
	if (k < 1) p.resize(Math.round(p.width * k), Math.round(p.height * k));
	return turns.map((a) => {
		const r = rotateCW(p, a);
		const f = Math.min((T - 16) / r.width, (T - 16) / r.height);
		r.resize(Math.max(1, Math.round(r.width * f)), Math.max(1, Math.round(r.height * f)));
		const tile = new Image(T, T);
		tile.fill(0xffffffff);
		tile.composite(r, Math.round((T - r.width) / 2), Math.round((T - r.height) / 2));
		return tile;
	});
}
const LETTERS = ['A', 'B', 'C', 'D'];

/** Step 3: pick which of four turns of the plan matches the stack on the site plan. */
const PROMPT_CHOOSE = (stack: string, block: string) => `Images 1–4 show the SAME apartment floor plan turned four different ways: A = image 1, B = image 2, C = image 3, D = image 4. Image 5 is a zoomed crop of the site plan around stack ${stack || '?'}${block ? ` of block ${block}` : ''} (a red ring marks a first guess of its label; the guess can be on a neighbouring unit — use the unit labelled exactly "${stack || '?'}").
Which of A–D is turned the SAME way as that unit is drawn on the site plan? Check, in order:
1. The main entrance door (double swing door + gate on the outer wall, usually beside the household shelter / kitchen) must be on the side of the unit that touches its common corridor (the shaded walkway leading to the lifts ⊠ and stairs).
2. The outline must match: which side has the notches / steps, which part sticks out (kitchen / service yard, air-con ledge), which side is longer.
3. The side shared with the neighbouring unit has no windows; the bedrooms and living room have windows on open sides.
Return ONLY JSON: {"notes":"<two short sentences on the door side and the outline>","choice":"A","second":"B"}`;

type P = [number, number];
const pt = (v: unknown): P | null => {
	if (!Array.isArray(v) || v.length !== 2) return null;
	const x = Number(v[0]);
	const y = Number(v[1]);
	return Number.isFinite(x) && Number.isFinite(y) && x >= -50 && x <= 10000 && y >= -50 && y <= 10000 ? [x, y] : null;
};
/** Screen bearing (clockwise from up) of a vector, in degrees 0–360. */
const bearing = (dx: number, dy: number) => ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
/** Pixel size from a data URL (PNG / JPEG / WebP headers), so angles use the real proportions. */
function imageSize(url: string): [number, number] {
	try {
		const b = Uint8Array.from(atob(url.slice(url.indexOf(',') + 1, url.indexOf(',') + 1 + 120_000)), (c) => c.charCodeAt(0));
		if (b[0] === 0x89 && b[1] === 0x50) return [(b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19], (b[20] << 24) | (b[21] << 16) | (b[22] << 8) | b[23]];
		if (b[0] === 0x52 && b[8] === 0x57) {
			const t = String.fromCharCode(b[12], b[13], b[14], b[15]);
			if (t === 'VP8X') return [1 + (b[24] | (b[25] << 8) | (b[26] << 16)), 1 + (b[27] | (b[28] << 8) | (b[29] << 16))];
			if (t === 'VP8 ') return [(b[26] | (b[27] << 8)) & 0x3fff, (b[28] | (b[29] << 8)) & 0x3fff];
			if (t === 'VP8L') return [1 + (((b[22] & 0x3f) << 8) | b[21]), 1 + (((b[24] & 0xf) << 10) | (b[23] << 2) | ((b[22] & 0xc0) >> 6))];
		}
		if (b[0] === 0xff && b[1] === 0xd8) {
			let i = 2;
			while (i < b.length - 9) {
				if (b[i] !== 0xff) return [1000, 1000];
				const m = b[i + 1];
				const len = (b[i + 2] << 8) | b[i + 3];
				if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return [(b[i + 7] << 8) | b[i + 8], (b[i + 5] << 8) | b[i + 6]];
				i += 2 + len;
			}
		}
	} catch {
		/* fall through */
	}
	return [1000, 1000];
}
const angDiff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);
/** Bearing from point c to point d (image pixels), or null. */
function dir(c: unknown, d: unknown): number | null {
	const a = pt(c);
	const b = pt(d);
	return a && b && Math.hypot(b[0] - a[0], b[1] - a[1]) > 3 ? bearing(b[0] - a[0], b[1] - a[1]) : null;
}
/** Direction of a line, modulo 90° (a block's walls and corridors run along two square axes), or null. */
function axis90(line: unknown): number | null {
	const o = (line ?? {}) as Record<string, unknown>;
	const a = pt(o.a);
	const b = pt(o.b);
	if (!a || !b || Math.hypot(b[0] - a[0], b[1] - a[1]) < 30) return null;
	return ((bearing(b[0] - a[0], b[1] - a[1]) % 90) + 90) % 90;
}

function parseJson(text: string): Record<string, unknown> {
	const s = text.indexOf('{');
	const e = text.lastIndexOf('}');
	if (s < 0 || e < s) throw new Error(`AI returned no JSON (${text.length} chars: …${text.slice(-120)})`);
	return JSON.parse(text.slice(s, e + 1));
}

/** Claude only. `cacheFirst` marks the first image (the floor plan, sent to most calls) for prompt caching, so the
 *  later calls of the same check read it from cache: cheaper and a little faster. Returns the parsed JSON reply
 *  and the call's cost from the token counts Claude reports. */
const PRICES: Record<string, [number, number, number, number]> = {
	// US$ per million tokens: input, output, cache read, cache write (5 min)
	'claude-sonnet-5-5': [2, 10, 0.1, 2.5],
	'claude-haiku-5-5': [0.1, 0.5, 0.01, 0.125]
};
type Usage = { fn: string; model: string; in_tok: number; out_tok: number; cache_read: number; cache_write: number; usd: number; ms: number };
async function callClaude(log: Usage[], key: string, prompt: string, images: string[], effort: string, cacheFirst = false): Promise<Record<string, unknown>> {
	const t0 = Date.now();
	const r = await fetch('https://api.anthropic.com/v1/messages', {
		method: 'POST',
		signal: AbortSignal.timeout(90_000),
		headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
		body: JSON.stringify({
			model: MODEL,
			max_tokens: 4000,
			output_config: { effort },
			messages: [{
				role: 'user',
				content: [
					...images.map((url, i) => {
						const [head, data] = url.split(',');
						return { type: 'image', source: { type: 'base64', media_type: head.slice(5, head.indexOf(';')), data }, ...(cacheFirst && i === 0 ? { cache_control: { type: 'ephemeral' } } : {}) };
					}),
					{ type: 'text', text: prompt }
				]
			}]
		})
	});
	if (!r.ok) throw new Error(`Claude ${r.status}: ${(await r.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 300)}`);
	const d = await r.json();
	const u = d.usage ?? {};
	const p = PRICES[MODEL] ?? PRICES['claude-sonnet-5-5'];
	const use: Usage = { fn: 'detect-north', model: MODEL, in_tok: u.input_tokens ?? 0, out_tok: u.output_tokens ?? 0, cache_read: u.cache_read_input_tokens ?? 0, cache_write: u.cache_creation_input_tokens ?? 0, usd: 0, ms: Date.now() - t0 };
	use.usd = (use.in_tok * p[0] + use.out_tok * p[1] + use.cache_read * p[2] + use.cache_write * p[3]) / 1e6;
	log.push(use);
	return parseJson((d.content ?? []).filter((c: { type?: string }) => c.type === 'text').map((c: { text?: string }) => c.text ?? '').join(''));
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
		.filter((x): x is string => typeof x === 'string' && x.length < 2_500_000 && IMG.test(x));
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

	// Claude is required: use the Claude key even if another provider is marked active.
	const { data: keyRows } = await admin.rpc('ai_key_for', { p_provider: 'anthropic' });
	const k = Array.isArray(keyRows) ? keyRows[0] : null;
	if (!k?.api_key) return json(req, { found: false, reason: 'no-key' });
	const usages: Usage[] = []; // this request's calls only
	const t0 = Date.now();
	// Log what this check cost (token counts from Claude), whatever the outcome.
	const logUsage = () => usages.length && admin.from('ai_usage').insert(usages.splice(0)).then(({ error }) => error && console.warn('[detect-north] usage log', error.message));

	try {
		const stack = stackOf(clean(c.unitNo, 12));
		const block = blockOf(clean(c.address, 120));
		const sizes = [imageSize(plan), ...others.map(imageSize)];
		// Step 1 — find the site plan, the stack and the north arrow.
		const f = await callClaude(usages, k.api_key, PROMPT_FIND(others.length, ctx, stack, block, sizes), [plan, ...others], EFFORT_FIND, true);
		let found = f.found === true;
		let deg = Number(f.rotate_cw_deg);
		deg = Number.isFinite(deg) ? (((deg % 360) + 360) % 360) : NaN;
		let confidence = ['high', 'medium', 'low'].includes(String(f.confidence)) ? String(f.confidence) : 'low';
		let evidence = typeof f.evidence === 'string' ? f.evidence.replace(/[<>{}\\\u0000-\u001f]/g, '').trim().slice(0, 240) : '';
		let method = 'estimate';
		let runs: { deg: number; geo: unknown; ai: Record<string, unknown> }[] = [];
		const votes: { order: number[]; ai: Record<string, unknown> }[] = [];
		let chose: unknown = null;

		const si = Math.round(Number(f.site_image)) - 2;
		const site = si >= 0 && si < others.length ? others[si] : null;
		const label = pt(f.stack_label);
		if (site && f.stack_found === true && label) {
			const nt = pt(f.north_tail);
			const nh = pt(f.north_tip);
			const north = nt && nh && Math.hypot(nh[0] - nt[0], nh[1] - nt[1]) > 3 ? bearing(nh[0] - nt[0], nh[1] - nt[1]) : 0;
			const crop = await zoomCrop(site, label, sizes[si + 1]);
			if (crop) {
				// Step 2 — three independent readings of the zoomed crop, in parallel.
				// The SAME physical thing (unit centre → main door) is read on the floor plan and on the site plan; their
				// difference minus the north arrow is the rotation, snapped to the block's exact tilt (plans are drawn
				// square, so the answer = block axis − north + a multiple of 90°).
				const prompt = PROMPT_READ(stack, block, sizes[0], [crop.w, crop.h]);
				const replies = await Promise.allSettled([0, 1, 2].map(() => callClaude(usages, k.api_key, prompt, [plan, crop.url], EFFORT_READ, true)));
				for (const r of replies) {
					if (r.status !== 'fulfilled') continue;
					const ai = r.value;
					const planDoor = dir(ai.plan_center, ai.plan_door);
					const siteDoor = dir(ai.site_unit_center, ai.site_door);
					if (planDoor === null || siteDoor === null) continue;
					const coarse = (((siteDoor - north - planDoor) % 360) + 360) % 360;
					const tilt = axis90(ai.site_block_line);
					let geo = coarse;
					if (tilt !== null) {
						const base = (((tilt - north) % 90) + 90) % 90;
						geo = [0, 1, 2, 3, 4].map((j) => (base + j * 90) % 360).reduce((p, q) => (angDiff(q, coarse) < angDiff(p, coarse) ? q : p));
					}
					runs.push({ deg: geo, geo: { planDoor, siteDoor, north, coarse, tilt }, ai });
				}
			}
			if (runs.length) {
				// The reading the others agree with most (one misread door or wall can't swing the result).
				const pick = runs.reduce((p, q) => (runs.reduce((t, r) => t + Math.min(angDiff(r.deg, q.deg), 45), 0) < runs.reduce((t, r) => t + Math.min(angDiff(r.deg, p.deg), 45), 0) ? q : p));
				const agreeing = runs.filter((r) => angDiff(r.deg, pick.deg) <= 12).length;
				deg = pick.deg;
				// Fine-tune with the median block tilt of all readings (each line is drawn by eye; the median is steadier).
				const tilts = runs.map((r) => (r.geo as { tilt: number | null }).tilt).filter((t): t is number => t !== null);
				// The block tilt measured from the site plan's pixels beats the AI's hand-drawn lines. Measure it around the
				// first label guess and around each reading's exact label / unit centre, and take the median (a guess that
				// lands on a neighbour or a linkway is outvoted).
				const ptilts: number[] = crop!.tilt !== null ? [crop!.tilt] : [];
				for (const r of runs)
					for (const q of [pt(r.ai.site_label), pt(r.ai.site_unit_center)]) {
						if (!q) continue;
						try {
							const v = pixelTilt(crop!.img, crop!.x0 + q[0] / crop!.k, crop!.y0 + q[1] / crop!.k);
							if (v !== null) ptilts.push(v);
						} catch {
							/* skip */
						}
					}
				let ptilt: number | null = null;
				if (ptilts.length) {
					const ref = ptilts[0];
					const un = ptilts.map((t) => ref + ((((t - ref) % 90) + 135) % 90) - 45).sort((x, y) => x - y);
					ptilt = ((un[Math.floor(un.length / 2)] % 90) + 90) % 90;
				}
				if (ptilt !== null) {
					const base = (((ptilt - north) % 90) + 90) % 90;
					deg = [0, 1, 2, 3, 4].map((j) => (base + j * 90) % 360).reduce((p, q) => (angDiff(q, pick.deg) < angDiff(p, pick.deg) ? q : p));
				} else if (tilts.length >= 2) {
					const ref = tilts[0];
					const unwrapped = tilts.map((t) => ref + ((((t - ref) % 90) + 135) % 90) - 45).sort((x, y) => x - y);
					const med = unwrapped[Math.floor(unwrapped.length / 2)];
					const base = (((med - north) % 90) + 90) % 90;
					deg = [0, 1, 2, 3, 4].map((j) => (base + j * 90) % 360).reduce((p, q) => (angDiff(q, pick.deg) < angDiff(p, pick.deg) ? q : p));
				}
				// Step 3 — show the plan turned each of the four ways the block allows and let four readings pick one
				// (each sees a different order). Their votes plus the door reading decide.
				try {
					const base = deg % 90;
					const cands = [0, 1, 2, 3].map((j) => (base + j * 90) % 360);
					const raw = await decodeUrl(plan);
					const kp = 700 / Math.max(raw.width, raw.height);
					if (kp < 1) raw.resize(Math.round(raw.width * kp), Math.round(raw.height * kp));
					const planImg = cropPlan(raw);
					const tiles = planTiles(planImg, cands.map((a) => (a + north) % 360));
					const orders = [0, 1, 2, 3].map((o) => [0, 1, 2, 3].map((j) => (j + o) % 4));
					const urls = await Promise.all(tiles.map(toUrl));
					const replies = await Promise.allSettled(orders.map((ord) => callClaude(usages, k.api_key, PROMPT_CHOOSE(stack, block), [...ord.map((j) => urls[j]), crop!.url], EFFORT_CHOOSE)));
					const score = [0, 0, 0, 0];
					replies.forEach((r, i) => {
						if (r.status !== 'fulfilled') return;
						const a = LETTERS.indexOf(String(r.value.choice ?? '').trim().toUpperCase().slice(0, 1));
						const b = LETTERS.indexOf(String(r.value.second ?? '').trim().toUpperCase().slice(0, 1));
						if (a >= 0) score[orders[i][a]] += 1;
						if (b >= 0 && b !== a) score[orders[i][b]] += 0.5;
						votes.push({ order: orders[i].map((j) => Math.round(cands[j])), ai: r.value });
					});
					const doorJ = cands.reduce((p, q, j) => (angDiff(q, deg) < angDiff(cands[p], deg) ? j : p), 0);
					score[doorJ] += 1;
					const bestJ = score.reduce((p, q, j) => (q > score[p] || (q === score[p] && j === doorJ) ? j : p), 0);
					chose = { cands: cands.map(Math.round), score, doorJ, ptilts };
					deg = cands[bestJ];
				} catch (e) {
					console.warn('[detect-north] choose failed', e instanceof Error ? e.message : e);
				}
				found = true;
				method = 'site-plan';
				confidence = agreeing >= 2 ? 'high' : 'medium';
				evidence = (`Stack ${stack || '?'} on the site plan vs the floor plan's main door${nt ? ', site-plan north arrow' : ''}. ` + evidence).slice(0, 240);
			}
		}
		if (!Number.isFinite(deg)) found = false;
		const angle = found ? Math.round(deg) % 360 : 0;
		// Admins can ask for the raw reading (to tune the prompt).
		let debug: unknown = undefined;
		if (body.debug === true) {
			const { data: isAdmin } = await userClient.rpc('is_admin');
			if (isAdmin === true) debug = { stack, block, sizes, find: f, runs: runs.map((r) => ({ deg: Math.round(r.deg), geo: r.geo, ai: r.ai })), chose, votes };
		}
		const ms = Date.now() - t0;
		await logUsage();
		return json(req, { found, angle, confidence, evidence, method, ms, ...(debug ? { debug } : {}) });
	} catch (e) {
		const detail = (e instanceof Error ? e.message : String(e)).replace(/[<>{}\\\u0000-\u001f]/g, '').replace(/\b(sk|key|AIza)[-_A-Za-z0-9*]{8,}/g, '[key]').slice(0, 240);
		console.error('[detect-north]', detail);
		await logUsage();
		return json(req, { found: false, reason: 'error', provider: 'anthropic', detail });
	}
});
