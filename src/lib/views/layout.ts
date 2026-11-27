import type { Unit, Point } from './types.ts';
import { clamp } from './types.ts';
import type { Wall } from '#lib/sample-unit.ts';
export function bounds(u: Unit) {
	const points = u.outline.slice(),
		b = u.balcony;
	if (b) points.push([b.x, b.y], [b.x + b.w, b.y + b.d]);
	const xs = points.map((p) => p[0]),
		ys = points.map((p) => p[1]);
	const x = Math.min(...xs) - 16,
		y = Math.min(...ys) - 16,
		w = Math.max(...xs) - x + 16,
		h = Math.max(...ys) - y + 16;
	return { x, y, w, h, cx: x + w / 2, cy: y + h / 2 };
}
export type Bounds = ReturnType<typeof bounds>;
export function distance(x: number, y: number, a: Point, b: Point) {
	const dx = b[0] - a[0],
		dy = b[1] - a[1];
	const t = clamp(((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1), 0, 1);
	return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy);
}
export function inside(x: number, y: number, p: Point[]) {
	let hit = false;
	for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
		const a = p[i],
			b = p[j];
		if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0])
			hit = !hit;
	}
	return hit;
}
export type Piece = Wall & { bottom: number; top: number; glass: boolean };
export function pieces(u: Unit, height: number) {
	const result: Piece[] = [];
	const openings = [
		...u.windows.map((w) => ({ ...w, bottom: w.sill, top: w.head, glass: true })),
		...(u.doors ?? []).map((d) => ({
			...d,
			bottom: 0,
			top: d.glass ? u.ceiling : Math.min(210, u.ceiling),
			glass: d.glass,
		})),
	];
	// Split collinear overlaps, including openings spanning several wall segments.
	for (const wall of u.walls) {
		const { a, b, t } = wall,
			dx = b[0] - a[0],
			dy = b[1] - a[1],
			len = Math.hypot(dx, dy);
		if (len < 0.01) continue;
		const at = (v: number): Point => [a[0] + v * dx, a[1] + v * dy];
		const project = (p: Point) => ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (len * len);
		const aligned = (p: Point) => Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / len <= 3;
		const cuts = openings
			.filter((o) => aligned(o.a) && aligned(o.b))
			.map((o) => {
				const v = project(o.a),
					z = project(o.b);
				return { lo: clamp(Math.min(v, z), 0, 1), hi: clamp(Math.max(v, z), 0, 1), o };
			})
			.filter((c) => c.hi > c.lo);
		const ends = [...new Set([0, 1, ...cuts.flatMap((c) => [c.lo, c.hi])])].sort((a, b) => a - b);
		for (let i = 1; i < ends.length; i++) {
			const l = ends[i - 1],
				r = ends[i],
				mid = (l + r) / 2,
				cut = cuts.find((c) => mid > c.lo && mid < c.hi);
			function add(bottom: number, top: number) {
				if (top > bottom) result.push({ a: at(l), b: at(r), t, bottom, top, glass: false });
			}
			if (!cut) add(0, height);
			else {
				add(0, Math.min(height, cut.o.bottom));
				add(Math.min(height, cut.o.top), height);
			}
		}
	}
	for (const o of openings)
		if (o.glass && o.bottom < height)
			result.push({
				a: o.a,
				b: o.b,
				t: 3,
				bottom: o.bottom,
				top: Math.min(o.top, height),
				glass: true,
			});
	return result;
}
