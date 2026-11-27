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
		// RE:Aspect: wider lens for the 3D plan (39° felt flat and cramped); Walk's lens is set from the aspect below.
		camera = new T.PerspectiveCamera(walk ? 75 : 50, 1, walk ? 2 : 5, 20000);
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
		tilt = 56 * rad;
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
			tilt = 56 * rad;
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
			place(s.scale);
		}
		renderer.render(scene, camera);
		return moving;
	}
	/** Orbit camera for a zoom scale (RE:Aspect: split out so "fit" can measure it). */
	function place(scale: number) {
		const s = settings();
		if (!model) return;
		{
			const b = model.b,
				targetY = Math.min(100, s.unit.ceiling * 0.32);
			// Enclose the complete footprint and wall tops, independent of orbit and aspect.
			// RE:Aspect: fit the footprint more tightly so the unit fills the view (was a loose bounding sphere).
			const radius = Math.hypot(b.w / 2, b.h / 2) * 0.82 + Math.min(230, s.unit.ceiling) * 0.15;
			const fov = Math.atan(Math.tan((camera.fov * rad) / 2) * Math.min(1, camera.aspect));
			const dist = radius / (Math.sin(fov) * scale),
				horizontal = dist * Math.cos(tilt);
			camera.position.set(
				b.cx + Math.sin(az) * horizontal,
				targetY + dist * Math.sin(tilt),
				b.cy - Math.cos(az) * horizontal,
			);
			camera.lookAt(b.cx, targetY, b.cy);
		}
	}
	/** RE:Aspect: the zoom scale at which the whole unit (floor to wall tops) fills ~90 % of the view. */
	function fitScale(): number | null {
		const s = settings();
		if (!model || walk || !width || !height) return null;
		const b = model.b,
			hTop = s.unit.ceiling;
		const v = new T.Vector3();
		let scale = 1;
		for (let i = 0; i < 5; i++) {
			place(scale);
			camera.updateMatrixWorld();
			let m = 0;
			for (const x of [b.x, b.x + b.w])
				for (const z of [b.y, b.y + b.h])
					for (const y of [0, hTop]) {
						v.set(x, y, z).project(camera);
						m = Math.max(m, Math.abs(v.x), Math.abs(v.y));
					}
			if (!(m > 0)) break;
			scale = clamp(scale * (0.9 / m), 0.7, 2.5);
		}
		return scale;
	}
	const stage = surface(
		canvas,
		draw,
		(w, h, dpr) => {
			camera.aspect = w / h;
			// RE:Aspect: Walk keeps a wide ~100° horizontal view whatever the screen shape (vertical 60–90°).
			if (walk) camera.fov = clamp((2 * Math.atan(Math.tan(50 * rad) / camera.aspect)) / rad, 60, 90);
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
		fitScale,
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
