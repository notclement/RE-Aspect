/**
 * A built-in sample unit so the views work before anyone anchors a real one.
 * Coordinates are in centimetres, plan "north-up": +x = east, +y = south.
 * Phase 1 replaces this with units traced by the Anchor wizard (same shape of data).
 */
export interface Wall {
	a: [number, number];
	b: [number, number];
	t: number; // thickness cm
}
export interface Opening {
	a: [number, number];
	b: [number, number];
	normal: [number, number]; // outward, unit vector in plan coords
	sill: number; // cm above floor
	head: number; // cm above floor
	room?: [number, number][]; // polygon of the room this window lights (defaults to the whole unit)
}
export interface Item {
	kind: 'sofa' | 'bed' | 'table' | 'chair' | 'counter' | 'console' | 'wardrobe' | 'rug' | 'plant' | 'desk' | 'bath';
	x: number;
	y: number;
	w: number;
	d: number;
	h: number;
	color: string;
	r?: number; // corner radius
	rot?: number; // degrees clockwise around the item's centre (0 = as drawn)
}
/** A door in a wall. 'door' = hinged (drawn with its swing); 'glass' = full-height sliding glass (lets sun in on an outside wall). */
export interface Door {
	a: [number, number];
	b: [number, number];
	glass: boolean;
	flip: number; // 0–3: bit 1 = hinge at b, bit 2 = swings to the other side
}

/** The four floor corners of a piece of furniture, rotation applied. */
export function itemCorners(it: Item): [number, number][] {
	const cx = it.x + it.w / 2;
	const cy = it.y + it.d / 2;
	const r = ((it.rot ?? 0) * Math.PI) / 180;
	const c = Math.cos(r);
	const s = Math.sin(r);
	return ([[-it.w / 2, -it.d / 2], [it.w / 2, -it.d / 2], [it.w / 2, it.d / 2], [-it.w / 2, it.d / 2]] as [number, number][]).map(
		([x, y]) => [cx + x * c - y * s, cy + x * s + y * c]
	);
}
/** SVG transform for a rotated item (undefined when it isn't rotated). */
export const itemTransform = (it: Item) => (it.rot ? `rotate(${it.rot} ${it.x + it.w / 2} ${it.y + it.d / 2})` : undefined);

/** Geometry for drawing a hinged door: the leaf (hinge → open end) and the swing arc path. */
export function doorGeom(d: Door): { hinge: [number, number]; leaf: [number, number]; arc: string } {
	const [h, e] = d.flip & 1 ? [d.b, d.a] : [d.a, d.b];
	const dx = e[0] - h[0];
	const dy = e[1] - h[1];
	const L = Math.hypot(dx, dy) || 1;
	const side = d.flip & 2 ? -1 : 1;
	const leaf: [number, number] = [h[0] - (dy / L) * L * side, h[1] + (dx / L) * L * side];
	const cross = dx * (leaf[1] - h[1]) - dy * (leaf[0] - h[0]);
	return { hinge: h, leaf, arc: `M${e[0]} ${e[1]} A${L} ${L} 0 0 ${cross > 0 ? 1 : 0} ${leaf[0]} ${leaf[1]}` };
}
export interface Unit {
	id: string;
	name: string;
	unitNo: string;
	level: number;
	ceiling: number; // cm
	sizeSqft: number;
	lat: number;
	lon: number;
	bearing: number; // degrees the plan is rotated from true north (0 = plan up is north)
	outline: [number, number][];
	walls: Wall[];
	windows: Opening[];
	rooms: { name: string; x: number; y: number }[];
	items: Item[];
	doors?: Door[];
	balcony?: { x: number; y: number; w: number; d: number };
}

import { PUNGGOL_3RM, TAMPINES_4RM, BUKIT_BATOK_5RM } from './demo-units.ts';
export { PUNGGOL_3RM, TAMPINES_4RM, BUKIT_BATOK_5RM };

export const SAMPLE_UNITS: Unit[] = [TAMPINES_4RM, PUNGGOL_3RM, BUKIT_BATOK_5RM];
export function sampleById(id: string | null | undefined): Unit {
	return SAMPLE_UNITS.find((u) => u.id === id) ?? TAMPINES_4RM;
}
