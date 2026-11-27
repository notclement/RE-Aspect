<script lang="ts">
	/**
	 * Top-down and "3D plan" views of a unit with live sun patches.
	 * 3D plan = stacked SVG layers in CSS 3D (cheap, no WebGL). The full 3D / walkthrough module
	 * (built with Astra) will replace the 3D layer later — it receives the same Unit data.
	 *
	 * Gestures (natural, never inverted): drag = pan (top down) / orbit (3D: drag left → model turns left),
	 * pinch or wheel = zoom.
	 */
	import type { Unit, Item } from '#lib/sample-unit.ts';
	import type { Patch } from '#lib/light.ts';

	let {
		unit,
		mode,
		patches,
		dark,
		sun,
		grid = $bindable(true)
	}: {
		unit: Unit;
		mode: 'top' | '3d';
		patches: Patch[];
		dark: number;
		sun: { azimuth: number; altitude: number };
		grid?: boolean;
	} = $props();

	// ---- geometry
	const xs = $derived(unit.outline.map((p) => p[0]));
	const ys = $derived([...unit.outline.map((p) => p[1]), unit.balcony.y + unit.balcony.d]);
	const pad = 60;
	const vb = $derived({
		x: Math.min(...xs) - pad,
		y: Math.min(...ys) - pad,
		w: Math.max(...xs) - Math.min(...xs) + pad * 2,
		h: Math.max(...ys) - Math.min(...ys) + pad * 2
	});
	const viewBox = $derived(`${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
	const outline = $derived(unit.outline.map((p) => p.join(',')).join(' '));

	// ---- sun marker: where the sun is, relative to the unit
	const cx = $derived(vb.x + vb.w / 2);
	const cy = $derived(vb.y + vb.h / 2);
	const R = $derived(Math.max(vb.w, vb.h) * 0.62);
	const sdir = $derived.by(() => {
		const a = ((sun.azimuth - unit.bearing) * Math.PI) / 180;
		return [Math.sin(a), -Math.cos(a)] as const;
	});
	const sunUp = $derived(sun.altitude > 0);
	const altR = $derived((Math.max(0, sun.altitude) * Math.PI) / 180);
	// Top down: the higher the sun, the closer to "overhead" (the centre of the plan).
	const topSun = $derived.by(() => {
		const r = R * (1 - Math.max(0, sun.altitude) / 90);
		return [cx + sdir[0] * r, cy + sdir[1] * r] as const;
	});
	// Where sunlight comes from at ground level (horizon point in the sun's direction).
	const horizon = $derived([cx + sdir[0] * R, cy + sdir[1] * R] as const);
	let stageW = $state(600);
	// 3D plan: sun placed on a dome around the unit (horizon distance shrinks, height grows with altitude).
	const sky3d = $derived.by(() => {
		const k = (stageW * 0.92) / vb.w;
		return {
			gx: ((cx + sdir[0] * R * 0.6 * Math.cos(altR) - vb.x) / vb.w) * 100,
			gy: ((cy + sdir[1] * R * 0.6 * Math.cos(altR) - vb.y) / vb.h) * 100,
			z: sunUp ? R * 0.6 * Math.sin(altR) * k * 0.8 : 0
		};
	});
	const pts = (ps: [number, number][]) => ps.map((p) => p.join(',')).join(' ');

	// ---- view transform
	let scale = $state(1);
	let panX = $state(0);
	let panY = $state(0);
	let rot = $state(-28);
	let tilt = $state(52);

	export function zoomBy(f: number) {
		scale = Math.min(4, Math.max(0.5, scale * f));
	}
	export function reset() {
		scale = 1;
		panX = panY = 0;
		rot = -28;
		tilt = 52;
	}
	export function getScale() {
		return scale;
	}

	const pointers = new Map<number, { x: number; y: number }>();
	let pinchDist = 0;

	function down(e: PointerEvent) {
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
		if (pointers.size === 2) pinchDist = dist();
	}
	function dist() {
		const [a, b] = [...pointers.values()];
		return Math.hypot(a.x - b.x, a.y - b.y);
	}
	function move(e: PointerEvent) {
		const prev = pointers.get(e.pointerId);
		if (!prev) return;
		const dx = e.clientX - prev.x;
		const dy = e.clientY - prev.y;
		pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
		if (pointers.size >= 2) {
			const d = dist();
			if (pinchDist) zoomBy(d / pinchDist);
			pinchDist = d;
			return;
		}
		if (mode === '3d') {
			rot -= dx * 0.35; // natural: drag left → the model turns left
			tilt = Math.min(70, Math.max(15, tilt - dy * 0.25));
		} else {
			panX += dx;
			panY += dy;
		}
	}
	function up(e: PointerEvent) {
		pointers.delete(e.pointerId);
		if (pointers.size < 2) pinchDist = 0;
	}
	function wheel(e: WheelEvent) {
		e.preventDefault();
		zoomBy(e.deltaY < 0 ? 1.1 : 1 / 1.1);
	}

	// ---- 3D layer stack
	const PX_PER_CM = 0.16; // vertical exaggeration for the cut-away look
	const STEP = 3;
	const WALL_H = 230;
	const wallLayers = $derived(Array.from({ length: Math.round((WALL_H * PX_PER_CM) / STEP) }, (_, i) => (i + 1) * STEP));
	const itemTop = (i: Item) => Math.min(42, Math.max(2, i.h * PX_PER_CM));
	const itemLayers = $derived(Array.from({ length: 14 }, (_, i) => (i + 1) * STEP));

	function shade(hex: string, f: number) {
		const n = parseInt(hex.slice(1), 16);
		const c = (v: number) => Math.round(v * f).toString(16).padStart(2, '0');
		return `#${c((n >> 16) & 255)}${c((n >> 8) & 255)}${c(n & 255)}`;
	}

	const dim = $derived(`brightness(${1 - dark * 0.22}) saturate(${1 - dark * 0.25})`);
	const north = $derived(mode === '3d' ? rot + unit.bearing : unit.bearing);
</script>

{#snippet floor()}
	<defs>
		<pattern id="planks" width="120" height="22" patternUnits="userSpaceOnUse">
			<rect width="120" height="22" fill="var(--floor)" />
			<path d="M0 21.5H120M60 0V22" stroke="var(--floor-line)" stroke-width="1.5" />
		</pattern>
		<linearGradient id="sunfill" x1="0" y1="0" x2="0" y2="1">
			<stop offset="0" stop-color="#F4C252" stop-opacity=".95" />
			<stop offset="1" stop-color="#F8D98C" stop-opacity=".55" />
		</linearGradient>
		{#each patches as p, i (i)}
			<clipPath id="room{i}"><polygon points={pts(p.clip)} /></clipPath>
		{/each}
	</defs>
	<rect
		x={unit.balcony.x}
		y={unit.balcony.y}
		width={unit.balcony.w}
		height={unit.balcony.d}
		fill="var(--balcony)"
		stroke="var(--wall)"
		stroke-width="6"
		stroke-dasharray="14 10"
	/>
	<polygon points={outline} fill="url(#planks)" />
	{#each patches as p, i (i)}
		<polygon points={pts(p.points)} fill="url(#sunfill)" opacity={0.25 + p.intensity * 0.65} clip-path="url(#room{i})" />
	{/each}
	<polygon points={outline} fill="#1A2740" opacity={dark * 0.28} />
	{#if sunUp}
		<g class="ray" opacity={Math.min(1, sun.altitude / 8)}>
			<line x1={horizon[0]} y1={horizon[1]} x2={cx + sdir[0] * R * 0.55} y2={cy + sdir[1] * R * 0.55} />
			<path
				d="M0 -22 L40 0 L0 22 Z"
				transform="translate({cx + sdir[0] * R * 0.55} {cy + sdir[1] * R * 0.55}) rotate({(Math.atan2(-sdir[1], -sdir[0]) * 180) / Math.PI})"
			/>
		</g>
	{/if}
{/snippet}

{#snippet sunDisc(x: number, y: number, size: number)}
	<g class="sundisc" transform="translate({x} {y})" opacity={sunUp ? 1 : 0.35}>
		<circle r={size * 2.2} fill="#F6C453" opacity=".18" />
		<circle r={size * 1.45} fill="#F6C453" opacity=".28" />
		<circle r={size} fill={sunUp ? '#F2B84B' : '#9AA094'} stroke="#fff" stroke-width={size * 0.18} />
		<text y={size * 3.2} text-anchor="middle">{sunUp ? `${Math.round(sun.altitude)}° up` : 'below horizon'}</text>
	</g>
{/snippet}

{#snippet items(z: number | null)}
	{#each unit.items as i, k (k)}
		{#if z === null || itemTop(i) >= z}
			{@const top = z === null || itemTop(i) - z < STEP}
			{#if i.kind === 'plant'}
				<circle cx={i.x + i.w / 2} cy={i.y + i.d / 2} r={i.w / 2} fill={top ? i.color : shade(i.color, 0.78)} />
			{:else}
				<rect
					x={i.x}
					y={i.y}
					width={i.w}
					height={i.d}
					rx={i.r}
					fill={top ? i.color : shade(i.color, 0.78)}
					stroke={top ? shade(i.color, 0.8) : 'none'}
					stroke-width="3"
				/>
				{#if i.kind === 'bed' && top}
					<rect x={i.x + 10} y={i.y + 8} width={i.w - 20} height={i.d * 0.22} rx="10" fill="#F6F3EA" />
				{/if}
			{/if}
		{/if}
	{/each}
{/snippet}

{#snippet walls(top: boolean)}
	{#each unit.walls as w, k (k)}
		<line
			x1={w.a[0]}
			y1={w.a[1]}
			x2={w.b[0]}
			y2={w.b[1]}
			stroke={top ? 'var(--wall-top)' : 'var(--wall)'}
			stroke-width={w.t}
			stroke-linecap="square"
		/>
	{/each}
	{#each unit.windows as o, k (k)}
		<line x1={o.a[0]} y1={o.a[1]} x2={o.b[0]} y2={o.b[1]} stroke="var(--glass)" stroke-width="12" />
	{/each}
{/snippet}

<div
	class="stage"
	class:grid
	class:is3d={mode === '3d'}
	onpointerdown={down}
	onpointermove={move}
	onpointerup={up}
	onpointercancel={up}
	onwheel={wheel}
	bind:clientWidth={stageW}
	role="application"
	aria-label={mode === '3d' ? '3D plan — drag to rotate, pinch to zoom' : 'Top-down plan — drag to move, pinch to zoom'}
>
	<div class="north" style:transform="rotate({north}deg)" aria-label="North">
		<span>N</span>
		<svg viewBox="0 0 24 24" width="22" height="22"><path d="M12 2l7 19-7-5-7 5z" fill="var(--forest)" /></svg>
	</div>

	{#if mode === 'top'}
		<div class="flat" style:transform="translate({panX}px,{panY}px) scale({scale})">
			<svg {viewBox} style:filter={dim}>
				{@render floor()}
				{@render items(null)}
				{@render walls(false)}
				{#each unit.rooms as r (r.name)}
					<text x={r.x} y={r.y} class="label" text-anchor="middle">{r.name.toUpperCase()}</text>
				{/each}
				{@render sunDisc(sunUp ? topSun[0] : horizon[0], sunUp ? topSun[1] : horizon[1], 46)}
			</svg>
		</div>
	{:else}
		<div class="model" style:transform="translate({panX}px,{panY}px) scale({scale * 0.92}) rotateX({tilt}deg) rotateZ({rot}deg)">
			<svg {viewBox} style:filter={dim}>{@render floor()}</svg>
			{#each itemLayers as z (z)}
				<svg {viewBox} style:transform="translateZ({z}px)" style:filter={dim}>{@render items(z)}</svg>
			{/each}
			{#each wallLayers as z, k (z)}
				<svg {viewBox} style:transform="translateZ({z}px)" style:filter={dim}>{@render walls(k === wallLayers.length - 1)}</svg>
			{/each}
			{#if sunUp}
			<div
				class="sky"
				style:left="{sky3d.gx}%"
				style:top="{sky3d.gy}%"
				style:transform="translate(-50%,-50%) translateZ({sky3d.z}px) rotateZ({-rot}deg) rotateX({-tilt}deg)"
			>
				<svg viewBox="-110 -110 220 260" width="78" height="92">{@render sunDisc(0, 0, 34)}</svg>
			</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.stage {
		--floor: #e9dfcb;
		--floor-line: #dccfb6;
		--wall: #3a4139;
		--wall-top: #59625a;
		--glass: #9fb8b9;
		--balcony: #e4e2d8;
		position: relative;
		height: 100%;
		min-height: 200px;
		overflow: hidden;
		touch-action: none;
		cursor: grab;
		perspective: 1600px;
		user-select: none;
	}
	:global([data-theme='dark']) .stage {
		--floor: #cbbfa6;
		--floor-line: #bcae93;
		--balcony: #4a4a44;
	}
	.stage:active {
		cursor: grabbing;
	}
	.grid {
		background-image: radial-gradient(color-mix(in srgb, var(--muted) 45%, transparent) 1px, transparent 1.2px);
		background-size: 18px 18px;
	}
	.flat,
	.model {
		position: absolute;
		inset: 6% 4%;
		transform-origin: 50% 50%;
	}
	.model {
		transform-style: preserve-3d;
	}
	.flat svg,
	.model svg {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		overflow: visible;
	}
	.label {
		font: 600 26px var(--font);
		letter-spacing: 2px;
		fill: #7b8077;
	}
.ray line {
		stroke: var(--ochre);
		stroke-width: 7;
		stroke-dasharray: 18 14;
		stroke-linecap: round;
	}
	.ray path {
		fill: var(--ochre);
	}
	.sundisc text {
		font: 700 40px var(--font);
		paint-order: stroke;
		stroke: var(--paper);
		stroke-width: 8px;
		fill: var(--ochre);
	}
	.sky {
		position: absolute;
		pointer-events: none;
	}
	.model .sky svg {
		position: static;
		display: block;
		width: 78px;
		height: 92px;
		overflow: visible;
	}
	.north {
		position: absolute;
		top: 14px;
		right: 16px;
		z-index: 2;
		display: flex;
		flex-direction: column;
		align-items: center;
		font: 700 13px var(--font);
		color: var(--text);
		pointer-events: none;
	}
</style>
