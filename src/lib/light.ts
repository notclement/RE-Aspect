/**
 * DayTrace light model v1: project each window along the sun direction onto the floor.
 * Standalone unit — no neighbouring buildings (see docs/REQUIREMENTS.md §6).
 */
import { itemCorners, type Unit, type Opening, type Wall } from './sample-unit.ts';

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
	return win.room ?? unit.outline;
}

/** Shortest distance from p to segment a–b. */
function segDist(p: [number, number], a: [number, number], b: [number, number]): number {
	const dx = b[0] - a[0];
	const dy = b[1] - a[1];
	const L2 = dx * dx + dy * dy || 1;
	const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2));
	return Math.hypot(p[0] - (a[0] + dx * t), p[1] - (a[1] + dy * t));
}

/** Walls that can block light coming in through window w (every wall except the one the window sits in). */
function blockers(unit: Unit, w: Opening): Wall[] {
	return unit.walls.filter((wl) => !(segDist(w.a, wl.a, wl.b) < 4 && segDist(w.b, wl.a, wl.b) < 4));
}

/** How far light entering at p (travelling along d) gets before a wall stops it. */
function reachFrom(p: [number, number], d: [number, number], walls: Wall[], max: number): number {
	let reach = max;
	const q: [number, number] = [p[0] + d[0] * 2, p[1] + d[1] * 2];
	for (const wl of walls) {
		const u = hit(q, d, wl.a, wl.b);
		if (u !== null && u + 2 < reach) reach = u + 2;
	}
	return reach;
}

const SLICES = 24; // light is traced in slices across each window, so walls cut it off where they stand

export function sunPatches(unit: Unit, azimuth: number, altitude: number): Patch[] {
	if (altitude <= 0.3) return [];
	const az = (azimuth - unit.bearing) * RAD;
	const s: [number, number] = [Math.sin(az), -Math.cos(az)]; // towards the sun, plan coords (+y = south)
	const d: [number, number] = [-s[0], -s[1]]; // direction the light travels
	const cot = Math.min(1 / Math.tan(altitude * RAD), LOW_SUN_COT);
	const out: Patch[] = [];
	for (const w of unit.windows) {
		const facing = s[0] * w.normal[0] + s[1] * w.normal[1];
		if (facing <= 0.03) continue;
		const dS = w.sill * cot;
		const dH = w.head * cot;
		const intensity = Math.min(1, facing * 1.5) * smooth(altitude / 12);
		const clip = roomFor(unit, w);
		const walls = blockers(unit, w);
		const at = (p: [number, number], k: number): [number, number] => [p[0] + d[0] * k, p[1] + d[1] * k];
		const lerp = (t: number): [number, number] => [w.a[0] + (w.b[0] - w.a[0]) * t, w.a[1] + (w.b[1] - w.a[1]) * t];
		// Far edge of the light for each slice boundary (null = that part is blocked before the light reaches the floor).
		const far: (number | null)[] = [];
		for (let i = 0; i <= SLICES; i++) {
			const r = reachFrom(lerp(i / SLICES), d, walls, dH);
			far.push(r > dS + 1 ? r : null);
		}
		// One polygon per run of lit slices.
		let run: number[] = [];
		const flush = () => {
			if (run.length >= 2) {
				const near = run.map((i) => at(lerp(i / SLICES), dS));
				const back = run.map((i) => at(lerp(i / SLICES), far[i]!)).reverse();
				out.push({ points: [...near, ...back], intensity, clip });
			}
			run = [];
		};
		for (let i = 0; i <= SLICES; i++) {
			if (far[i] === null) flush();
			else run.push(i);
		}
		flush();
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

export function hull(points: Pt[]): Pt[] {
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
		const foot: Pt[] = itemCorners(it);
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
export function smooth(x: number): number {
	const t = Math.max(0, Math.min(1, x));
	return t * t * (3 - 2 * t);
}

// ---------------------------------------------------------------- rays through windows

export interface WindowRay {
	at: Pt; // where the ray crosses the window
	land: Pt; // where light starts reaching the floor (past the sill wall's shadow)
	end: Pt; // furthest point the light reaches (from the top of the window)
	win: number; // index into unit.windows
}

/**
 * Sunbeams entering through each sun-facing window, spaced evenly along the window so they
 * move smoothly with the sun (no beams appearing/disappearing). The solid sill wall (lower 1/3)
 * keeps the floor right by the window in shade: light lands from sill·cot(alt) to head·cot(alt).
 */
export function windowRays(unit: Unit, azimuth: number, altitude: number, spacing = 60): WindowRay[] {
	if (altitude <= 0.3) return [];
	const az = (azimuth - unit.bearing) * RAD;
	const s: Pt = [Math.sin(az), -Math.cos(az)];
	const d: Pt = [-s[0], -s[1]];
	const cot = Math.min(1 / Math.tan(altitude * RAD), LOW_SUN_COT);
	const out: WindowRay[] = [];
	for (const [wi, w] of unit.windows.entries()) {
		if (s[0] * w.normal[0] + s[1] * w.normal[1] <= 0.03) continue;
		const len = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
		const n = Math.max(2, Math.round(len / spacing));
		const walls = blockers(unit, w);
		for (let k = 0; k < n; k++) {
			const t = (k + 0.5) / n;
			const at: Pt = [w.a[0] + (w.b[0] - w.a[0]) * t, w.a[1] + (w.b[1] - w.a[1]) * t];
			// Walls stop the light: the ray ends where it meets one (and is dropped if that's before it reaches the floor).
			const reach = reachFrom(at, d, walls, w.head * cot);
			const sill = w.sill * cot;
			if (reach <= sill + 1) continue;
			out.push({
				at,
				land: [at[0] + d[0] * sill, at[1] + d[1] * sill],
				end: [at[0] + d[0] * reach, at[1] + d[1] * reach],
				win: wi
			});
		}
	}
	return out;
}
