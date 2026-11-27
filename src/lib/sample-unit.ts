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
	balcony: { x: number; y: number; w: number; d: number };
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

export const SAMPLE_UNIT: Unit = {
	id: 'sample',
	name: 'Sample Residence',
	unitNo: '#12-04',
	level: 12,
	ceiling: CEILING,
	sizeSqft: 1076,
	lat: 1.3521,
	lon: 103.8198,
	bearing: 0,
	outline: [p(20, 20), p(380, 20), p(380, 260), p(20, 260)],
	walls: [
		w(20, 20, 380, 20), w(380, 20, 380, 260), w(20, 260, 380, 260), w(20, 20, 20, 260),
		w(130, 20, 130, 80), w(20, 110, 100, 110),
		w(180, 20, 180, 90), w(180, 90, 230, 90),
		w(250, 20, 250, 60), w(250, 90, 250, 180), w(250, 210, 250, 260),
		w(250, 140, 380, 140)
	],
	windows: [
		win(40, 260, 230, 260, [0, 1], [[20, 110], [130, 110], [130, 80], [180, 80], [180, 90], [250, 90], [250, 260], [20, 260]]), // living, south
		win(270, 260, 360, 260, [0, 1], rect(250, 140, 380, 260)), // bedroom 2, south
		win(380, 40, 380, 120, [1, 0], rect(250, 20, 380, 140)), // bedroom 1, east
		win(380, 160, 380, 240, [1, 0], rect(250, 140, 380, 260)), // bedroom 2, east
		win(30, 20, 110, 20, [0, -1], rect(20, 20, 130, 110)) // kitchen, north
	],
	rooms: [
		{ name: 'Kitchen', x: 75, y: 70 },
		{ name: 'Living / Dining', x: 135, y: 150 },
		{ name: 'Bath', x: 215, y: 75 },
		{ name: 'Bedroom 1', x: 315, y: 130 },
		{ name: 'Bedroom 2', x: 315, y: 250 }
	].map((r) => ({ ...r, x: r.x * S, y: r.y * S })),
	items: [
		it('counter', 25, 25, 100, 14, 90, '#C9CBC2', 1),
		it('counter', 25, 25, 14, 80, 90, '#C9CBC2', 1),
		it('rug', 58, 168, 80, 44, 1, '#CDBFA8', 2),
		it('sofa', 40, 218, 110, 30, 80, '#9DAE8F', 5),
		it('table', 68, 178, 54, 24, 45, '#EFE8DA', 3),
		it('console', 42, 116, 80, 10, 50, '#8E6F52', 1),
		it('table', 158, 124, 58, 36, 75, '#9C7A57', 3),
		it('bed', 300, 36, 72, 84, 50, '#B7BE9C', 4),
		it('wardrobe', 256, 26, 12, 40, 210, '#7F7766', 1),
		it('bed', 304, 170, 64, 76, 50, '#B7BE9C', 4),
		it('desk', 256, 216, 40, 14, 75, '#9C7A57', 1),
		it('bath', 186, 26, 22, 30, 60, '#E9ECE6', 2),
		it('plant', 140, 238, 10, 10, 90, '#6E8A5E', 5),
		it('plant', 360, 124, 10, 10, 90, '#6E8A5E', 5)
	],
	balcony: { x: 60 * S, y: 260 * S, w: 180 * S, d: 28 * S }
};

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

export const SAMPLE_UNITS: Unit[] = [SAMPLE_UNIT, LOFT_UNIT, HDB_UNIT];
export function sampleById(id: string | null | undefined): Unit {
	return SAMPLE_UNITS.find((u) => u.id === id) ?? SAMPLE_UNIT;
}
