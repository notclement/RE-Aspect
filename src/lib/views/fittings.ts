import type { Item } from '#lib/sample-unit.ts';
// Coordinates and sizes are fractions of the footprint and height, before rotation.
export interface Part {
	x: number;
	y: number;
	z: number;
	w: number;
	d: number;
	h: number;
	tone: number;
	round: boolean;
}
export function fittings(it: Item) {
	const p: Part[] = [];
	function box(
		x: number,
		y: number,
		z: number,
		w: number,
		d: number,
		h: number,
		tone = 1,
		round = false,
	) {
		p.push({ x, y, z, w, d, h, tone, round });
	}
	switch (it.kind) {
		case 'bed':
			box(0, 0, 0, 1, 1, 0.8, 0.89);
			box(0.02, 0.02, 0.8, 0.96, 0.95, 0.13, 1.12);
			box(0.02, 0.32, 0.93, 0.96, 0.66, 0.07);
			box(0.08, 0.06, 0.93, 0.84, 0.2, 0.07, 1.2);
			break;
		case 'sofa':
		case 'chair':
			box(0.03, 0.03, 0.03, 0.94, 0.94, 0.49, 0.86);
			box(0.09, 0.13, 0.52, 0.82, 0.81, 0.15, 1.06);
			box(0, 0, 0.48, 1, 0.13, 0.52, 0.96);
			box(0, 0.13, 0.48, 0.09, 0.87, 0.3);
			box(0.91, 0.13, 0.48, 0.09, 0.87, 0.3);
			break;
		case 'desk':
		case 'table':
			for (const x of [0.07, 0.85])
				for (const y of [0.08, 0.84]) box(x, y, 0, 0.08, 0.08, 0.9, 0.76);
			box(0, 0, 0.89, 1, 1, 0.11);
			break;
		case 'plant':
			box(0.24, 0.24, 0, 0.52, 0.52, 0.45, 0.75, true);
			box(0.07, 0.1, 0.38, 0.73, 0.76, 0.41, 1, true);
			box(0.35, 0.2, 0.54, 0.59, 0.63, 0.46, 1.13, true);
			break;
		case 'bath':
			box(0, 0, 0, 1, 1, 0.77, 0.88);
			box(0, 0, 0.77, 1, 0.1, 0.23);
			box(0, 0.9, 0.77, 1, 0.1, 0.23);
			box(0, 0.1, 0.77, 0.09, 0.8, 0.23);
			box(0.91, 0.1, 0.77, 0.09, 0.8, 0.23);
			break;
		case 'wardrobe':
			box(0, 0, 0, 0.493, 1, 1);
			box(0.507, 0, 0, 0.493, 1, 1, 0.97);
			break;
		case 'rug':
			box(0, 0, 0, 1, 1, 1, 0.95);
			box(0.035, 0.035, 0.99, 0.93, 0.93, 0.01, 1.04);
			break;
		case 'console':
		case 'counter':
			box(0.03, 0.04, 0, 0.94, 0.92, 0.1, 0.74);
			box(0.01, 0.02, 0.1, 0.98, 0.96, 0.83);
			box(0, 0, 0.93, 1, 1, 0.07, 1.12);
			break;
	}
	return p;
}
