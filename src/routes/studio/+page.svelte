<script lang="ts">
	/**
	 * Studio — fix and finish a project's plan. Mobile-first, one SVG canvas in cm, tools at the bottom.
	 *   Move     · tap to select; drag furniture / window ends; drag empty space to pan; zoom with + / − (no pinch)
	 *   Outline  · tap the unit's corners on the floor plan, tap the first corner to close (scale comes from sq ft)
	 *   Wall     · tap start, tap end (snaps to straight lines)
	 *   Window   · tap an outside wall to add a window; glass ⅓ · ½ · ⅔
	 *   Door     · tap any wall to add a door (hinged, or full-height sliding glass); flip the swing
	 *   Furniture· pick from presets; move, rotate to any angle (drag the round handle, ±15°, or type it), exact size
	 * Every change autosaves; undo/redo. No sun preview here — that's on the project page.
	 */
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import Icon, { type IconName } from '#lib/components/Icon.svelte';
	import { nav } from '#lib/stores/nav.svelte.ts';
	import { getProject, updateProject, flush } from '#lib/stores/projects.svelte.ts';
	import { loadFloorPlan, type FloorPlanImage } from '#lib/floorplan-store.ts';
	import { emptyPlan, sanitizePlan, area, outlineEdges, segDist, GLASS_OPTIONS, type PlanData, type Pt } from '#lib/plan.ts';
	import { itemCorners, itemTransform, doorGeom } from '#lib/sample-unit.ts';
	import { PRESETS, KIND_LABEL } from '#lib/studio/furniture.ts';
	import { validateNumber } from '#lib/validate.ts';
	import { getSupabase, supabaseConfigured } from '#lib/supabase.ts';
	import { auth } from '#lib/stores/auth.svelte.ts';
	import { fnError } from '#lib/fn-error.ts';
	import { profile } from '#lib/stores/profile.svelte.ts';
	import Spinner from '#lib/components/Spinner.svelte';

	const id = page.url.searchParams.get('id');
	const aiState = page.url.searchParams.get('ai');
	const project = getProject(id);
	$effect(() => nav.set({ label: 'Projects', href: '/' }, { label: project?.name ?? 'Studio', href: project ? `/unit?id=${project.id}` : undefined }, { label: 'Studio' }));

	// ── plan state + history ─────────────────────────────────────────────────
	let plan = $state<PlanData>(sanitizePlan(project?.plan) ?? emptyPlan());
	let past: string[] = [];
	let future: string[] = [];
	let canUndo = $state(false);
	let canRedo = $state(false);
	const snap = () => JSON.stringify(plan);

	function commit(before: string) {
		if (before === snap()) return;
		past.push(before);
		if (past.length > 60) past.shift();
		future = [];
		canUndo = true;
		canRedo = false;
		save();
	}
	function undo() {
		const prev = past.pop();
		if (!prev) return;
		future.push(snap());
		plan = JSON.parse(prev);
		sel = null;
		canUndo = past.length > 0;
		canRedo = true;
		save();
	}
	function redo() {
		const nxt = future.pop();
		if (!nxt) return;
		past.push(snap());
		plan = JSON.parse(nxt);
		sel = null;
		canUndo = true;
		canRedo = future.length > 0;
		save();
	}
	let savedAt = $state<'saved' | 'saving'>('saved');
	let saveTimer: ReturnType<typeof setTimeout> | undefined;
	function save() {
		if (!project) return;
		savedAt = 'saving';
		updateProject(project.id, { plan: $state.snapshot(plan) as PlanData, status: plan.outline.length >= 3 ? 'ready' : project.status === 'processing' ? 'failed' : project.status }, 800);
		clearTimeout(saveTimer);
		saveTimer = setTimeout(() => (savedAt = 'saved'), 900);
	}

	// ── backdrop (floor plan image, on this device only) ─────────────────────
	let backdrop = $state<FloorPlanImage | null>(null);
	let showBackdrop = $state(true);
	const imgScale = $derived(plan.imageScale ?? (backdrop ? 1000 / backdrop.w : 1));

	// ── view (viewBox in cm) ─────────────────────────────────────────────────
	let svg = $state<SVGSVGElement>();
	let vb = $state({ x: -100, y: -100, w: 1400, h: 1000 });
	function fit() {
		const pts: Pt[] = [...plan.outline, ...plan.items.flatMap((i) => itemCorners(i))];
		if (backdrop && showBackdrop) pts.push([0, 0], [backdrop.w * imgScale, backdrop.h * imgScale]);
		if (pts.length < 2) return;
		const xs = pts.map((p) => p[0]);
		const ys = pts.map((p) => p[1]);
		const pad = 80;
		const x = Math.min(...xs) - pad;
		const y = Math.min(...ys) - pad;
		vb = { x, y, w: Math.max(...xs) - x + pad, h: Math.max(...ys) - y + pad };
	}
	const pxToCm = () => (svg ? vb.w / Math.max(1, svg.clientWidth) : 1);
	function toCm(cx: number, cy: number): Pt {
		const m = svg!.getScreenCTM()!.inverse();
		const p = new DOMPoint(cx, cy).matrixTransform(m);
		return [p.x, p.y];
	}
	function zoomAt(f: number, at: Pt) {
		const nw = Math.min(6000, Math.max(150, vb.w * f));
		const k = nw / vb.w;
		vb = { x: at[0] - (at[0] - vb.x) * k, y: at[1] - (at[1] - vb.y) * k, w: nw, h: vb.h * k };
	}

	// ── tools ────────────────────────────────────────────────────────────────
	type Mode = 'move' | 'outline' | 'wall' | 'window' | 'door';
	let mode = $state<Mode>((project?.plan?.outline.length ?? 0) >= 3 ? 'move' : 'outline');
	let draft = $state<Pt[]>([]); // outline in progress
	let wallStart = $state<Pt | null>(null);
	let hover = $state<Pt | null>(null);
	type Sel = { t: 'item' | 'window' | 'door' | 'wall'; i: number } | null;
	let sel = $state<Sel>(null);
	let sheet = $state<'furniture' | 'size' | null>(null);
	let toast = $state<string | null>(
		aiState === 'ok'
			? 'AI traced your plan — check the windows and furniture.'
			: aiState === 'manual'
				? "Couldn't auto-trace this plan. Tap each corner of the unit to outline it."
				: null
	);
	if (aiState) setTimeout(() => (toast = null), 6000);

	const HINT: Record<Mode, string> = {
		move: 'Tap to select · drag to move · + / − to zoom',
		outline: 'Tap each corner of the unit · tap the first corner to finish',
		wall: 'Tap where the wall starts, then where it ends',
		window: 'Tap an outside wall to add a window',
		door: 'Tap any wall to add a door'
	};

	function snapPt(p: Pt, from: Pt | null): Pt {
		const tol = 14 * pxToCm();
		// snap to existing corners first
		const corners = [...plan.outline, ...draft, ...plan.walls.flatMap((w) => [w.a, w.b])];
		for (const c of corners) if (Math.hypot(c[0] - p[0], c[1] - p[1]) < tol) return [c[0], c[1]];
		if (!from) return p;
		// then to straight lines (0 / 45 / 90°)
		const dx = p[0] - from[0];
		const dy = p[1] - from[1];
		const len = Math.hypot(dx, dy);
		const ang = Math.atan2(dy, dx);
		const step = Math.PI / 4;
		const snapped = Math.round(ang / step) * step;
		if (Math.abs(snapped - ang) < (8 * Math.PI) / 180) return [from[0] + Math.cos(snapped) * len, from[1] + Math.sin(snapped) * len];
		return p;
	}

	function closeOutline() {
		const before = snap();
		let pts = draft.map((p) => [Math.round(p[0]), Math.round(p[1])] as Pt);
		// Scale from the unit size: the traced outline's area should match the sq ft entered.
		const real = (project?.sizeSqft ?? 0) * 929.03;
		const traced = area(pts);
		let k = 1;
		if (real > 0 && traced > 0 && !plan.outline.length) k = Math.sqrt(real / traced);
		if (Math.abs(k - 1) > 0.01) {
			const s = (p: Pt): Pt => [Math.round(p[0] * k), Math.round(p[1] * k)];
			pts = pts.map(s);
			plan.walls = plan.walls.map((w) => ({ ...w, a: s(w.a), b: s(w.b) }));
			plan.windows = plan.windows.map((w) => ({ ...w, a: s(w.a), b: s(w.b) }));
			plan.doors = plan.doors.map((d) => ({ ...d, a: s(d.a), b: s(d.b) }));
			plan.items = plan.items.map((i) => ({ ...i, x: Math.round(i.x * k), y: Math.round(i.y * k) }));
		}
		plan.outline = pts;
		if (backdrop) plan.imageScale = imgScale * k;
		draft = [];
		mode = 'window';
		commit(before);
		toast = 'Outline done. Now tap the outside walls to add windows.';
		setTimeout(() => (toast = null), 4000);
		fit();
	}

	function nearestEdge(p: Pt, inner = false): { a: Pt; b: Pt; t: number; dist: number } | null {
		let best: { a: Pt; b: Pt; t: number; dist: number } | null = null;
		const segs: [Pt, Pt][] = [...outlineEdges(plan.outline), ...(inner ? plan.walls.map((w) => [w.a, w.b] as [Pt, Pt]) : [])];
		for (const [a, b] of segs) {
			const dx = b[0] - a[0];
			const dy = b[1] - a[1];
			const L2 = dx * dx + dy * dy || 1;
			const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2));
			const q: Pt = [a[0] + dx * t, a[1] + dy * t];
			const dist = Math.hypot(p[0] - q[0], p[1] - q[1]);
			if (!best || dist < best.dist) best = { a, b, t, dist };
		}
		return best;
	}
	const lerp = (a: Pt, b: Pt, t: number): Pt => [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t)];

	function addWindowAt(p: Pt) {
		const e = nearestEdge(p);
		if (!e || e.dist > 40 * pxToCm()) {
			toast = 'Tap closer to an outside wall.';
			setTimeout(() => (toast = null), 2500);
			return;
		}
		const len = Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]);
		const half = Math.min(60, len * 0.4) / len;
		const t0 = Math.max(0, e.t - half);
		const t1 = Math.min(1, e.t + half);
		const before = snap();
		plan.windows.push({ a: lerp(e.a, e.b, t0), b: lerp(e.a, e.b, t1), glass: 2 / 3 });
		sel = { t: 'window', i: plan.windows.length - 1 };
		commit(before);
	}

	function addDoorAt(p: Pt) {
		const e = nearestEdge(p, true);
		if (!e || e.dist > 40 * pxToCm()) {
			toast = plan.outline.length < 3 && !plan.walls.length ? 'Trace the outline or a wall first.' : 'Tap closer to a wall.';
			setTimeout(() => (toast = null), 2500);
			return;
		}
		const len = Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]);
		const half = Math.min(45, len * 0.45) / len;
		const t0 = Math.max(0, e.t - half);
		const t1 = Math.min(1, e.t + half);
		const before = snap();
		plan.doors.push({ a: lerp(e.a, e.b, t0), b: lerp(e.a, e.b, t1), glass: false, flip: 0 });
		sel = { t: 'door', i: plan.doors.length - 1 };
		commit(before);
	}

	/** Is p inside item i (rotation aware)? */
	function inItem(p: Pt, i: number) {
		const it = plan.items[i];
		const cx = it.x + it.w / 2;
		const cy = it.y + it.d / 2;
		const r = (-(it.rot ?? 0) * Math.PI) / 180;
		const dx = p[0] - cx;
		const dy = p[1] - cy;
		const lx = dx * Math.cos(r) - dy * Math.sin(r);
		const ly = dx * Math.sin(r) + dy * Math.cos(r);
		return Math.abs(lx) <= it.w / 2 && Math.abs(ly) <= it.d / 2;
	}
	/** Where the rotate handle of a selected item sits (beyond its "top" edge, following the rotation). */
	function spinHandle(i: number): { c: Pt; h: Pt; edge: Pt } {
		const it = plan.items[i];
		const c: Pt = [it.x + it.w / 2, it.y + it.d / 2];
		const r = ((it.rot ?? 0) * Math.PI) / 180;
		const up: Pt = [Math.sin(r), -Math.cos(r)];
		const off = it.d / 2 + handleR * 4;
		return { c, h: [c[0] + up[0] * off, c[1] + up[1] * off], edge: [c[0] + (up[0] * it.d) / 2, c[1] + (up[1] * it.d) / 2] };
	}

	function hitTest(p: Pt): Sel {
		const tol = 18 * pxToCm();
		for (let i = plan.doors.length - 1; i >= 0; i--) {
			const d = plan.doors[i];
			if (segDist(p, d.a, d.b) < tol) return { t: 'door', i };
		}
		for (let i = plan.windows.length - 1; i >= 0; i--) {
			const w = plan.windows[i];
			if (segDist(p, w.a, w.b) < tol) return { t: 'window', i };
		}
		for (let i = plan.items.length - 1; i >= 0; i--) {
			if (inItem(p, i)) return { t: 'item', i };
		}
		for (let i = plan.walls.length - 1; i >= 0; i--) {
			const w = plan.walls[i];
			if (segDist(p, w.a, w.b) < tol) return { t: 'wall', i };
		}
		return null;
	}

	// ── pointer handling (pan, pinch, tap, drag) ─────────────────────────────
	const pointers = new Map<number, { x: number; y: number }>();
	let gesture:
		| { kind: 'pan'; sx: number; sy: number; vb0: typeof vb }
		| { kind: 'pinch'; d0: number; vb0: typeof vb; mid: Pt }
		| { kind: 'item'; i: number; off: Pt; before: string }
		| { kind: 'handle'; t: 'window' | 'door'; i: number; end: 'a' | 'b'; before: string }
		| { kind: 'spin'; i: number; before: string }
		| null = null;
	let downAt = { x: 0, y: 0, moved: false };

	function onDown(e: PointerEvent) {
		svg!.setPointerCapture(e.pointerId);
		pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
		if (pointers.size === 2) {
			const [a, b] = [...pointers.values()];
			// Two fingers: no pinch-zoom (zoom is on the + / − buttons). Just ignore the gesture.
			gesture = { kind: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y), vb0: { ...vb }, mid: toCm((a.x + b.x) / 2, (a.y + b.y) / 2) };
			downAt.moved = true;
			return;
		}
		downAt = { x: e.clientX, y: e.clientY, moved: false };
		const p = toCm(e.clientX, e.clientY);
		if (mode === 'move') {
			const tol = 22 * pxToCm();
			// end handles of the selected window / door
			if (sel?.t === 'window' || sel?.t === 'door') {
				const w = sel.t === 'window' ? plan.windows[sel.i] : plan.doors[sel.i];
				for (const end of ['a', 'b'] as const) {
					if (Math.hypot(w[end][0] - p[0], w[end][1] - p[1]) < tol) {
						gesture = { kind: 'handle', t: sel.t, i: sel.i, end, before: snap() };
						return;
					}
				}
			}
			// rotate handle of the selected furniture
			if (sel?.t === 'item') {
				const { h } = spinHandle(sel.i);
				if (Math.hypot(h[0] - p[0], h[1] - p[1]) < tol * 1.3) {
					gesture = { kind: 'spin', i: sel.i, before: snap() };
					return;
				}
			}
			const hit = hitTest(p);
			if (hit?.t === 'item') {
				sel = hit;
				const it = plan.items[hit.i];
				gesture = { kind: 'item', i: hit.i, off: [p[0] - it.x, p[1] - it.y], before: snap() };
				return;
			}
		}
		gesture = { kind: 'pan', sx: e.clientX, sy: e.clientY, vb0: { ...vb } };
	}

	function onMove(e: PointerEvent) {
		if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
		if (Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 6) downAt.moved = true;
		if ((mode === 'outline' && draft.length) || (mode === 'wall' && wallStart)) {
			const from = mode === 'outline' ? draft[draft.length - 1] : wallStart;
			hover = snapPt(toCm(e.clientX, e.clientY), from);
		}
		if (!gesture) return;
		if (gesture.kind === 'pinch') {
			return;
		} else if (gesture.kind === 'pan' && downAt.moved) {
			const k = gesture.vb0.w / Math.max(1, svg!.clientWidth);
			vb = { ...gesture.vb0, x: gesture.vb0.x - (e.clientX - gesture.sx) * k, y: gesture.vb0.y - (e.clientY - gesture.sy) * k };
		} else if (gesture.kind === 'item' && downAt.moved) {
			const p = toCm(e.clientX, e.clientY);
			const it = plan.items[gesture.i];
			it.x = Math.round(p[0] - gesture.off[0]);
			it.y = Math.round(p[1] - gesture.off[1]);
		} else if (gesture.kind === 'spin') {
			const p = toCm(e.clientX, e.clientY);
			const { c } = spinHandle(gesture.i);
			let deg = (Math.atan2(p[0] - c[0], -(p[1] - c[1])) * 180) / Math.PI;
			deg = ((deg % 360) + 360) % 360;
			// gentle snap to the square angles; anything else to the nearest degree
			const sq = Math.round(deg / 90) * 90;
			deg = Math.abs(deg - sq) < 3 ? sq % 360 : Math.round(deg);
			setRot(plan.items[gesture.i], deg);
		} else if (gesture.kind === 'handle') {
			const w = gesture.t === 'window' ? plan.windows[gesture.i] : plan.doors[gesture.i];
			const e2 = nearestEdge(toCm(e.clientX, e.clientY), gesture.t === 'door');
			if (e2) {
				const q = lerp(e2.a, e2.b, e2.t);
				const other = gesture.end === 'a' ? w.b : w.a;
				if (Math.hypot(q[0] - other[0], q[1] - other[1]) > 30 && segDist(other, e2.a, e2.b) < 2) w[gesture.end] = q;
			}
		}
	}

	function onUp(e: PointerEvent) {
		pointers.delete(e.pointerId);
		const g = gesture;
		if (pointers.size > 0) {
			// lifting one finger of a pinch: carry on panning with the other
			const [rest] = [...pointers.values()];
			gesture = { kind: 'pan', sx: rest.x, sy: rest.y, vb0: { ...vb } };
			downAt = { x: rest.x, y: rest.y, moved: true };
			return;
		}
		gesture = null;
		if (g?.kind === 'item' || g?.kind === 'handle' || g?.kind === 'spin') return commit(g.before);
		if (g?.kind === 'pinch' || downAt.moved) return;
		tap(toCm(e.clientX, e.clientY));
	}

	function tap(p: Pt) {
		if (mode === 'outline') {
			if (draft.length >= 3) {
				const f = draft[0];
				if (Math.hypot(f[0] - p[0], f[1] - p[1]) < 20 * pxToCm()) return closeOutline();
			}
			draft = [...draft, snapPt(p, draft[draft.length - 1] ?? null)];
		} else if (mode === 'wall') {
			const q = snapPt(p, wallStart);
			if (!wallStart) wallStart = q;
			else {
				if (Math.hypot(q[0] - wallStart[0], q[1] - wallStart[1]) > 20) {
					const before = snap();
					plan.walls.push({ a: [Math.round(wallStart[0]), Math.round(wallStart[1])], b: [Math.round(q[0]), Math.round(q[1])], t: 12 });
					commit(before);
				}
				wallStart = null;
				hover = null;
			}
		} else if (mode === 'window') {
			addWindowAt(p);
		} else if (mode === 'door') {
			addDoorAt(p);
		} else {
			sel = hitTest(p);
		}
	}

	// Wheel / two-finger trackpad scroll pans the plan (never zooms — zoom is on the + / − buttons).
	function onWheel(e: WheelEvent) {
		e.preventDefault();
		if (e.ctrlKey) return; // trackpad pinch: ignored
		const k = vb.w / Math.max(1, svg?.clientWidth ?? 1);
		vb = { ...vb, x: vb.x + e.deltaX * k, y: vb.y + e.deltaY * k };
	}
	function zoomBtn(f: number) {
		zoomAt(f, [vb.x + vb.w / 2, vb.y + vb.h / 2]);
	}

	function setMode(m: Mode) {
		mode = m;
		sel = null;
		wallStart = null;
		hover = null;
		if (m !== 'outline') draft = [];
		if (m === 'outline' && plan.outline.length >= 3) {
			toast = 'Tracing a new outline replaces the current one.';
			setTimeout(() => (toast = null), 3000);
		}
	}

	// ── selection actions ────────────────────────────────────────────────────
	function del() {
		if (!sel) return;
		const before = snap();
		if (sel.t === 'item') plan.items.splice(sel.i, 1);
		else if (sel.t === 'window') plan.windows.splice(sel.i, 1);
		else if (sel.t === 'door') plan.doors.splice(sel.i, 1);
		else plan.walls.splice(sel.i, 1);
		sel = null;
		commit(before);
	}
	function setRot(it: (typeof plan.items)[number], deg: number) {
		const r = Math.round((((deg % 360) + 360) % 360) * 10) / 10;
		if (r) it.rot = r;
		else delete it.rot;
	}
	function rotateBy(step: number) {
		if (sel?.t !== 'item') return;
		const before = snap();
		const it = plan.items[sel.i];
		// step to the next multiple of 15° in that direction
		const cur = it.rot ?? 0;
		const next = step > 0 ? Math.floor(cur / 15 + 1e-6) * 15 + 15 : Math.ceil(cur / 15 - 1e-6) * 15 - 15;
		setRot(it, next);
		commit(before);
	}
	function setDoor(patch: { glass?: boolean; flip?: number }) {
		if (sel?.t !== 'door') return;
		const before = snap();
		Object.assign(plan.doors[sel.i], patch);
		commit(before);
	}
	function setGlass(v: number) {
		if (sel?.t !== 'window') return;
		const before = snap();
		plan.windows[sel.i].glass = v;
		commit(before);
	}
	function addPreset(pid: string) {
		const pr = PRESETS.find((p) => p.id === pid);
		if (!pr) return;
		const before = snap();
		const cx = vb.x + vb.w / 2;
		const cy = vb.y + vb.h / 2;
		plan.items.push({ kind: pr.kind, x: Math.round(cx - pr.w / 2), y: Math.round(cy - pr.d / 2), w: pr.w, d: pr.d, h: pr.h, color: pr.color, r: pr.r ?? 6 });
		sel = { t: 'item', i: plan.items.length - 1 };
		mode = 'move';
		sheet = null;
		commit(before);
	}

	// exact size sheet
	let sw = $state('');
	let sd = $state('');
	let sh = $state('');
	let sa = $state('');
	let sizeErr = $state<string | null>(null);
	function openSize() {
		if (sel?.t !== 'item') return;
		const it = plan.items[sel.i];
		sw = String(Math.round(it.w));
		sd = String(Math.round(it.d));
		sh = String(Math.round(it.h));
		sa = String(it.rot ?? 0);
		sizeErr = null;
		sheet = 'size';
	}
	function applySize(e: SubmitEvent) {
		e.preventDefault();
		if (sel?.t !== 'item') return;
		const w = validateNumber(sw, { min: 10, max: 1000, label: 'Width', decimals: 0 });
		const d = validateNumber(sd, { min: 10, max: 1000, label: 'Depth', decimals: 0 });
		const h = validateNumber(sh, { min: 1, max: 400, label: 'Height', decimals: 0 });
		if (!w.ok) return void (sizeErr = w.error);
		if (!d.ok) return void (sizeErr = d.error);
		if (!h.ok) return void (sizeErr = h.error);
		const a = validateNumber(sa || '0', { min: -360, max: 360, label: 'Angle', decimals: 1 });
		if (!a.ok) return void (sizeErr = a.error);
		const before = snap();
		Object.assign(plan.items[sel.i], { w: w.value, d: d.value, h: h.value });
		setRot(plan.items[sel.i], a.value);
		sheet = null;
		commit(before);
	}

	// Auto-trace: ask the AI to trace the floor plan photo again (e.g. after the tracing was removed).
	// Uses one of the project's AI re-runs (limits are checked on the server). Furniture already placed is kept.
	let askTrace = $state(false);
	let tracing = $state(false);
	const canAutoTrace = $derived(!!backdrop && supabaseConfigured && auth.status === 'signed-in');
	async function autoTrace() {
		askTrace = false;
		if (!project || !backdrop) return;
		if (!project.sizeSqft || project.sizeSqft < 150) {
			toast = 'Add the unit size (sq ft) on the project first — the AI uses it for the scale.';
			setTimeout(() => (toast = null), 4000);
			return;
		}
		tracing = true;
		try {
			const sb = await getSupabase();
			const { data, error } = await sb.functions.invoke('process-project', {
				body: { projectId: project.id, floorPlan: { dataUrl: backdrop.dataUrl, w: backdrop.w, h: backdrop.h }, interiors: [], sizeSqft: project.sizeSqft, propertyType: project.propertyType, ceilingCm: project.ceilingCm }
			});
			if (error) throw new Error(await fnError(error));
			const p = sanitizePlan((data as { plan?: unknown })?.plan);
			if (!p || p.outline.length < 3) throw new Error("The AI couldn't find the unit's outline in this photo.");
			const before = snap();
			plan = { ...p, items: plan.items.length ? plan.items : p.items };
			sel = null;
			draft = [];
			wallStart = null;
			mode = 'move';
			commit(before);
			fit();
			toast = 'Traced — check the walls, windows and doors. Undo brings back what you had.';
			setTimeout(() => (toast = null), 5000);
		} catch (e) {
			const msg = e instanceof Error ? e.message : 'Auto-trace failed.';
			console.warn('[auto-trace]', msg);
			toast = msg.includes('limit') ? 'No AI re-runs left for this project — trace it by hand with Outline.' : `Auto-trace didn't work${profile.data.isAdmin ? `: ${msg}` : ' — please trace with Outline, or try again later.'}`;
			setTimeout(() => (toast = null), 6000);
		}
		tracing = false;
	}

	// Done: if there's no furniture yet, offer to add some first (furniture shows where the sun lands).
	let askFurniture = $state(false);
	let highlightFurniture = $state(false);
	function done() {
		if (!project) return;
		if (plan.outline.length >= 3 && plan.items.length === 0 && !askFurniture) return void (askFurniture = true);
		void flush(project.id);
		goto(`/unit?id=${project.id}`);
	}
	function addFurnitureNow() {
		askFurniture = false;
		mode = 'move';
		highlightFurniture = true;
		toast = 'Tap Furniture to add beds, sofas, tables…';
		setTimeout(() => (toast = null), 4000);
	}

	const selItem = $derived(sel?.t === 'item' ? plan.items[sel.i] : null);
	const selWin = $derived(sel?.t === 'window' ? plan.windows[sel.i] : null);
	const selDoor = $derived(sel?.t === 'door' ? plan.doors[sel.i] : null);
	const spin = $derived(sel?.t === 'item' && plan.items[sel.i] ? spinHandle(sel.i) : null);
	const tools: { id: Mode; label: string; icon: IconName }[] = [
		{ id: 'move', label: 'Move', icon: 'hand' },
		{ id: 'outline', label: 'Outline', icon: 'outline' },
		{ id: 'wall', label: 'Wall', icon: 'wall' },
		{ id: 'window', label: 'Window', icon: 'window' },
		{ id: 'door', label: 'Door', icon: 'door' }
	];

	const pts = (p: Pt[]) => p.map((q) => q.join(',')).join(' ');
	const handleR = $derived(Math.max(8, vb.w / 70));
	const stroke = $derived(Math.max(2, vb.w / 400));

	onMount(() => {
		if (project) {
			loadFloorPlan(project.id).then((b) => {
				backdrop = b;
				if (!draft.length && !wallStart) fit();
			});
		}
		fit();
		return () => {
			if (project) void flush(project.id);
		};
	});
</script>

<svelte:head><title>Studio · RE:Aspect</title></svelte:head>

{#if !project}
	<div class="card missing">
		<h1>Studio</h1>
		<p class="muted">This project isn't one of yours (demo projects can't be edited), or it hasn't loaded yet.</p>
		<a class="btn" href="/">Back to projects</a>
	</div>
{:else}
	<div class="studio">
		<div class="top">
			{#if backdrop}
				<a class="btn back" href="/rotate?id={project.id}"><Icon name="back" size={18} />Rotate plan</a>
			{/if}
			<span class="state muted">{savedAt === 'saving' ? 'Saving…' : 'Saved'}</span>
			{#if backdrop}
				<button class="mini" class:on={showBackdrop} onclick={() => (showBackdrop = !showBackdrop)} aria-pressed={showBackdrop} aria-label="Show floor plan photo"><Icon name="image" size={18} /></button>
			{/if}
			<button class="mini" onclick={fit} aria-label="Fit to screen"><Icon name="grid" size={18} /></button>
			<button class="btn primary done" onclick={done}><Icon name="check" size={18} />Done</button>
		</div>

		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<svg
			bind:this={svg}
			class="canvas mode-{mode}"
			viewBox="{vb.x} {vb.y} {vb.w} {vb.h}"
			onpointerdown={onDown}
			onpointermove={onMove}
			onpointerup={onUp}
			onpointercancel={onUp}
			onwheel={onWheel}
		>
			{#if backdrop && showBackdrop}
				<image href={backdrop.dataUrl} x="0" y="0" width={backdrop.w * imgScale} height={backdrop.h * imgScale} opacity={plan.outline.length >= 3 ? 0.35 : 0.75} />
			{/if}

			{#if plan.outline.length >= 3}
				<polygon points={pts(plan.outline)} class="floor" />
			{/if}
			{#each plan.items as it, i (i)}
				{#if it.kind === 'plant'}
					<circle cx={it.x + it.w / 2} cy={it.y + it.d / 2} r={it.w / 2} fill={it.color} class:sel={sel?.t === 'item' && sel.i === i} />
				{:else}
					<rect x={it.x} y={it.y} width={it.w} height={it.d} rx={it.r} fill={it.color} opacity={it.kind === 'rug' ? 0.6 : 1} class="item" class:sel={sel?.t === 'item' && sel.i === i} style:stroke-width={stroke * 1.5} transform={itemTransform(it)} />
				{/if}
			{/each}
			{#if plan.outline.length >= 3}
				<polygon points={pts(plan.outline)} class="outline" style:stroke-width={Math.max(14, stroke * 4)} />
			{/if}
			{#each plan.walls as w, i (i)}
				<line x1={w.a[0]} y1={w.a[1]} x2={w.b[0]} y2={w.b[1]} class="wall" class:sel={sel?.t === 'wall' && sel.i === i} stroke-width={w.t} />
			{/each}
			{#each plan.windows as w, i (i)}
				<line x1={w.a[0]} y1={w.a[1]} x2={w.b[0]} y2={w.b[1]} class="win" class:sel={sel?.t === 'window' && sel.i === i} stroke-width={Math.max(12, stroke * 5)} />
			{/each}
			{#each plan.doors as d, i (i)}
				{@const on = sel?.t === 'door' && sel.i === i}
				{#if d.glass}
					<line x1={d.a[0]} y1={d.a[1]} x2={d.b[0]} y2={d.b[1]} class="win" class:sel={on} stroke-width={Math.max(12, stroke * 5)} />
					<line x1={d.a[0]} y1={d.a[1]} x2={d.b[0]} y2={d.b[1]} class="gap" stroke-width={Math.max(3, stroke * 1.2)} />
				{:else}
					{@const g = doorGeom(d)}
					<line x1={d.a[0]} y1={d.a[1]} x2={d.b[0]} y2={d.b[1]} class="gap" stroke-width={Math.max(16, stroke * 6)} />
					<path d={g.arc} class="swing" class:sel={on} style:stroke-width={stroke} />
					<line x1={g.hinge[0]} y1={g.hinge[1]} x2={g.leaf[0]} y2={g.leaf[1]} class="leaf" class:sel={on} style:stroke-width={Math.max(4, stroke * 2)} />
				{/if}
			{/each}
			{#each plan.rooms as r (r.name + r.x)}
				<text x={r.x} y={r.y} class="room" font-size={Math.max(18, vb.w / 60)}>{r.name}</text>
			{/each}

			{#if selWin || selDoor}
				{@const s = (selWin ?? selDoor)!}
				{#each [s.a, s.b] as h, k (k)}
					<circle cx={h[0]} cy={h[1]} r={handleR} class="handle" style:stroke-width={stroke} />
				{/each}
			{/if}
			{#if spin}
				<line x1={spin.edge[0]} y1={spin.edge[1]} x2={spin.h[0]} y2={spin.h[1]} class="spin-arm" style:stroke-width={stroke} />
				<circle cx={spin.h[0]} cy={spin.h[1]} r={handleR * 1.15} class="handle" style:stroke-width={stroke * 1.5} />
				<path d="M{spin.h[0] - handleR * 0.5} {spin.h[1] + handleR * 0.15} a{handleR * 0.5} {handleR * 0.5} 0 1 1 {handleR * 0.35} {handleR * 0.4}" class="spin-glyph" style:stroke-width={stroke} />
			{/if}

			<!-- outline in progress -->
			{#if draft.length}
				<polyline points={pts(hover ? [...draft, hover] : draft)} class="draft" style:stroke-width={stroke * 2} />
				{#each draft as p, k (k)}
					<circle cx={p[0]} cy={p[1]} r={k === 0 ? handleR * 1.3 : handleR * 0.7} class="vertex" class:first={k === 0} style:stroke-width={stroke} />
				{/each}
			{/if}
			{#if wallStart}
				<line x1={wallStart[0]} y1={wallStart[1]} x2={(hover ?? wallStart)[0]} y2={(hover ?? wallStart)[1]} class="draft" style:stroke-width={stroke * 2} />
				<circle cx={wallStart[0]} cy={wallStart[1]} r={handleR * 0.7} class="vertex" style:stroke-width={stroke} />
			{/if}
		</svg>

		{#if canAutoTrace}
			<button class="trace" onclick={() => (askTrace = true)} disabled={tracing}>
				{#if tracing}<Spinner size={16} />Tracing…{:else}<Icon name="sparkle" size={18} />Auto-trace{/if}
			</button>
		{/if}
		<div class="zoom" role="group" aria-label="Zoom">
			<button onclick={() => zoomBtn(1 / 1.3)} aria-label="Zoom in"><Icon name="plus" size={20} /></button>
			<button onclick={() => zoomBtn(1.3)} aria-label="Zoom out"><Icon name="minus" size={20} /></button>
		</div>
		{#if toast}<div class="toast" role="status">{toast}</div>{:else}<div class="hint">{HINT[mode]}</div>{/if}

		<div class="foot">
		<!-- contextual bar (floats over the canvas so the view never jumps) -->
		{#if selItem}
			<div class="ctx">
				<strong>{KIND_LABEL[selItem.kind]}</strong>
				<span class="muted">{Math.round(selItem.w)} × {Math.round(selItem.d)} cm</span>
				<div class="rot" role="group" aria-label="Rotate">
					<button onclick={() => rotateBy(-15)} aria-label="Rotate 15° anticlockwise"><span class="ccw"><Icon name="rotate" size={18} /></span></button>
					<button class="deg" onclick={openSize} aria-label="Set exact angle">{Math.round(selItem.rot ?? 0)}°</button>
					<button onclick={() => rotateBy(15)} aria-label="Rotate 15° clockwise"><Icon name="rotate" size={18} /></button>
				</div>
				<button class="btn" onclick={openSize}>Size</button>
				<button class="btn icon" onclick={del} aria-label="Delete"><Icon name="trash" size={18} /></button>
			</div>
		{:else if selWin}
			<div class="ctx">
				<strong>Window</strong>
				<span class="muted">Glass</span>
				<div class="glass" role="radiogroup" aria-label="Glass height">
					{#each GLASS_OPTIONS as g (g.label)}
						<button role="radio" aria-checked={Math.abs(selWin.glass - g.v) < 0.01} class:on={Math.abs(selWin.glass - g.v) < 0.01} onclick={() => setGlass(g.v)}>{g.label}</button>
					{/each}
				</div>
				<button class="btn icon" onclick={del} aria-label="Delete window"><Icon name="trash" size={18} /></button>
			</div>
		{:else if selDoor}
			<div class="ctx">
				<strong>Door</strong>
				<div class="glass" role="radiogroup" aria-label="Door type">
					<button role="radio" aria-checked={!selDoor.glass} class:on={!selDoor.glass} onclick={() => setDoor({ glass: false })}>Hinged</button>
					<button role="radio" aria-checked={selDoor.glass} class:on={selDoor.glass} onclick={() => setDoor({ glass: true })}>Glass</button>
				</div>
				{#if !selDoor.glass}
					<button class="btn" onclick={() => setDoor({ flip: (selDoor.flip + 1) % 4 })}>Flip</button>
				{/if}
				<button class="btn icon" onclick={del} aria-label="Delete door"><Icon name="trash" size={18} /></button>
			</div>
		{:else if sel?.t === 'wall'}
			<div class="ctx">
				<strong>Wall</strong>
				<button class="btn icon" onclick={del} aria-label="Delete wall"><Icon name="trash" size={18} /></button>
			</div>
		{:else if mode === 'outline' && draft.length}
			<div class="ctx">
				<span class="muted">{draft.length} corner{draft.length === 1 ? '' : 's'}</span>
				<button class="btn" onclick={() => (draft = draft.slice(0, -1))}>Remove last</button>
				<button class="btn primary" onclick={closeOutline} disabled={draft.length < 3}>Finish outline</button>
			</div>
		{/if}

		<nav class="tools" aria-label="Studio tools">
			{#each tools as t (t.id)}
				<button class:on={mode === t.id} onclick={() => setMode(t.id)} aria-pressed={mode === t.id}><Icon name={t.icon} size={22} /><span>{t.label}</span></button>
			{/each}
			<button class:pulse={highlightFurniture} onclick={() => ((sheet = 'furniture'), (highlightFurniture = false))}><Icon name="sofa" size={22} /><span>Furniture</span></button>
			<button onclick={undo} disabled={!canUndo} aria-label="Undo"><Icon name="undo" size={22} /><span>Undo</span></button>
			<button onclick={redo} disabled={!canRedo} aria-label="Redo"><Icon name="redo" size={22} /><span>Redo</span></button>
		</nav>
		</div>
	</div>

	{#if askTrace}
		<button class="scrim" aria-label="Cancel" onclick={() => (askTrace = false)}></button>
		<div class="sheet ask" role="dialog" aria-modal="true" aria-labelledby="trace-title">
			<h2 id="trace-title">Auto-trace this plan?</h2>
			<p class="muted">The AI traces the floor plan photo again: outline, walls, windows and rooms.{plan.outline.length >= 3 || plan.walls.length ? ' This replaces what is traced now (Undo brings it back).' : ''} Furniture you've placed stays. Uses one of this project's AI re-runs.</p>
			<div class="actions">
				<button class="btn" onclick={() => (askTrace = false)}>Cancel</button>
				<button class="btn primary" onclick={autoTrace}><Icon name="sparkle" size={18} />Auto-trace</button>
			</div>
		</div>
	{/if}

	{#if askFurniture}
		<button class="scrim" aria-label="Close" onclick={() => (askFurniture = false)}></button>
		<div class="sheet ask" role="dialog" aria-modal="true" aria-labelledby="ask-title">
			<h2 id="ask-title">Add furniture?</h2>
			<p class="muted">There's no furniture yet. Adding beds, sofas and tables shows exactly where the sun lands on them.</p>
			<div class="actions">
				<button class="btn" onclick={() => ((askFurniture = false), void flush(project.id), goto(`/unit?id=${project.id}`))}>Skip for now</button>
				<button class="btn primary" onclick={addFurnitureNow}><Icon name="sofa" size={18} />Add furniture</button>
			</div>
		</div>
	{/if}

	{#if sheet}
		<button class="scrim" aria-label="Close" onclick={() => (sheet = null)}></button>
		<div class="sheet" role="dialog" aria-modal="true">
			{#if sheet === 'furniture'}
				<h2>Add furniture</h2>
				<div class="presets">
					{#each PRESETS as p (p.id)}
						<button onclick={() => addPreset(p.id)}>
							<span class="sw" style:background={p.color} style:aspect-ratio="{p.w} / {p.d}" style:border-radius={p.kind === 'plant' ? '50%' : '4px'}></span>
							<span class="pl">{p.label}</span>
							<span class="muted">{p.w}×{p.d}</span>
						</button>
					{/each}
				</div>
			{:else}
				<h2>Size (cm)</h2>
				<form onsubmit={applySize} novalidate>
					<div class="sizes">
						<div class="field"><label for="sw">Width</label><input id="sw" inputmode="numeric" maxlength="4" bind:value={sw} /></div>
						<div class="field"><label for="sd">Depth</label><input id="sd" inputmode="numeric" maxlength="4" bind:value={sd} /></div>
						<div class="field"><label for="sh">Height</label><input id="sh" inputmode="numeric" maxlength="3" bind:value={sh} /></div>
						<div class="field"><label for="sa">Angle °</label><input id="sa" inputmode="decimal" maxlength="6" bind:value={sa} /></div>
					</div>
					{#if sizeErr}<p class="error">{sizeErr}</p>{/if}
					<div class="actions"><button type="button" class="btn" onclick={() => (sheet = null)}>Cancel</button><button class="btn primary">Apply</button></div>
				</form>
			{/if}
		</div>
	{/if}
{/if}

<style>
	.studio {
		position: relative;
		display: flex;
		flex-direction: column;
		height: calc(100dvh - 120px - var(--safe-t) - var(--safe-b));
		min-height: 420px;
		margin: -8px -16px -28px;
	}
	.top {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 12px;
	}
	.zoom {
		position: absolute;
		right: 10px;
		top: 106px;
		z-index: 2;
		display: flex;
		flex-direction: column;
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: var(--radius-sm);
		box-shadow: var(--shadow);
		overflow: hidden;
	}
	.zoom button {
		width: 44px;
		height: 44px;
		display: grid;
		place-items: center;
		border: 0;
		background: none;
		color: var(--text);
		cursor: pointer;
	}
	.zoom button + button {
		border-top: 1px solid var(--line);
	}
	.hint {
		position: absolute;
		left: 50%;
		top: 62px;
		transform: translateX(-50%);
		font-size: 12px;
		color: var(--muted);
		background: color-mix(in srgb, var(--surface) 88%, transparent);
		border: 1px solid var(--line);
		padding: 5px 12px;
		border-radius: 14px;
		white-space: nowrap;
		max-width: calc(100% - 24px);
		overflow: hidden;
		text-overflow: ellipsis;
		pointer-events: none;
		z-index: 1;
	}
	.state {
		flex: 1;
		font-size: 12px;
	}
	.mini {
		width: 44px;
		height: 44px;
		display: grid;
		place-items: center;
		border: 1px solid var(--line);
		border-radius: var(--radius-sm);
		background: var(--surface);
		color: var(--muted);
		cursor: pointer;
	}
	.mini.on {
		color: var(--forest);
	}
	.trace {
		position: absolute;
		left: 10px;
		top: 106px;
		z-index: 2;
		display: flex;
		align-items: center;
		gap: 6px;
		min-height: 44px;
		padding: 0 14px;
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: 999px;
		box-shadow: var(--shadow);
		color: var(--forest);
		font: inherit;
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
	}
	.trace:disabled {
		opacity: 0.7;
	}
	.done {
		min-height: 44px;
	}
	.back {
		min-height: 44px;
		padding: 0 12px;
	}
	.tools button.pulse {
		color: var(--on-primary);
		background: var(--forest);
		animation: pulse 1.2s ease-in-out infinite;
	}
	@keyframes pulse {
		50% {
			box-shadow: 0 0 0 6px color-mix(in srgb, var(--forest) 30%, transparent);
		}
	}
	.ask p {
		margin: 0 0 14px;
	}
	.canvas {
		flex: 1;
		width: 100%;
		min-height: 0;
		background: var(--canvas);
		touch-action: none;
		user-select: none;
		-webkit-user-select: none;
		cursor: grab;
		border-top: 1px solid var(--line);
		border-bottom: 1px solid var(--line);
	}
	.canvas.mode-outline,
	.canvas.mode-wall,
	.canvas.mode-window {
		cursor: crosshair;
	}
	.floor {
		fill: #e9dfcb;
		opacity: 0.7;
	}
	.outline {
		fill: none;
		stroke: #3a4139;
		stroke-linejoin: miter;
	}
	.wall {
		stroke: #59625a;
		stroke-linecap: square;
	}
	.win {
		stroke: #7fb0c4;
		stroke-linecap: butt;
	}
	.sel {
		stroke: var(--ochre) !important;
	}
	.item {
		stroke: rgba(0, 0, 0, 0.18);
	}
	.item.sel {
		stroke: var(--ochre);
	}
	.room {
		fill: #6b6f66;
		font-weight: 600;
		text-anchor: middle;
		pointer-events: none;
		letter-spacing: 0.05em;
	}
	.handle {
		fill: #fff;
		stroke: var(--ochre);
	}
	.gap {
		stroke: #ece4d4;
		stroke-linecap: butt;
	}
	.swing {
		fill: none;
		stroke: #59625a;
		stroke-dasharray: 6 5;
	}
	.leaf {
		stroke: #59625a;
		stroke-linecap: round;
	}
	.spin-arm {
		stroke: var(--ochre);
		stroke-dasharray: 4 4;
	}
	.spin-glyph {
		fill: none;
		stroke: var(--ochre);
		stroke-linecap: round;
		pointer-events: none;
	}
	.rot {
		display: flex;
		align-items: center;
		gap: 2px;
		background: var(--surface-2);
		border-radius: var(--radius-sm);
		padding: 2px;
	}
	.rot button {
		min-width: 44px;
		min-height: 44px;
		border: 0;
		background: transparent;
		border-radius: calc(var(--radius-sm) - 2px);
		display: grid;
		place-items: center;
		cursor: pointer;
		color: inherit;
		font-weight: 700;
		font-size: 15px;
	}
	.rot .deg {
		min-width: 52px;
		font-variant-numeric: tabular-nums;
	}
	.ccw {
		display: grid;
		transform: scaleX(-1);
	}
	.glass button {
		padding: 0 10px;
	}
	.draft {
		fill: none;
		stroke: var(--ochre);
		stroke-dasharray: 8 6;
	}
	.vertex {
		fill: var(--ochre);
		stroke: #fff;
	}
	.vertex.first {
		fill: #fff;
		stroke: var(--ochre);
	}
	.toast {
		position: absolute;
		left: 50%;
		top: 60px;
		transform: translateX(-50%);
		background: var(--text);
		color: var(--paper);
		padding: 8px 14px;
		border-radius: 12px;
		font-size: 13px;
		max-width: calc(100% - 24px);
		text-align: center;
		pointer-events: none;
		z-index: 2;
	}
	.foot {
		position: relative;
	}
	.ctx {
		position: absolute;
		left: 8px;
		right: 8px;
		bottom: calc(100% + 8px);
		border: 1px solid var(--line);
		border-radius: var(--radius-sm);
		box-shadow: 0 6px 20px rgba(0, 0, 0, 0.12);
		z-index: 2;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 12px;
		background: var(--surface);
		overflow-x: auto;
		white-space: nowrap;
	}
	.ctx .muted {
		font-size: 13px;
	}
	.ctx .btn {
		min-height: 44px;
		padding: 0 12px;
	}
	.btn.icon {
		width: 44px;
		padding: 0;
		margin-left: auto;
		color: #b5483a;
	}
	.glass {
		display: flex;
		gap: 4px;
		background: var(--surface-2);
		border-radius: var(--radius-sm);
		padding: 3px;
	}
	.glass button {
		min-width: 48px;
		min-height: 40px;
		border: 0;
		border-radius: calc(var(--radius-sm) - 2px);
		background: transparent;
		font-size: 18px;
		font-weight: 700;
		cursor: pointer;
	}
	.glass button.on {
		background: var(--forest);
		color: var(--on-primary);
	}
	.tools {
		display: flex;
		background: var(--surface);
		padding: 4px 4px calc(4px + var(--safe-b));
		overflow-x: auto;
	}
	.tools button {
		flex: 1 1 0;
		min-width: 0;
		min-height: 54px;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 2px;
		border: 0;
		border-radius: var(--radius-sm);
		background: none;
		color: var(--muted);
		font-size: 10.5px;
		font-weight: 600;
		cursor: pointer;
		padding: 0 2px;
	}
	.tools button.on {
		color: var(--forest);
		background: var(--surface-2);
	}
	.tools button:disabled {
		opacity: 0.35;
	}
	.scrim {
		position: fixed;
		inset: 0;
		border: 0;
		background: rgba(20, 26, 22, 0.35);
		z-index: 40;
	}
	.sheet {
		position: fixed;
		z-index: 41;
		left: 50%;
		bottom: 0;
		transform: translateX(-50%);
		width: min(620px, 100vw);
		max-height: 75dvh;
		overflow-y: auto;
		background: var(--surface);
		border-radius: var(--radius) var(--radius) 0 0;
		padding: 16px 16px calc(20px + var(--safe-b));
		animation: up 0.22s cubic-bezier(0.2, 0.8, 0.2, 1);
	}
	@keyframes up {
		from {
			transform: translate(-50%, 100%);
		}
	}
	.sheet h2 {
		font-size: 18px;
		margin: 0 0 12px;
	}
	.presets {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
		gap: 8px;
	}
	.presets button {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		padding: 10px 6px;
		min-height: 96px;
		border: 1px solid var(--line);
		border-radius: var(--radius-sm);
		background: var(--paper);
		cursor: pointer;
		font-size: 12px;
	}
	.sw {
		width: 44px;
		max-height: 44px;
		display: block;
	}
	.pl {
		font-weight: 600;
		text-align: center;
		line-height: 1.2;
	}
	.sizes {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 8px;
	}
	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
	}
	.error {
		color: #b5483a;
		font-size: 13px;
	}
	.missing {
		margin-top: 20px;
	}
</style>
