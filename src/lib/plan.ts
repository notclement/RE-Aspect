/**
 * Traced plans — our own compact format for a user's unit (what Studio edits and the sun engine draws).
 * All lengths in cm, plan "north-up" (+x = east, +y = south), so bearing is always 0.
 * The same checks run in the database (size cap) and the process-project edge function.
 */
import type { Unit, Wall, Opening, Item, Door } from './sample-unit.ts';

export type Pt = [number, number];
export const GLASS_OPTIONS: { v: number; label: string }[] = [
	{ v: 1 / 3, label: '⅓' },
	{ v: 1 / 2, label: '½' },
	{ v: 2 / 3, label: '⅔' }
];

export interface PlanWindow {
	a: Pt;
	b: Pt;
	glass: number; // fraction of the wall height that is glass (from the ceiling down)
}
export type PlanDoor = Door;
export interface PlanData {
	v: 1;
	outline: Pt[];
	walls: { a: Pt; b: Pt; t: number }[];
	windows: PlanWindow[];
	doors: PlanDoor[];
	items: Item[];
	rooms: { name: string; x: number; y: number }[];
	/** Floor-plan backdrop placement (cm per image pixel), used by Studio while tracing. */
	imageScale?: number;
	/** How the plan got its size: read from a dimension/scale bar on the floor plan, or fitted to the sq ft. */
	scaleSource?: 'dimensions' | 'area';
	/** e.g. "9,550 mm dimension line" (shown in "How we worked this out"). */
	scaleNote?: string;
	/** Who drew the outline: the AI from the floor plan, or the user in Studio. */
	source?: 'ai' | 'manual';
}

export const emptyPlan = (): PlanData => ({ v: 1, outline: [], walls: [], windows: [], doors: [], items: [], rooms: [] });

export const ITEM_KINDS = ['sofa', 'bed', 'table', 'chair', 'counter', 'console', 'wardrobe', 'rug', 'plant', 'desk', 'bath'] as const;

const MAX = 6000; // 60 m — nothing in a unit is bigger
const num = (v: unknown, lo = -MAX, hi = MAX) => {
	const n = Number(v);
	return Number.isFinite(n) ? Math.round(Math.min(hi, Math.max(lo, n)) * 10) / 10 : null;
};
const pt = (v: unknown): Pt | null => {
	if (!Array.isArray(v) || v.length !== 2) return null;
	const x = num(v[0]);
	const y = num(v[1]);
	return x === null || y === null ? null : [x, y];
};
const cleanName = (v: unknown, max = 30) => (typeof v === 'string' ? v.replace(/[<>{}\\\u0000-\u001f]/g, '').trim().slice(0, max) : '');
const COLOR = /^#[0-9a-fA-F]{6}$/;

/** Validate anything that claims to be a plan (from the server, storage or AI). Bad parts are dropped. */
export function sanitizePlan(raw: unknown): PlanData | null {
	if (!raw || typeof raw !== 'object') return null;
	const r = raw as Record<string, unknown>;
	const list = (v: unknown, max: number) => (Array.isArray(v) ? v.slice(0, max) : []);
	const outline = list(r.outline, 200).map(pt).filter((p): p is Pt => !!p);
	const walls = list(r.walls, 400)
		.map((w) => {
			const o = (w ?? {}) as Record<string, unknown>;
			const a = pt(o.a);
			const b = pt(o.b);
			const t = num(o.t, 4, 60) ?? 12;
			return a && b ? { a, b, t } : null;
		})
		.filter((w): w is PlanData['walls'][number] => !!w);
	const windows = list(r.windows, 100)
		.map((w) => {
			const o = (w ?? {}) as Record<string, unknown>;
			const a = pt(o.a);
			const b = pt(o.b);
			const g = Number(o.glass);
			const glass = GLASS_OPTIONS.reduce((best, opt) => (Math.abs(opt.v - g) < Math.abs(best - g) ? opt.v : best), 2 / 3);
			return a && b ? { a, b, glass } : null;
		})
		.filter((w): w is PlanWindow => !!w);
	const doors = list(r.doors, 100)
		.map((d) => {
			const o = (d ?? {}) as Record<string, unknown>;
			const a = pt(o.a);
			const b = pt(o.b);
			const flip = Math.round(num(o.flip, 0, 3) ?? 0);
			return a && b ? { a, b, glass: o.glass === true, flip } : null;
		})
		.filter((d): d is PlanDoor => !!d);
	const items = list(r.items, 200)
		.map((i) => {
			const o = (i ?? {}) as Record<string, unknown>;
			const kind = ITEM_KINDS.includes(o.kind as Item['kind']) ? (o.kind as Item['kind']) : null;
			const x = num(o.x);
			const y = num(o.y);
			const w = num(o.w, 10, 1000);
			const d = num(o.d, 10, 1000);
			const h = num(o.h, 1, 400);
			if (!kind || x === null || y === null || w === null || d === null || h === null) return null;
			const item: Item = { kind, x, y, w, d, h, color: typeof o.color === 'string' && COLOR.test(o.color) ? o.color : '#B7BE9C', r: num(o.r, 0, 100) ?? 6 };
			const rot = num(o.rot, -720, 720);
			if (rot) item.rot = Math.round((((rot % 360) + 360) % 360) * 10) / 10 || undefined;
			if (item.rot === undefined) delete item.rot;
			return item;
		})
		.filter((i): i is Item => i !== null);
	const rooms = list(r.rooms, 40)
		.map((rm) => {
			const o = (rm ?? {}) as Record<string, unknown>;
			const name = cleanName(o.name);
			const x = num(o.x);
			const y = num(o.y);
			return name && x !== null && y !== null ? { name, x, y } : null;
		})
		.filter((rm): rm is PlanData['rooms'][number] => !!rm);
	const imageScale = num(r.imageScale, 0.01, 100) ?? undefined;
	const scaleSource = r.scaleSource === 'dimensions' || r.scaleSource === 'area' ? r.scaleSource : undefined;
	const scaleNote = cleanName(r.scaleNote, 60) || undefined;
	const source = r.source === 'ai' || r.source === 'manual' ? r.source : undefined;
	return {
		v: 1, outline, walls, windows, doors, items, rooms,
		...(imageScale ? { imageScale } : {}),
		...(scaleSource ? { scaleSource } : {}),
		...(scaleNote ? { scaleNote } : {}),
		...(source ? { source } : {})
	};
}

/** Is point p inside polygon poly (ray casting)? */
export function inside(p: Pt, poly: Pt[]): boolean {
	let c = false;
	for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
		const [xi, yi] = poly[i];
		const [xj, yj] = poly[j];
		if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c;
	}
	return c;
}

export function area(poly: Pt[]): number {
	let s = 0;
	for (let i = 0; i < poly.length; i++) {
		const [x1, y1] = poly[i];
		const [x2, y2] = poly[(i + 1) % poly.length];
		s += x1 * y2 - x2 * y1;
	}
	return Math.abs(s) / 2;
}

/** Outward unit normal of segment a→b relative to the outline. */
export function outwardNormal(a: Pt, b: Pt, outline: Pt[]): [number, number] {
	const dx = b[0] - a[0];
	const dy = b[1] - a[1];
	const len = Math.hypot(dx, dy) || 1;
	let n: [number, number] = [dy / len, -dx / len];
	const mid: Pt = [(a[0] + b[0]) / 2 + n[0] * 8, (a[1] + b[1]) / 2 + n[1] * 8];
	if (outline.length >= 3 && inside(mid, outline)) n = [-n[0], -n[1]];
	return n;
}

/** Shortest distance from p to segment a–b. */
export function segDist(p: Pt, a: Pt, b: Pt): number {
	const dx = b[0] - a[0];
	const dy = b[1] - a[1];
	const L2 = dx * dx + dy * dy || 1;
	const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2));
	return Math.hypot(p[0] - (a[0] + dx * t), p[1] - (a[1] + dy * t));
}

/** Outline edges as walls (exterior walls are drawn from the outline). */
export function outlineEdges(outline: Pt[]): [Pt, Pt][] {
	return outline.length < 2 ? [] : outline.map((p, i) => [p, outline[(i + 1) % outline.length]] as [Pt, Pt]);
}

/** Build the sun engine's Unit from a project's plan. */
export function planToUnit(
	plan: PlanData,
	meta: { id: string; name: string; unitNo: string; level: number | null; sizeSqft: number | null; ceilingCm: number; lat: number | null; lon: number | null }
): Unit {
	const ceiling = meta.ceilingCm || 260;
	const walls: Wall[] = [...outlineEdges(plan.outline).map(([a, b]) => ({ a, b, t: 18 })), ...plan.walls];
	const windows: Opening[] = plan.windows.map((w) => ({
		a: w.a,
		b: w.b,
		normal: outwardNormal(w.a, w.b, plan.outline),
		sill: Math.round(ceiling * (1 - w.glass)),
		head: ceiling
	}));
	// Sliding glass doors on an outside wall let the sun in from the floor up.
	const onOutline = (p: Pt) => outlineEdges(plan.outline).some(([a, b]) => segDist(p, a, b) < 3);
	for (const d of plan.doors) {
		if (d.glass && onOutline(d.a) && onOutline(d.b)) windows.push({ a: d.a, b: d.b, normal: outwardNormal(d.a, d.b, plan.outline), sill: 0, head: Math.min(ceiling, 240) });
	}
	return {
		id: meta.id,
		name: meta.name,
		unitNo: meta.unitNo,
		level: meta.level ?? 1,
		ceiling,
		sizeSqft: meta.sizeSqft ?? Math.round(area(plan.outline) / 929.03),
		lat: meta.lat ?? 1.3521,
		lon: meta.lon ?? 103.8198,
		bearing: 0,
		outline: plan.outline,
		walls,
		windows,
		rooms: plan.rooms,
		items: plan.items,
		doors: plan.doors
	};
}

export const planReady = (p: PlanData | null | undefined): p is PlanData => !!p && p.outline.length >= 3;
