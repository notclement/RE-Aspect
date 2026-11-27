import type { Unit, Sun, Point } from './types.ts';
import { rad, clamp } from './types.ts';
import { distance, inside, type Piece, bounds } from './layout.ts';

export function navigation(u: Unit, parts: Piece[], sun: Sun) {
	const radius = 13;
	const barriers = parts.filter((w) => w.bottom < 150 && w.top > 5);
	const items = u.items
		.filter((it) => it.kind !== 'rug' && it.h > 3)
		.map((it) => ({
			x: it.x + it.w / 2,
			y: it.y + it.d / 2,
			hw: it.w / 2,
			hd: it.d / 2,
			c: Math.cos((it.rot ?? 0) * rad),
			s: Math.sin((it.rot ?? 0) * rad),
		}));
	function clear(x: number, y: number, solidItems = true) {
		if (!inside(x, y, u.outline)) return false;
		for (let i = 0; i < u.outline.length; i++)
			if (distance(x, y, u.outline[i], u.outline[(i + 1) % u.outline.length]) < radius)
				return false;
		for (const w of barriers) if (distance(x, y, w.a, w.b) < radius + w.t / 2) return false;
		// RE:Aspect: furniture only matters for choosing the start spot; you can walk through it (not walls).
		if (solidItems) for (const it of items) {
			const dx = x - it.x,
				dy = y - it.y;
			if (
				Math.hypot(
					Math.max(0, Math.abs(dx * it.c + dy * it.s) - it.hw),
					Math.max(0, Math.abs(dy * it.c - dx * it.s) - it.hd),
				) < radius
			)
				return false;
		}
		return true;
	}
	const b = bounds(u),
		rooms = u.rooms.length ? u.rooms : [{ name: '', x: b.cx, y: b.cy }];
	const polygons = rooms.map((r) =>
		u.windows.map((w) => w.room).find((p) => p && inside(r.x, r.y, p)),
	);
	const count = rooms.map(() => 0),
		best = rooms.map(() => Infinity),
		spots: (Point | undefined)[] = rooms.map(() => undefined);
	function roomAt(x: number, y: number) {
		const known = polygons.findIndex((p) => p && inside(x, y, p));
		if (known >= 0) return known;
		let idx = 0,
			min = Infinity;
		rooms.forEach((r, i) => {
			const d = (x - r.x) ** 2 + (y - r.y) ** 2;
			if (d < min) {
				min = d;
				idx = i;
			}
		});
		return idx;
	}
	const step = Math.max(12, Math.max(b.w, b.h) / 64);
	function sample(x: number, y: number, area: boolean) {
		if (!inside(x, y, u.outline)) return;
		const i = roomAt(x, y);
		if (area) count[i]++;
		const d = (x - rooms[i].x) ** 2 + (y - rooms[i].y) ** 2;
		if (d < best[i] && clear(x, y)) {
			spots[i] = [x, y];
			best[i] = d;
		}
	}
	rooms.forEach((r) => sample(r.x, r.y, false));
	for (let y = b.y + step / 2; y < b.y + b.h; y += step)
		for (let x = b.x + step / 2; x < b.x + b.w; x += step) sample(x, y, true);
	let selected = -1;
	count.forEach((n, i) => {
		if (spots[i] && (selected < 0 || n > count[selected])) selected = i;
	});
	const spawn = spots[selected] ?? [b.cx, b.cy],
		az = (sun.azimuth - u.bearing) * rad;
	let yaw = 0,
		score = -Infinity;
	for (const w of u.windows) {
		const x = (w.a[0] + w.b[0]) / 2,
			y = (w.a[1] + w.b[1]) / 2;
		const local = roomAt(x - w.normal[0] * 8, y - w.normal[1] * 8) === selected;
		const exposure = Math.max(0, Math.sin(az) * w.normal[0] - Math.cos(az) * w.normal[1]);
		const value =
			(local ? 1e9 : 0) +
			(sun.altitude > 0 ? exposure : 0) *
				Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]) *
				(w.head - w.sill) -
			0.001 * Math.hypot(x - spawn[0], y - spawn[1]);
		if (value > score) {
			score = value;
			yaw = Math.atan2(x - spawn[0], spawn[1] - y);
		}
	}
	// RE:Aspect: step back from that window (up to 4.5 m, staying clear of walls/furniture) so you start
	// looking across the room at it, not with your nose on the glass.
	let sx = spawn[0],
		sy = spawn[1];
	const bx = -Math.sin(yaw),
		by = Math.cos(yaw);
	for (let t = 15; t <= 450; t += 15) {
		const x = spawn[0] + bx * t,
			y = spawn[1] + by * t;
		if (!inside(x, y, u.outline) || !clear(x, y)) break;
		sx = x;
		sy = y;
	}
	return { x: sx, y: sy, yaw, clear: (x: number, y: number) => clear(x, y, false) };
}
export function walkingInput(
	canvas: HTMLCanvasElement,
	stick: HTMLElement,
	invalidate: () => void,
	look: (dx: number, dy: number) => void,
	exit: () => void,
) {
	const ac = new AbortController(),
		o = { signal: ac.signal },
		keys = new Set<string>();
	const codes = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
	let oldLock = false,
		exited = false,
		alive = true,
		drag = -1,
		x = 0,
		y = 0,
		thumb = -1,
		ox = 0,
		oy = 0;
	const axes = { x: 0, y: 0 },
		combined = { x: 0, y: 0 };
	function leave() {
		if (exited || !alive) return;
		exited = true;
		if (document.pointerLockElement === canvas) document.exitPointerLock();
		exit();
	}
	canvas.addEventListener(
		'keydown',
		(e) => {
			if (e.code === 'Escape') {
				e.preventDefault();
				leave();
				return;
			}
			if (codes.includes(e.code)) {
				if (keys.has(e.code)) {
					e.preventDefault();
					return;
				}
				keys.add(e.code);
				e.preventDefault();
				invalidate();
			}
		},
		o,
	);
	window.addEventListener(
		'keyup',
		(e) => {
			if (keys.delete(e.code) && keys.size) invalidate();
		},
		o,
	);
	document.addEventListener(
		'pointerlockchange',
		() => {
			const locked = document.pointerLockElement === canvas;
			if (oldLock && !locked) leave();
			oldLock = locked;
		},
		o,
	);
	document.addEventListener(
		'mousemove',
		(e) => {
			if (document.pointerLockElement === canvas) look(e.movementX, e.movementY);
		},
		o,
	);
	canvas.addEventListener(
		'click',
		(e) => {
			if (e.pointerType !== 'mouse' || !canvas.requestPointerLock) return;
			exited = false;
			try {
				const pending = canvas.requestPointerLock();
				pending?.catch(() => {});
			} catch {
				/* Drag look remains available. */
			}
		},
		o,
	);
	canvas.addEventListener(
		'pointerdown',
		(e) => {
			if (e.button || drag !== -1) return;
			canvas.focus({ preventScroll: true });
			drag = e.pointerId;
			x = e.clientX;
			y = e.clientY;
			canvas.setPointerCapture(drag);
		},
		o,
	);
	canvas.addEventListener(
		'pointermove',
		(e) => {
			if (drag !== e.pointerId || document.pointerLockElement === canvas) return;
			look(e.clientX - x, e.clientY - y);
			x = e.clientX;
			y = e.clientY;
		},
		o,
	);
	canvas.addEventListener(
		'lostpointercapture',
		() => {
			drag = -1;
		},
		o,
	);
	stick.addEventListener(
		'pointerdown',
		(e) => {
			if (thumb !== -1) return;
			e.preventDefault();
			thumb = e.pointerId;
			stick.setPointerCapture(thumb);
			const rect = stick.getBoundingClientRect();
			ox = rect.left + rect.width / 2;
			oy = rect.top + rect.height / 2;
			joystick(e);
		},
		o,
	);
	function joystick(e: PointerEvent) {
		if (thumb !== e.pointerId) return;
		const dx = (e.clientX - ox) / 30,
			dy = (oy - e.clientY) / 30,
			n = Math.max(1, Math.hypot(dx, dy));
		axes.x = dx / n;
		axes.y = dy / n;
		stick.style.setProperty('--jx', axes.x * 23 + 'px');
		stick.style.setProperty('--jy', -axes.y * 23 + 'px');
		invalidate();
	}
	function center() {
		thumb = -1;
		axes.x = axes.y = 0;
		stick.style.removeProperty('--jx');
		stick.style.removeProperty('--jy');
	}
	stick.addEventListener('pointermove', joystick, o);
	stick.addEventListener('lostpointercapture', center, o);
	function stop() {
		keys.clear();
		center();
		drag = -1;
	}
	window.addEventListener('blur', stop, o);
	canvas.addEventListener('blur', stop, o);
	return {
		stop,
		axes() {
			combined.x = clamp(
				(thumb < 0 ? 0 : axes.x) +
					Number(keys.has('KeyD') || keys.has('ArrowRight')) -
					Number(keys.has('KeyA') || keys.has('ArrowLeft')),
				-1,
				1,
			);
			combined.y = clamp(
				(thumb < 0 ? 0 : axes.y) +
					Number(keys.has('KeyW') || keys.has('ArrowUp')) -
					Number(keys.has('KeyS') || keys.has('ArrowDown')),
				-1,
				1,
			);
			return combined;
		},
		destroy() {
			alive = false;
			ac.abort();
			if (document.pointerLockElement === canvas) document.exitPointerLock();
		},
	};
}
