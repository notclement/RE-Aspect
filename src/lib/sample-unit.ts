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
const win = (x1: number, y1: number, x2: number, y2: number, n: [number, number], sill = SILL, head = CEILING): Opening => ({
	a: p(x1, y1),
	b: p(x2, y2),
	normal: n,
	sill,
	head
});
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
		win(40, 260, 230, 260, [0, 1]), // living, south (onto balcony)
		win(270, 260, 360, 260, [0, 1]), // bedroom 2, south
		win(380, 40, 380, 120, [1, 0]), // bedroom 1, east
		win(380, 160, 380, 240, [1, 0]), // bedroom 2, east
		win(30, 20, 110, 20, [0, -1]) // kitchen, north
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
