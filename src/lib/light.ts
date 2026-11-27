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
	const cot = Math.min(1 / Math.tan(altitude * RAD), 40);
	const out: Patch[] = [];
	for (const w of unit.windows) {
		const facing = s[0] * w.normal[0] + s[1] * w.normal[1];
		if (facing <= 0.03) continue;
		const dS = w.sill * cot;
		const dH = w.head * cot;
		const at = (p: [number, number], d: number): [number, number] => [p[0] - s[0] * d, p[1] - s[1] * d];
		out.push({
			points: [at(w.a, dS), at(w.b, dS), at(w.b, dH), at(w.a, dH)],
			intensity: Math.min(1, facing * 1.5) * Math.min(1, altitude / 12),
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
	const cot = Math.min(1 / Math.tan((altitude * Math.PI) / 180), 8);
	unit.items.forEach((it, i) => {
		const foot: Pt[] = [
			[it.x, it.y], [it.x + it.w, it.y], [it.x + it.w, it.y + it.d], [it.x, it.y + it.d]
		];
		if (it.h > 5) {
			const d = it.h * cot;
			shadows.push(hull([...foot, ...foot.map((p) => [p[0] - s[0] * d, p[1] - s[1] * d] as Pt)]));
		}
		const samples: Pt[] = [...foot, [it.x + it.w / 2, it.y + it.d / 2]];
		if (patches.some((p) => samples.some((q) => inside(q, p.points) && inside(q, p.clip)))) lit.add(i);
	});
	return { shadows, lit };
}

export const ITEM_LABELS: Record<string, string> = {
	sofa: 'Sofa', bed: 'Bed', table: 'Table', chair: 'Chair', counter: 'Counter', console: 'TV console',
	wardrobe: 'Wardrobe', rug: 'Rug', plant: 'Plant', desk: 'Desk', bath: 'Bath'
};
