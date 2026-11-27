import { clamp } from './types.ts';
const defaults = {
	floor: '#e9dfcb',
	'floor-line': '#cfc1a6',
	wall: '#3a4139',
	'wall-top': '#59625a',
	glass: '#9fb8b9',
	balcony: '#d2d5c7',
	ochre: '#F6C453',
	forest: '#476551',
	muted: '#788076',
	text: '#333d37',
	surface: '#f6f5f0',
};
export type Palette = typeof defaults;
export function palette(el: Element): Palette {
	const style = getComputedStyle(el),
		colors = { ...defaults };
	for (const key of Object.keys(colors) as (keyof Palette)[]) {
		colors[key] = style.getPropertyValue('--' + key).trim() || defaults[key];
	}
	return colors;
}
// All three canvases share the same resize, theme, visibility and invalidation policy.
export function surface(
	canvas: HTMLCanvasElement,
	draw: (dt: number) => boolean | void,
	resize: (w: number, h: number, dpr: number) => void,
	theme: (p: Palette) => void,
	stop: () => void = () => {},
) {
	let visible = false,
		disposed = false,
		frame = 0,
		last = 0,
		w = 0,
		h = 0;
	let previous: Palette | undefined;
	let limit = 2,
		slow = 0,
		themeDirty = true,
		sized = false,
		currentDpr = 0;
	function invalidate() {
		if (!disposed && visible && !document.hidden && !frame && w && h)
			frame = requestAnimationFrame(tick);
	}
	function tick(now: number) {
		frame = 0;
		const gap = last ? now - last : 0;
		last = now;
		if (gap > 20 && gap < 90) slow++;
		else slow = Math.max(0, slow - 1);
		if (slow >= 8 && limit > 1.5) {
			limit = 1.5;
			sized = false;
		}
		const ratio = Math.min(
			devicePixelRatio || 1,
			limit,
			2048 / Math.max(w, h),
			Math.sqrt((devicePixelRatio < 2 ? 1200000 : 3000000) / (w * h)),
		);
		if (!sized || ratio !== currentDpr) {
			resize(w, h, ratio);
			sized = true;
			currentDpr = ratio;
		}
		if (draw(Math.min(gap / 1000, 0.05))) invalidate();
	}
	function refresh() {
		if (!visible || document.hidden) {
			cancelAnimationFrame(frame);
			frame = last = 0;
			stop();
			return;
		}
		if (themeDirty) {
			themeDirty = false;
			const next = palette(canvas);
			if (
				!previous ||
				(Object.keys(next) as (keyof Palette)[]).some((k) => previous?.[k] !== next[k])
			) {
				theme(next);
				previous = next;
			}
		}
		invalidate();
	}
	function changed() {
		themeDirty = true;
		refresh();
	}
	const io = new IntersectionObserver(([entry]) => {
		visible = entry.isIntersecting;
		refresh();
	});
	const ro = new ResizeObserver(([entry]) => {
		w = entry.contentRect.width;
		h = entry.contentRect.height;
		sized = false;
		invalidate();
	});
	const mo = new MutationObserver((records) => {
		if (
			records.some(
				(r) => r.target !== canvas || (r.attributeName !== 'width' && r.attributeName !== 'height'),
			)
		)
			changed();
	});
	for (let el: Element | null = canvas; el; el = el.parentElement)
		mo.observe(el, { attributes: true });
	mo.observe(document.head, {
		childList: true,
		subtree: true,
		characterData: true,
		attributes: true,
	});
	const media = matchMedia('(prefers-color-scheme: dark)');
	media.addEventListener('change', changed);
	document.addEventListener('visibilitychange', refresh);
	window.addEventListener('resize', changed);
	canvas.addEventListener('transitionend', changed);
	io.observe(canvas);
	ro.observe(canvas);
	return {
		invalidate,
		destroy() {
			disposed = true;
			cancelAnimationFrame(frame);
			io.disconnect();
			ro.disconnect();
			mo.disconnect();
			document.removeEventListener('visibilitychange', refresh);
			media.removeEventListener('change', changed);
			window.removeEventListener('resize', changed);
			canvas.removeEventListener('transitionend', changed);
		},
	};
}
export function planInput(
	canvas: HTMLCanvasElement,
	drag: (x: number, y: number) => void,
	zoom: (f: number) => void,
	wheelPan = false,
) {
	const points = new Map<number, { x: number; y: number }>(),
		ac = new AbortController(),
		opts = { signal: ac.signal };
	canvas.addEventListener(
		'pointerdown',
		(e) => {
			if (e.button || points.size >= 2) return;
			canvas.setPointerCapture(e.pointerId);
			points.set(e.pointerId, { x: e.clientX, y: e.clientY });
		},
		opts,
	);
	canvas.addEventListener(
		'pointermove',
		(e) => {
			const p = points.get(e.pointerId);
			if (!p) return;
			if (points.size === 2) {
				for (const q of points.values())
					if (q !== p) {
						const prev = Math.hypot(p.x - q.x, p.y - q.y),
							next = Math.hypot(e.clientX - q.x, e.clientY - q.y);
						if (prev > 2 && next > 2) zoom(Math.sqrt(next / prev));
					}
			} else drag(e.clientX - p.x, e.clientY - p.y);
			p.x = e.clientX;
			p.y = e.clientY;
		},
		opts,
	);
	const end = (e: PointerEvent) => {
		points.delete(e.pointerId);
	};
	canvas.addEventListener('pointerup', end, opts);
	canvas.addEventListener('lostpointercapture', end, opts);
	canvas.addEventListener('pointercancel', end, opts);
	canvas.addEventListener(
		'wheel',
		(e) => {
			if (!e.ctrlKey && !wheelPan) return;
			e.preventDefault();
			const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
			// RE:Aspect: trackpad pinch / ctrl+scroll = gentle zoom (was ignored).
			if (e.ctrlKey) zoom(Math.exp(-clamp(e.deltaY * k, -50, 50) * 0.0025));
			else drag(-e.deltaX * k, -e.deltaY * k);
		},
		{ ...opts, passive: false },
	);
	return () => ac.abort();
}
