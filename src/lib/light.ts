/**
 * DayTrace light model v1: project each window along the sun direction onto the floor.
 * Standalone unit — no neighbouring buildings (see docs/REQUIREMENTS.md §6).
 */
import type { Unit, Opening } from './sample-unit.ts';

export interface Patch {
	points: [number, number][];
	intensity: number; // 0..1
	clip: [number, number][];
}

const RAD = Math.PI / 180;
/**
 * Near sunrise/sunset the projected light length (height ÷ tan(altitude)) shoots towards infinity,
 * which made patches and beams jump around. Cap it (≈ sun at 9.5°): below that the light already
 * reaches across the room, and we simply fade it in/out with altitude instead.
 */
const LOW_SUN_COT = 6;

/** Room polygon a window lights (falls back to the unit outline). */
export function roomFor(unit: Unit, win: Opening): [number, number][] {
	const S = 3.4;
	const r = (x1: number, y1: number, x2: number, y2: number): [number, number][] => [
		[x1 * S, y1 * S], [x2 * S, y1 * S], [x2 * S, y2 * S], [x1 * S, y2 * S]
	];
	if (unit.id !== 'sample') return unit.outline;
	const mx = (win.a[0] + win.b[0]) / 2 / S;
	const my = (win.a[1] + win.b[1]) / 2 / S;
	if (my <= 21) return r(20, 20, 130, 110); // kitchen
	if (mx >= 379 && my < 140) return r(250, 20, 380, 140); // bedroom 1
	if (mx >= 250) return r(250, 140, 380, 260); // bedroom 2
	return [
		[20 * S, 110 * S], [130 * S, 110 * S], [130 * S, 80 * S], [180 * S, 80 * S], [180 * S, 90 * S],
		[250 * S, 90 * S], [250 * S, 260 * S], [20 * S, 260 * S]
	]; // living / dining
}

export function sunPatches(unit: Unit, azimuth: number, altitude: number): Patch[] {
	if (altitude <= 0.3) return [];
	const az = (azimuth - unit.bearing) * RAD;
	const s: [number, number] = [Math.sin(az), -Math.cos(az)]; // towards the sun, plan coords (+y = south)
	const cot = Math.min(1 / Math.tan(altitude * RAD), LOW_SUN_COT);
	const out: Patch[] = [];
	for (const w of unit.windows) {
		const facing = s[0] * w.normal[0] + s[1] * w.normal[1];
		if (facing <= 0.03) continue;
		const dS = w.sill * cot;
		const dH = w.head * cot;
		const at = (p: [number, number], d: number): [number, number] => [p[0] - s[0] * d, p[1] - s[1] * d];
		out.push({
			points: [at(w.a, dS), at(w.b, dS), at(w.b, dH), at(w.a, dH)],
			intensity: Math.min(1, facing * 1.5) * smooth(altitude / 10),
			clip: roomFor(unit, w)
		});
	}
	return out;
}

/** 0 (full day) … 1 (night): drives the "dark → light" shading of the unit. */
export function darkness(altitude: number): number {
	if (altitude >= 10) return 0;
	if (altitude <= -6) return 1;
	return (10 - altitude) / 16;
}

// ---------------------------------------------------------------- furniture × sunlight

type Pt = [number, number];

function hull(points: Pt[]): Pt[] {
	const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
	const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
	const lower: Pt[] = [];
	for (const q of p) {
		while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
		lower.push(q);
	}
	const upper: Pt[] = [];
	for (const q of p.reverse()) {
		while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
		upper.push(q);
	}
	return lower.slice(0, -1).concat(upper.slice(0, -1));
}

function inside(pt: Pt, poly: Pt[]): boolean {
	let c = false;
	for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
		const [xi, yi] = poly[i];
		const [xj, yj] = poly[j];
		if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c;
	}
	return c;
}

export interface FurnitureLight {
	shadows: Pt[][]; // floor shadows cast by furniture (only visible inside sun patches)
	lit: Set<number>; // indexes of items sitting in direct sun
}

/** Shadows cast by furniture onto the floor, and which pieces are in direct sun. */
export function furnitureLight(unit: Unit, azimuth: number, altitude: number, patches: Patch[]): FurnitureLight {
	const shadows: Pt[][] = [];
	const lit = new Set<number>();
	if (altitude <= 0.3 || patches.length === 0) return { shadows, lit };
	const az = ((azimuth - unit.bearing) * Math.PI) / 180;
	const s: Pt = [Math.sin(az), -Math.cos(az)];
	const cot = Math.min(1 / Math.tan((altitude * Math.PI) / 180), LOW_SUN_COT);
	unit.items.forEach((it, i) => {
		const foot: Pt[] = [
			[it.x, it.y], [it.x + it.w, it.y], [it.x + it.w, it.y + it.d], [it.x, it.y + it.d]
		];
		if (it.h > 5) {
			const d = it.h * cot;
			shadows.push(hull([...foot, ...foot.map((p) => [p[0] - s[0] * d, p[1] - s[1] * d] as Pt)]));
		}
		const samples: Pt[] = [...foot, [it.x + it.w / 2, it.y + it.d / 2]];
		if (altitude > 2 && patches.some((p) => samples.some((q) => inside(q, p.points) && inside(q, p.clip)))) lit.add(i);
	});
	return { shadows, lit };
}

export const ITEM_LABELS: Record<string, string> = {
	sofa: 'Sofa', bed: 'Bed', table: 'Table', chair: 'Chair', counter: 'Counter', console: 'TV console',
	wardrobe: 'Wardrobe', rug: 'Rug', plant: 'Plant', desk: 'Desk', bath: 'Bath'
};

// ---------------------------------------------------------------- light rays from outside

export interface Ray {
	outside: [Pt, Pt]; // from beyond the unit to where it meets the façade
	inside: [Pt, Pt] | null; // continues through a window into the room
	blocked: boolean; // stopped by a wall
}

function hit(p: Pt, d: Pt, a: Pt, b: Pt): number | null {
	const ex = b[0] - a[0];
	const ey = b[1] - a[1];
	const den = d[0] * ey - d[1] * ex;
	if (Math.abs(den) < 1e-9) return null;
	const u = ((a[0] - p[0]) * ey - (a[1] - p[1]) * ex) / den;
	const v = ((a[0] - p[0]) * d[1] - (a[1] - p[1]) * d[0]) / den;
	return u > 1e-6 && v >= -1e-6 && v <= 1 + 1e-6 ? u : null;
}

/**
 * Parallel sunbeams travelling toward the unit. Beams that reach a window carry on into the room
 * (as far as the light lands on the floor); beams that reach a wall stop there.
 */
export function lightRays(unit: Unit, azimuth: number, altitude: number, spacing = 70): Ray[] {
	if (altitude <= 0.3) return [];
	const az = ((azimuth - unit.bearing) * Math.PI) / 180;
	const d: Pt = [-Math.sin(az), Math.cos(az)]; // direction the light travels
	const perp: Pt = [-d[1], d[0]];
	const xs = unit.outline.map((p) => p[0]);
	const ys = unit.outline.map((p) => p[1]);
	const c: Pt = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
	const R = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / 2;
	const cot = Math.min(1 / Math.tan((altitude * Math.PI) / 180), LOW_SUN_COT);
	const edges = unit.outline.map((p, i) => [p, unit.outline[(i + 1) % unit.outline.length]] as [Pt, Pt]);
	const rays: Ray[] = [];
	for (let t = -R; t <= R; t += spacing) {
		const start: Pt = [c[0] - d[0] * (R + 1040) + perp[0] * t, c[1] - d[1] * (R + 1040) + perp[1] * t];
		let best: number | null = null;
		for (const [a, b] of edges) {
			const u = hit(start, d, a, b);
			if (u !== null && (best === null || u < best)) best = u;
		}
		if (best === null) continue; // misses the unit
		const at: Pt = [start[0] + d[0] * best, start[1] + d[1] * best];
		const win = unit.windows.find((w) => {
			const facing = -(d[0] * w.normal[0] + d[1] * w.normal[1]);
			if (facing <= 0.03) return false;
			const len = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
			const da = Math.hypot(at[0] - w.a[0], at[1] - w.a[1]);
			const db = Math.hypot(at[0] - w.b[0], at[1] - w.b[1]);
			return Math.abs(da + db - len) < 2;
		});
		const outside: [Pt, Pt] = [[start[0] + d[0] * (best - 1000), start[1] + d[1] * (best - 1000)], at];
		if (!win) {
			rays.push({ outside, inside: null, blocked: true });
			continue;
		}
		// Inside: travel to where the top of the window's light lands, unless an interior wall comes first.
		let reach = win.head * cot;
		for (const w of unit.walls) {
			const u = hit([at[0] + d[0] * 2, at[1] + d[1] * 2], d, w.a, w.b);
			if (u !== null && u + 2 < reach) reach = u + 2;
		}
		rays.push({ outside, inside: [at, [at[0] + d[0] * reach, at[1] + d[1] * reach]], blocked: false });
	}
	return rays;
}

/** Smoothstep 0..1 — soft fade for low sun. */
function smooth(x: number): number {
	const t = Math.max(0, Math.min(1, x));
	return t * t * (3 - 2 * t);
}
