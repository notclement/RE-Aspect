/**
 * Svelte action: gentle two-finger zoom (+ one-finger pan once zoomed) for an image stage, e.g. the
 * "turn the floor plan so north is up" screens. Writes CSS variables --z, --px, --py on the node;
 * the image uses them: transform: translate(var(--px), var(--py)) scale(var(--z)) rotate(…).
 * Damped (half as fast as the fingers) and clamped 1–3×. Page zoom stays blocked elsewhere.
 */
export function pinchZoom(node: HTMLElement) {
	const pts = new Map<number, { x: number; y: number }>();
	let z = 1;
	let px = 0;
	let py = 0;
	const apply = () => {
		node.style.setProperty('--z', String(z));
		node.style.setProperty('--px', `${px}px`);
		node.style.setProperty('--py', `${py}px`);
	};
	const clampPan = () => {
		const mx = ((z - 1) * node.clientWidth) / 2;
		const my = ((z - 1) * node.clientHeight) / 2;
		px = Math.max(-mx, Math.min(mx, px));
		py = Math.max(-my, Math.min(my, py));
	};
	const down = (e: PointerEvent) => {
		node.setPointerCapture(e.pointerId);
		pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
	};
	const move = (e: PointerEvent) => {
		const prev = pts.get(e.pointerId);
		if (!prev) return;
		if (pts.size >= 2) {
			const other = [...pts.entries()].find(([id]) => id !== e.pointerId)?.[1];
			pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
			if (!other) return;
			const before = Math.hypot(prev.x - other.x, prev.y - other.y);
			const after = Math.hypot(e.clientX - other.x, e.clientY - other.y);
			if (before > 10 && after > 10) z = Math.max(1, Math.min(3, z * Math.sqrt(after / before)));
		} else {
			pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
			if (z > 1) {
				px += e.clientX - prev.x;
				py += e.clientY - prev.y;
			}
		}
		clampPan();
		apply();
	};
	const up = (e: PointerEvent) => {
		pts.delete(e.pointerId);
	};
	const wheel = (e: WheelEvent) => {
		if (!e.ctrlKey) return; // trackpad pinch only
		e.preventDefault();
		z = Math.max(1, Math.min(3, z * Math.exp(-e.deltaY * 0.004)));
		clampPan();
		apply();
	};
	node.style.touchAction = 'none';
	apply();
	node.addEventListener('pointerdown', down);
	node.addEventListener('pointermove', move);
	node.addEventListener('pointerup', up);
	node.addEventListener('pointercancel', up);
	node.addEventListener('wheel', wheel, { passive: false });
	return {
		destroy() {
			node.removeEventListener('pointerdown', down);
			node.removeEventListener('pointermove', move);
			node.removeEventListener('pointerup', up);
			node.removeEventListener('pointercancel', up);
			node.removeEventListener('wheel', wheel);
		}
	};
}
