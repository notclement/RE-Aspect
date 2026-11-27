import * as T from './three.ts';
import { apartment } from './model.ts';
import { surface, planInput, palette } from './surface.ts';
import { navigation, walkingInput } from './walking.ts';
import { rad, clamp, type Lighting, type Unit } from './types.ts';

export interface Settings extends Lighting {
	unit: Unit;
	showSun: boolean;
	eye: number;
	speed: number;
	sensitivity: number;
	scale: number;
}
export function create(
	canvas: HTMLCanvasElement,
	stick: HTMLElement,
	walk: boolean,
	settings: () => Settings,
	zoom: (f: number) => void,
	exit: () => void,
) {
	const renderer = new T.WebGLRenderer({
		canvas,
		alpha: true,
		antialias: devicePixelRatio < 2,
		powerPreference: 'low-power',
	});
	renderer.setClearColor(0, 0);
	const scene = new T.Scene(),
		camera = new T.PerspectiveCamera(walk ? 67 : 39, 1, walk ? 2 : 5, 20000);
	camera.rotation.order = 'YXZ';
	let model: ReturnType<typeof apartment> | undefined,
		nav: ReturnType<typeof navigation> | undefined;
	let unit: Unit | undefined,
		colors = palette(canvas),
		dirty = true,
		themed = true;
	let az = 0,
		pitch = 0,
		tilt = 44 * rad,
		ratio = 0,
		width = 0,
		height = 0;
	let input: ReturnType<typeof walkingInput> | undefined;
	function reset() {
		az = (225 - (unit?.bearing ?? 0)) * rad;
		tilt = 44 * rad;
		stage.invalidate();
	}
	function draw(dt: number) {
		const s = settings();
		if (!model || unit !== s.unit) {
			model?.dispose();
			unit = s.unit;
			model = apartment(scene, unit, walk);
			nav = walk ? navigation(unit, model.parts, s.sun) : undefined;
			az = nav?.yaw ?? (225 - unit.bearing) * rad;
			pitch = walk ? -0.1 : 0;
			tilt = 44 * rad;
			themed = dirty = true;
		}
		if (dirty || themed) {
			model.update(s, colors, themed, s.showSun);
			dirty = themed = false;
		}
		let moving = false;
		if (walk && nav && input) {
			const axes = input.axes(),
				len = Math.hypot(axes.x, axes.y);
			if (len > 0 && s.speed > 0) {
				const beforeX = nav.x,
					beforeY = nav.y;
				const step = Math.min(500, dt * s.speed * 100) / Math.max(1, len);
				const dx = (axes.y * Math.sin(az) + axes.x * Math.cos(az)) * step;
				const dy = (-axes.y * Math.cos(az) + axes.x * Math.sin(az)) * step;
				const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 6));
				for (let i = 0; i < steps; i++) {
					if (nav.clear(nav.x + dx / steps, nav.y)) nav.x += dx / steps;
					if (nav.clear(nav.x, nav.y + dy / steps)) nav.y += dy / steps;
				}
				moving = dt === 0 || nav.x !== beforeX || nav.y !== beforeY;
			}
			camera.position.set(nav.x, clamp(s.eye, 3, s.unit.ceiling - 3), nav.y);
			camera.rotation.set(pitch, -az, 0, 'YXZ');
		} else {
			const b = model.b,
				targetY = Math.min(100, s.unit.ceiling * 0.32);
			// Enclose the complete footprint and wall tops, independent of orbit and aspect.
			const radius = Math.hypot(b.w / 2, b.h / 2, Math.min(230, s.unit.ceiling) - targetY);
			const fov = Math.atan(Math.tan((camera.fov * rad) / 2) * Math.min(1, camera.aspect));
			const dist = (radius * 1.025) / (Math.sin(fov) * s.scale),
				horizontal = dist * Math.cos(tilt);
			camera.position.set(
				b.cx + Math.sin(az) * horizontal,
				targetY + dist * Math.sin(tilt),
				b.cy - Math.cos(az) * horizontal,
			);
			camera.lookAt(b.cx, targetY, b.cy);
		}
		renderer.render(scene, camera);
		return moving;
	}
	const stage = surface(
		canvas,
		draw,
		(w, h, dpr) => {
			camera.aspect = w / h;
			camera.updateProjectionMatrix();
			if (ratio !== dpr || width !== w || height !== h) {
				ratio = dpr;
				width = w;
				height = h;
				renderer.setDrawingBufferSize(w, h, dpr);
			}
		},
		(p) => {
			colors = p;
			themed = true;
		},
		() => input?.stop(),
	);
	const off = walk
		? undefined
		: planInput(
				canvas,
				(dx, dy) => {
					az += dx * 0.006;
					tilt = clamp(tilt + dy * 0.005, 10 * rad, 85 * rad);
					stage.invalidate();
				},
				zoom,
			);
	if (walk)
		input = walkingInput(
			canvas,
			stick,
			stage.invalidate,
			(dx, dy) => {
				const k = 0.0022 * clamp(settings().sensitivity, 0.3, 3);
				az += dx * k;
				pitch = clamp(pitch - dy * k, -1.5, 1.5);
				stage.invalidate();
			},
			exit,
		);
	return {
		reset,
		lighting() {
			dirty = true;
			stage.invalidate();
		},
		invalidate: stage.invalidate,
		destroy() {
			stage.destroy();
			off?.();
			input?.destroy();
			model?.dispose();
			renderer.dispose();
			renderer.forceContextLoss();
		},
	};
}
