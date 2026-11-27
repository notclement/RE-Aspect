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

const S = 3.4; // design units → cm
const p = (x: number, y: number): [number, number] => [x * S, y * S];
const w = (x1: number, y1: number, x2: number, y2: number, t = 6): Wall => ({ a: p(x1, y1), b: p(x2, y2), t: t * S });
// Windows: lower 1/3 of the wall height is solid wall (sill), upper 2/3 is glass, up to the ceiling.
const CEILING = 280;
const SILL = Math.round(CEILING / 3);
const win = (x1: number, y1: number, x2: number, y2: number, n: [number, number], room?: number[][]): Opening => ({
	a: p(x1, y1),
	b: p(x2, y2),
	normal: n,
	sill: SILL,
	head: CEILING,
	room: room?.map(([x, y]) => p(x, y))
});
const rect = (x1: number, y1: number, x2: number, y2: number) => [[x1, y1], [x2, y1], [x2, y2], [x1, y2]];
const it = (kind: Item['kind'], x: number, y: number, ww: number, d: number, h: number, color: string, r = 3): Item => ({
	kind,
	x: x * S,
	y: y * S,
	w: ww * S,
	d: d * S,
	h,
	color,
	r: r * S
});

/**
 * Demo 1 — Dakota One, Blk 88B Jalan Satu (S392088), HDB 3-room Type-2B (68 m² / 732 sq ft).
 * Traced from HDB's Type-2B floor plan at its real dimensions (9550 × 8850 mm overall).
 * Orientation assumed: corridor/entrance side faces north into the block, bedroom windows face south.
 */
const HDB_CEILING = 260;
// Plan drawing pixels → cm (the drawing is 14.15 mm per pixel; origin = top-left corner of the flat).
const d = (px: number, py: number): [number, number] => [Math.round((px - 255) * 1.415), Math.round((py - 172) * 1.416)];
const dw = (x1: number, y1: number, x2: number, y2: number, t = 12): Wall => ({ a: d(x1, y1), b: d(x2, y2), t });
const dwin = (x1: number, y1: number, x2: number, y2: number, n: [number, number], room: number[][]): Opening => ({
	a: d(x1, y1),
	b: d(x2, y2),
	normal: n,
	sill: Math.round(HDB_CEILING / 3),
	head: HDB_CEILING,
	room: room.map(([x, y]) => d(x, y))
});
const DK_MAIN = [[255, 172], [480, 172], [480, 485], [255, 485]];
const DK_BED2 = [[480, 172], [690, 172], [690, 400], [480, 400]];
const DK_LIVING = [[690, 262], [930, 262], [930, 705], [745, 705], [745, 622], [692, 622], [692, 485], [540, 485], [540, 400], [690, 400]];
const DK_KITCHEN = [[462, 622], [745, 622], [745, 795], [462, 795]];
const cm = (kind: Item['kind'], x: number, y: number, w: number, dd: number, h: number, color: string, r = 8): Item => ({ kind, x, y, w, d: dd, h, color, r });

export const DAKOTA_UNIT: Unit = {
	id: 'dakota-one',
	name: 'Dakota One',
	unitNo: '#10-125',
	level: 10,
	ceiling: HDB_CEILING,
	sizeSqft: 732,
	lat: 1.3096,
	lon: 103.8866,
	bearing: 180,
	outline: [d(255, 172), d(690, 172), d(690, 262), d(930, 262), d(930, 705), d(745, 705), d(745, 795), d(462, 795), d(462, 622), d(255, 622)],
	walls: [
		// outside walls (structural ones thicker)
		dw(255, 172, 690, 172, 18), dw(690, 172, 690, 262, 22), dw(690, 262, 930, 262, 18), dw(930, 262, 930, 705, 22),
		dw(930, 705, 905, 705), dw(820, 705, 745, 705), dw(745, 705, 745, 795, 22), dw(745, 795, 462, 795, 22),
		dw(462, 795, 462, 622, 14), dw(462, 622, 255, 622, 22), dw(255, 622, 255, 172, 22),
		// bedrooms
		dw(480, 172, 480, 400), dw(447, 400, 600, 400), dw(690, 262, 690, 400),
		// bathrooms
		dw(255, 485, 380, 485), dw(410, 485, 540, 485), dw(410, 485, 410, 622),
		// household shelter (thick RC walls)
		dw(540, 485, 692, 485, 20), dw(692, 485, 692, 622, 20), dw(540, 485, 540, 622, 20), dw(540, 622, 692, 622, 20)
	],
	windows: [
		dwin(272, 172, 475, 172, [0, -1], DK_MAIN), // main bedroom, front
		dwin(255, 275, 255, 465, [-1, 0], DK_MAIN), // main bedroom, side
		dwin(490, 172, 680, 172, [0, -1], DK_BED2), // bedroom 2
		dwin(700, 262, 920, 262, [0, -1], DK_LIVING), // living / dining, front
		dwin(930, 375, 930, 598, [1, 0], DK_LIVING), // living / dining, side
		dwin(462, 640, 462, 775, [-1, 0], DK_KITCHEN) // kitchen, to the service yard
	],
	rooms: [
		{ name: 'Main bedroom', ...xy(d(368, 320)) },
		{ name: 'Bedroom 2', ...xy(d(585, 300)) },
		{ name: 'Living / Dining', ...xy(d(835, 450)) },
		{ name: 'Bath 1', ...xy(d(330, 555)) },
		{ name: 'Bath 2', ...xy(d(475, 555)) },
		{ name: 'Shelter', ...xy(d(616, 555)) },
		{ name: 'Kitchen', ...xy(d(604, 715)) }
	],
	items: [
		cm('bed', 70, 40, 160, 200, 50, '#B7BE9C', 12),
		cm('wardrobe', 255, 230, 55, 160, 210, '#7F7766', 3),
		cm('bed', 335, 110, 107, 190, 50, '#B7BE9C', 12),
		cm('desk', 495, 20, 105, 50, 75, '#9C7A57', 3),
		cm('console', 625, 160, 40, 170, 50, '#8E6F52', 3),
		cm('rug', 690, 175, 130, 175, 1, '#CDBFA8', 6),
		cm('sofa', 840, 150, 90, 215, 80, '#9DAE8F', 16),
		cm('table', 725, 165 + 70, 60, 60, 45, '#EFE8DA', 10),
		cm('table', 725, 470, 150, 85, 75, '#9C7A57', 8),
		cm('plant', 905, 140, 36, 36, 90, '#6E8A5E', 18),
		cm('counter', 300, 822, 386, 58, 90, '#C9CBC2', 3),
		cm('counter', 630, 650, 58, 170, 90, '#C9CBC2', 3),
		cm('bath', 20, 560, 90, 62, 60, '#E9ECE6', 8),
		cm('bath', 232, 560, 80, 62, 60, '#E9ECE6', 8)
	],
	// The air-con ledge (outside the flat) — drawn like a balcony.
	balcony: { x: d(290, 625)[0], y: d(290, 625)[1], w: 177, d: 92 }
};
function xy([x, y]: [number, number]) {
	return { x, y };
}

/** Demo 2 — west-facing studio loft: open plan, long afternoon sun. */
export const LOFT_UNIT: Unit = {
	id: 'loft',
	name: 'Duxton Loft',
	unitNo: '#22-01',
	level: 22,
	ceiling: CEILING,
	sizeSqft: 538,
	lat: 1.2794,
	lon: 103.8424,
	bearing: 0,
	outline: [p(20, 20), p(300, 20), p(300, 200), p(20, 200)],
	walls: [
		w(20, 20, 300, 20), w(300, 20, 300, 200), w(20, 200, 300, 200), w(20, 20, 20, 200),
		w(230, 20, 230, 70), w(230, 100, 230, 110), w(230, 110, 300, 110)
	],
	windows: [
		win(20, 50, 20, 180, [-1, 0], [[20, 20], [230, 20], [230, 110], [300, 110], [300, 200], [20, 200]]), // west wall
		win(60, 200, 210, 200, [0, 1], [[20, 20], [230, 20], [230, 110], [300, 110], [300, 200], [20, 200]]) // south wall
	],
	rooms: [
		{ name: 'Living / Bed', x: 120 * S, y: 120 * S },
		{ name: 'Bath', x: 265 * S, y: 70 * S }
	],
	items: [
		it('counter', 60, 25, 160, 14, 90, '#C9CBC2', 1),
		it('bed', 160, 120, 64, 74, 50, '#B7BE9C', 4),
		it('sofa', 40, 70, 22, 90, 80, '#9DAE8F', 5),
		it('rug', 70, 90, 60, 50, 1, '#CDBFA8', 2),
		it('table', 82, 100, 36, 30, 45, '#EFE8DA', 3),
		it('desk', 250, 160, 44, 14, 75, '#9C7A57', 1),
		it('wardrobe', 236, 118, 14, 40, 210, '#7F7766', 1),
		it('bath', 250, 26, 22, 30, 60, '#E9ECE6', 2),
		it('plant', 28, 186, 10, 10, 90, '#6E8A5E', 5)
	],
	balcony: { x: 100 * S, y: 200 * S, w: 110 * S, d: 24 * S }
};

/** Demo 3 — north–south HDB 4-room, rotated 20° off north: bedrooms north, living south. */
export const HDB_UNIT: Unit = {
	id: 'hdb',
	name: 'Tampines Greens',
	unitNo: '#07-312',
	level: 7,
	ceiling: CEILING,
	sizeSqft: 990,
	lat: 1.3496,
	lon: 103.9568,
	bearing: 20,
	outline: [p(20, 20), p(400, 20), p(400, 240), p(20, 240)],
	walls: [
		w(20, 20, 400, 20), w(400, 20, 400, 240), w(20, 240, 400, 240), w(20, 20, 20, 240),
		w(20, 110, 120, 110), w(150, 110, 270, 110), w(300, 110, 400, 110),
		w(150, 20, 150, 110), w(270, 20, 270, 110),
		w(330, 160, 400, 160), w(330, 160, 330, 200)
	],
	windows: [
		win(40, 20, 130, 20, [0, -1], rect(20, 20, 150, 110)), // master bedroom, north
		win(170, 20, 250, 20, [0, -1], rect(150, 20, 270, 110)), // bedroom 2, north
		win(290, 20, 380, 20, [0, -1], rect(270, 20, 400, 110)), // kitchen, north
		win(40, 240, 320, 240, [0, 1], [[20, 110], [400, 110], [400, 160], [330, 160], [330, 240], [20, 240]]) // living, south
	],
	rooms: [
		{ name: 'Master bedroom', x: 85 * S, y: 70 * S },
		{ name: 'Bedroom 2', x: 210 * S, y: 70 * S },
		{ name: 'Kitchen', x: 335 * S, y: 70 * S },
		{ name: 'Living / Dining', x: 170 * S, y: 180 * S },
		{ name: 'Bath', x: 365 * S, y: 205 * S }
	],
	items: [
		it('bed', 50, 30, 72, 70, 50, '#B7BE9C', 4),
		it('wardrobe', 26, 30, 14, 60, 210, '#7F7766', 1),
		it('bed', 200, 34, 50, 66, 50, '#B7BE9C', 4),
		it('desk', 156, 86, 40, 16, 75, '#9C7A57', 1),
		it('counter', 276, 26, 118, 14, 90, '#C9CBC2', 1),
		it('table', 300, 60, 50, 30, 75, '#9C7A57', 3),
		it('sofa', 40, 200, 120, 30, 80, '#9DAE8F', 5),
		it('rug', 60, 150, 90, 44, 1, '#CDBFA8', 2),
		it('table', 80, 160, 50, 24, 45, '#EFE8DA', 3),
		it('console', 50, 118, 90, 10, 50, '#8E6F52', 1),
		it('table', 210, 150, 70, 40, 75, '#9C7A57', 3),
		it('bath', 340, 200, 26, 30, 60, '#E9ECE6', 2),
		it('plant', 300, 222, 10, 10, 90, '#6E8A5E', 5)
	],
	balcony: { x: 60 * S, y: 240 * S, w: 200 * S, d: 22 * S }
};

export const SAMPLE_UNITS: Unit[] = [DAKOTA_UNIT, LOFT_UNIT, HDB_UNIT];
export function sampleById(id: string | null | undefined): Unit {
	return SAMPLE_UNITS.find((u) => u.id === id) ?? DAKOTA_UNIT;
}
