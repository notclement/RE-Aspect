<script lang="ts">
	import { onMount } from 'svelte';
	import { doorGeom } from '#lib/sample-unit.ts';
	import { type PlanProps, rad, clamp } from './types.ts';
	import { bounds, pieces } from './layout.ts';
	import { flooring, imageLayer } from './floor.ts';
	import { fittings } from './fittings.ts';
	import { palette, surface, planInput } from './surface.ts';

	let {
		unit,
		sun,
		patches,
		dark,
		furniture,
		showSun = false,
		grid = $bindable(true),
		sunColor,
		onzoom,
	}: PlanProps = $props();
	let canvas: HTMLCanvasElement;
	let scale = $state(1),
		px = 0,
		py = 0,
		invalidate = () => {};
	export function getScale() {
		return scale;
	}
	export function zoomBy(f: number) {
		if (f > 0) {
			scale = clamp(scale * f, 0.7, 2.5);
			onzoom?.(scale);
			invalidate();
		}
	}
	/** RE:Aspect: centre the unit and make it as big as fits (95 % of the view instead of the default 86 %). */
	export function fit() {
		scale = 0.95 / 0.86;
		px = py = 0;
		onzoom?.(scale);
		invalidate();
	}
	export function reset() {
		scale = 1;
		px = py = 0;
		invalidate();
	}
	let dirty = true,
		model = true;
	$effect(() => {
		void unit;
		model = true;
		invalidate();
	});
	$effect(() => {
		void [sun.azimuth, sun.altitude, dark, patches, furniture, showSun, grid, sunColor];
		dirty = true;
		invalidate();
	});
	onMount(() => {
		const c = canvas.getContext('2d')!;
		let b = bounds(unit),
			floor: ReturnType<typeof flooring>,
			ink: ReturnType<typeof imageLayer>;
		const dots = imageLayer(18, 18);
		let pattern: CanvasPattern | null = null;
		let p = palette(canvas),
			w = 1,
			h = 1,
			dpr = 1,
			decoration = true;
		let beams: { x: number; y: number; nx: number; ny: number }[] = [];
		function rebuild() {
			b = bounds(unit);
			floor = flooring(unit, b);
			ink = imageLayer(floor.base.width * 2, floor.base.height * 2);
			beams = [];
			const a = unit.outline;
			const winding = Math.sign(
				a.reduce((s, v, i) => {
					const n = a[(i + 1) % a.length];
					return s + v[0] * n[1] - n[0] * v[1];
				}, 0),
			);
			a.forEach((v, i) => {
				const n = a[(i + 1) % a.length],
					dx = n[0] - v[0],
					dy = n[1] - v[1],
					len = Math.hypot(dx, dy);
				const count = Math.max(1, Math.floor(len / 42));
				for (let j = 0; j < count; j++) {
					const t = (j + 0.5) / count;
					beams.push({
						x: v[0] + dx * t,
						y: v[1] + dy * t,
						nx: (winding * dy) / len,
						ny: (-winding * dx) / len,
					});
				}
			});
			model = false;
			decoration = dirty = true;
		}
		function decorate() {
			floor.theme(p);
			dots.ctx.clearRect(0, 0, 18, 18);
			dots.ctx.fillStyle = p.muted;
			dots.ctx.fillRect(0, 0, 1.1, 1.1);
			pattern = c.createPattern(dots.canvas, 'repeat');
			const g = ink.ctx;
			g.setTransform(
				ink.canvas.width / b.w,
				0,
				0,
				ink.canvas.height / b.h,
				(-b.x * ink.canvas.width) / b.w,
				(-b.y * ink.canvas.height) / b.h,
			);
			g.clearRect(b.x, b.y, b.w, b.h);
			for (const it of unit.items) {
				g.save();
				g.translate(it.x + it.w / 2, it.y + it.d / 2);
				g.rotate((it.rot ?? 0) * rad);
				g.translate(-it.w / 2, -it.d / 2);
				for (const part of fittings(it)) {
					const x = part.x * it.w,
						y = part.y * it.d,
						width = part.w * it.w,
						depth = part.d * it.d;
					g.beginPath();
					g.roundRect(
						x,
						y,
						width,
						depth,
						Math.min(part.round ? Math.min(width, depth) / 2 : (it.r ?? 2), width / 2, depth / 2),
					);
					g.fillStyle = it.color;
					g.fill();
					g.fillStyle = part.tone > 1 ? 'white' : 'black';
					g.globalAlpha = Math.abs(part.tone - 1);
					g.fill();
					g.globalAlpha = 1;
				}
				g.restore();
			}
			for (const wall of pieces(unit, unit.ceiling)) {
				if (wall.bottom > 0 && !wall.glass) continue;
				g.beginPath();
				g.moveTo(...wall.a);
				g.lineTo(...wall.b);
				g.strokeStyle = wall.glass ? p.glass : p.wall;
				g.lineWidth = wall.glass ? 5 : wall.t;
				g.stroke();
			}
			for (const d of unit.doors ?? [])
				if (!d.glass) {
					const { hinge, leaf, arc } = doorGeom(d);
					g.strokeStyle = p.muted;
					g.lineWidth = 1.4;
					g.stroke(new Path2D(arc));
					g.beginPath();
					g.moveTo(...hinge);
					g.lineTo(...leaf);
					g.lineWidth = 3;
					g.stroke();
				}
			decoration = false;
			dirty = true;
		}
		const stage = surface(
			canvas,
			() => {
				if (model) rebuild();
				if (decoration) decorate();
				if (dirty) {
					floor.update({ sun, patches, dark, furniture, sunColor }, p);
					dirty = false;
				}
				c.setTransform(dpr, 0, 0, dpr, 0, 0);
				c.fillStyle = p.surface;
				c.fillRect(0, 0, w, h);
				if (grid && pattern) {
					const x = px % 18,
						y = py % 18;
					c.save();
					c.translate(x, y);
					c.fillStyle = pattern;
					c.globalAlpha = 0.3;
					c.fillRect(-x, -y, w, h);
					c.restore();
				}
				const angle = unit.bearing * rad,
					co = Math.abs(Math.cos(angle)),
					si = Math.abs(Math.sin(angle));
				const k = 0.86 * scale * Math.min(w / (b.w * co + b.h * si), h / (b.w * si + b.h * co));
				c.translate(w / 2 + px, h / 2 + py);
				c.scale(k, k);
				c.rotate(angle);
				c.translate(-b.cx, -b.cy);
				const az = (sun.azimuth - unit.bearing) * rad,
					sx = Math.sin(az),
					sy = -Math.cos(az);
				if (sun.altitude > 0 && dark < 1) {
					const col = sunColor || p.ochre;
					c.globalAlpha = 0.45 * (1 - dark);
					c.lineWidth = 2.5;
					c.lineCap = 'round';
					for (const q of beams)
						if (q.nx * sx + q.ny * sy > 0.12) {
							// Stop the exterior streak at the first boundary, including re-entrant corners.
							// RE:Aspect: long rays (2.2 m) that fade out away from the wall.
							let reach = 220;
							const a = unit.outline;
							for (let j = 0; j < a.length; j++) {
								const v = a[j],
									n = a[(j + 1) % a.length],
									dx = n[0] - v[0],
									dy = n[1] - v[1],
									den = sx * dy - sy * dx;
								if (Math.abs(den) < 1e-7) continue;
								const x = v[0] - q.x,
									y = v[1] - q.y,
									t = (x * dy - y * dx) / den,
									u = (x * sy - y * sx) / den;
								if (t > 0.01 && u >= 0 && u <= 1) reach = Math.min(t, reach);
							}
							const ex = q.x + sx * reach,
								ey = q.y + sy * reach,
								g = c.createLinearGradient(ex, ey, q.x, q.y);
							g.addColorStop(0, /^#[0-9a-f]{6}$/i.test(col) ? col + '00' : 'transparent');
							g.addColorStop(1, col);
							c.strokeStyle = g;
							c.beginPath();
							c.moveTo(ex, ey);
							c.lineTo(q.x, q.y);
							c.stroke();
						}
					c.globalAlpha = 1;
				}
				c.drawImage(floor.base, b.x, b.y, b.w, b.h);
				c.drawImage(floor.light, b.x, b.y, b.w, b.h);
				c.drawImage(ink.canvas, b.x, b.y, b.w, b.h);
				// RE:Aspect: only the part of a piece of furniture that's actually in the sun patch lights up
				// (a faint copy of the light on top), instead of tinting the whole object orange.
				if (sun.altitude > 0 && dark < 1) {
					c.globalAlpha = 0.35;
					c.drawImage(floor.light, b.x, b.y, b.w, b.h);
					c.globalAlpha = 1;
				}
				c.font = '500 ' + clamp(11 / k, 12, 38) + 'px system-ui';
				c.textAlign = 'center';
				c.textBaseline = 'middle';
				for (const room of unit.rooms) {
					c.save();
					c.translate(room.x, room.y);
					c.rotate(-angle);
					c.strokeStyle = p.floor;
					c.lineWidth = 3;
					c.strokeText(room.name, 0, 0);
					c.fillStyle = p.text;
					c.fillText(room.name, 0, 0);
					c.restore();
				}
				if (showSun && sun.altitude > 0) {
					const r = 0.47 * Math.min(b.w, b.h) * Math.cos(sun.altitude * rad);
					c.fillStyle = p.ochre;
					c.beginPath();
					c.arc(b.cx + sx * r, b.cy + sy * r, 7 / k, 0, 2 * Math.PI);
					c.fill();
				}
				if (dark > 0) {
					c.setTransform(dpr, 0, 0, dpr, 0, 0);
					// RE:Aspect: night = plain darkening (multiply keeps contrast; no blue wash).
					const v = Math.round(255 * (1 - 0.55 * dark));
					c.globalCompositeOperation = 'multiply';
					c.fillStyle = `rgb(${v},${v},${v})`;
					c.fillRect(0, 0, w, h);
					c.globalCompositeOperation = 'source-over';
				}
				// RE:Aspect: scale bar (bottom-left). k = CSS px per cm; pick a round length of 60–140 px.
				{
					const L = [50, 100, 200, 500, 1000, 2000].find((cm) => cm * k >= 60) ?? 2000;
					const len = L * k,
						x0 = 14,
						y0 = h - 16;
					c.setTransform(dpr, 0, 0, dpr, 0, 0);
					c.strokeStyle = p.text;
					c.fillStyle = p.text;
					c.globalAlpha = 0.75;
					c.lineWidth = 1.5;
					c.beginPath();
					c.moveTo(x0, y0 - 5);
					c.lineTo(x0, y0);
					c.lineTo(x0 + len, y0);
					c.lineTo(x0 + len, y0 - 5);
					c.stroke();
					c.font = '500 12px system-ui';
					c.textAlign = 'left';
					c.textBaseline = 'bottom';
					c.fillText(L >= 100 ? `${L / 100} m` : `${L} cm`, x0 + len + 6, y0 + 2);
					c.globalAlpha = 1;
				}
			},
			(width, height, ratio) => {
				w = width;
				h = height;
				dpr = ratio;
				canvas.width = Math.round(w * dpr);
				canvas.height = Math.round(h * dpr);
			},
			(colors) => {
				p = colors;
				decoration = true;
			},
		);
		invalidate = stage.invalidate;
		const off = planInput(
			canvas,
			(x, y) => {
				px += x;
				py += y;
				invalidate();
			},
			zoomBy,
			true,
		);
		return () => {
			off();
			stage.destroy();
			invalidate = () => {};
		};
	});
</script>

<div role="application" aria-label="North-up apartment plan. Drag or scroll to pan. Pinch to zoom.">
	<canvas bind:this={canvas}></canvas>
</div>

<style>
	div,
	canvas {
		display: block;
		width: 100%;
		height: 100%;
	}
	canvas {
		touch-action: none;
	}
</style>
