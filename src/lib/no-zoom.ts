/**
 * Block browser page zoom app-wide: two-finger pinch (iOS ignores maximum-scale, so we stop the
 * gesture events), trackpad pinch on laptops (ctrl+wheel) and double-tap zoom. Our own canvases
 * still get their pointer events; zoom in the app is done with + / − buttons only.
 */
export function blockPageZoom(): () => void {
	const stop = (e: Event) => e.preventDefault();
	const touch = (e: TouchEvent) => {
		if (e.touches.length > 1) e.preventDefault();
	};
	const wheel = (e: WheelEvent) => {
		if (e.ctrlKey) e.preventDefault(); // trackpad pinch / ctrl+scroll
	};
	const opts = { passive: false } as const;
	document.addEventListener('gesturestart', stop, opts); // iOS Safari
	document.addEventListener('gesturechange', stop, opts);
	document.addEventListener('gestureend', stop, opts);
	document.addEventListener('touchmove', touch, opts);
	window.addEventListener('wheel', wheel, opts);
	return () => {
		document.removeEventListener('gesturestart', stop);
		document.removeEventListener('gesturechange', stop);
		document.removeEventListener('gestureend', stop);
		document.removeEventListener('touchmove', touch);
		window.removeEventListener('wheel', wheel);
	};
}
