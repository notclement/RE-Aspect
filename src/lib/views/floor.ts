import type { Unit, Lighting, Point } from './types.ts';
import type { Bounds } from './layout.ts';
import type { Palette } from './surface.ts';
export function polygon(p: Point[]) {
	const path = new Path2D();
	p.forEach(([x, y], i) => (i ? path.lineTo(x, y) : path.moveTo(x, y)));
	path.closePath();
	return path;
}
export function imageLayer(w: number, h: number) {
	const c = document.createElement('canvas');
	c.width = w;
	c.height = h;
	const ctx = c.getContext('2d')!;
	return { canvas: c, ctx };
}
function trace(c: CanvasRenderingContext2D, p: Point[]) {
	c.beginPath();
	if (!p.length) return;
	c.moveTo(p[0][0], p[0][1]);
	for (let i = 1; i < p.length; i++) c.lineTo(p[i][0], p[i][1]);
	c.closePath();
}
// The same clipped, anti-aliased light mask drives both renderers.
export function flooring(u: Unit, b: Bounds) {
	const k = 512 / Math.max(b.w, b.h),
		w = Math.max(1, Math.ceil(b.w * k)),
		h = Math.max(1, Math.ceil(b.h * k));
	const base = imageLayer(w, h),
		light = imageLayer(w, h),
		outline = polygon(u.outline);
	const setup = (c: CanvasRenderingContext2D) =>
		c.setTransform(w / b.w, 0, 0, h / b.h, (-b.x * w) / b.w, (-b.y * h) / b.h);
	setup(base.ctx);
	setup(light.ctx);
	return {
		base: base.canvas,
		light: light.canvas,
		theme(p: Palette) {
			const c = base.ctx;
			c.clearRect(b.x, b.y, b.w, b.h);
			if (u.balcony) {
				const v = u.balcony;
				c.fillStyle = p.balcony;
				c.fillRect(v.x, v.y, v.w, v.d);
			}
			c.fillStyle = p.floor;
			c.fill(outline);
			c.save();
			c.clip(outline);
			c.strokeStyle = p['floor-line'];
			c.globalAlpha = 0.55;
			c.lineWidth = 1;
			c.beginPath();
			for (let i = 0, y = b.y; y < b.y + b.h; i++, y += 18) {
				c.moveTo(b.x, y);
				c.lineTo(b.x + b.w, y);
				for (let x = b.x + ((i * 71) % 153); x < b.x + b.w; x += 153) {
					c.moveTo(x, y);
					c.lineTo(x, y + 18);
				}
			}
			c.stroke();
			c.restore();
		},
		update(l: Lighting, p: Palette) {
			const c = light.ctx;
			c.clearRect(b.x, b.y, b.w, b.h);
			if (l.sun.altitude <= 0 || l.dark >= 1) return;
			c.save();
			c.clip(outline);
			c.fillStyle = l.sunColor || p.ochre;
			c.strokeStyle = l.sunColor || p.ochre;
			for (const patch of l.patches) {
				c.save();
				trace(c, patch.clip);
				c.clip();
				trace(c, patch.points);
				// RE:Aspect: stronger patches with a crisp edge so they stand out on light floors/themes.
				c.globalAlpha = Math.min(0.92, 0.9 * (0.35 + 0.65 * patch.intensity)) * (1 - l.dark);
				c.fill();
				c.globalAlpha = Math.min(1, c.globalAlpha * 1.2);
				c.lineWidth = 3;
				c.stroke();
				c.restore();
			}
			c.globalCompositeOperation = 'destination-out';
			c.globalAlpha = 0.82;
			for (const shadow of l.furniture.shadows) {
				trace(c, shadow);
				c.fill();
			}
			c.restore();
		},
	};
}
