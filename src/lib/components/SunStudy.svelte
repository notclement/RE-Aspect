<script lang="ts" module>
	import type { PlanData } from '#lib/plan.ts';
	/** What the sun study shows next to the plan (and in "How we worked this out"). */
	export interface StudyInfo {
		address: string;
		unitNo: string;
		level: number | null;
		sizeSqft: number | null;
		ceilingCm: number;
		typeLabel: string;
		plan: PlanData | null; // null for the built-in demos
		northAngle: number | null; // degrees the user turned the plan to put north up (if known on this device)
		demo: boolean;
	}
</script>

<script lang="ts">
	/**
	 * The sun study: view tabs, the plan (Astra's Top down / 3D / Walk views), legend + gesture hints,
	 * the live summary, Sun score, the DayTrace timeline, the Sun position + Unit details cards
	 * (beside the plan on wide screens) and "How we worked this out".
	 * Shared by /unit and the public share page /s, so both look exactly the same.
	 */
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { replaceState } from '$app/navigation';
	import Icon from '#lib/components/Icon.svelte';
	import SunTimeline from '#lib/components/SunTimeline.svelte';
	import SunInfoSheet from '#lib/components/SunInfoSheet.svelte';
	import Collapse from '#lib/components/Collapse.svelte';
	import { TopDownView, Plan3DView, WalkView } from '#lib/views/index.ts';
	import type { Unit } from '#lib/sample-unit.ts';
	import type { View } from '#lib/stores/unit-view.svelte.ts';
	import { sunPosition, localDate, sunTimes, compass } from '#lib/sun.ts';
	import { sunPatches, darkness, furnitureLight, indoorExposure, ITEM_LABELS } from '#lib/light.ts';
	import { sunColor } from '#lib/sun-tint.ts';
	import { sunScore, facingWords } from '#lib/sun-score.ts';
	import { parseViewHash, viewHash } from '#lib/share-state.ts';
	import { profile } from '#lib/stores/profile.svelte.ts';

	let {
		unit,
		vs,
		info,
		views = ['top', '3d', 'walk']
	}: { unit: Unit; vs: { view: View; date: string; minutes: number }; info: StudyInfo; views?: View[] } = $props();

	const LABELS: Record<View, string> = { top: 'Top down', '3d': '3D plan', walk: 'Walk' };

	// ---- view state in the URL hash (#v=top&d=2026-06-21&t=660) so a copied link opens the same view
	let hashReady = false;
	function fromHash() {
		const s = parseViewHash(location.hash, { view: vs.view, date: vs.date, minutes: vs.minutes });
		vs.view = views.includes(s.view) ? s.view : views[0];
		vs.date = s.date;
		vs.minutes = s.minutes;
	}
	onMount(() => {
		fromHash();
		hashReady = true;
		// A link pasted into the address bar of an already-open page only changes the hash.
		addEventListener('hashchange', fromHash);
		return () => removeEventListener('hashchange', fromHash);
	});
	let hashTimer: ReturnType<typeof setTimeout> | undefined;
	$effect(() => {
		const h = viewHash({ view: vs.view, date: vs.date, minutes: vs.minutes });
		if (!hashReady) return;
		clearTimeout(hashTimer);
		hashTimer = setTimeout(() => {
			if (location.hash !== h) {
				try {
					replaceState(page.url.pathname + page.url.search + h, page.state);
				} catch {
					/* router not ready yet */
				}
			}
		}, 350);
		return () => clearTimeout(hashTimer);
	});

	// ---- canvas height (drag the grip)
	const H_KEY = 'rea.canvasH';
	let canvasH = $state(320);
	$effect(() => {
		const saved = Number(localStorage.getItem(H_KEY));
		canvasH = saved > 0 ? clampH(saved) : clampH(Math.round(innerHeight * 0.38));
	});
	function clampH(h: number) {
		return Math.round(Math.min(innerHeight * 0.85, Math.max(220, h)));
	}
	let dragY: number | null = null;
	function hDown(e: PointerEvent) {
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		dragY = e.clientY;
	}
	function hMove(e: PointerEvent) {
		if (dragY === null) return;
		canvasH = clampH(canvasH + (e.clientY - dragY));
		dragY = e.clientY;
	}
	function hUp() {
		dragY = null;
		try {
			localStorage.setItem(H_KEY, String(canvasH));
		} catch {
			/* ignore */
		}
	}

	// ---- the sun and the light
	let grid = $state(true);
	let zoomPct = $state(100);
	let plan = $state<{ zoomBy(f: number): void; getScale(): number; reset(): void }>();
	function zoom(f: number) {
		plan?.zoomBy(f);
		zoomPct = Math.round((plan?.getScale() ?? 1) * 100);
	}
	const sun = $derived(sunPosition(localDate(vs.date, vs.minutes), unit.lat, unit.lon));
	const patches = $derived(sunPatches(unit, sun.azimuth, sun.altitude));
	const dark = $derived(darkness(sun.altitude));
	const furniture = $derived(furnitureLight(unit, sun.azimuth, sun.altitude, patches));
	const tint = $derived(sunColor(vs.minutes));
	const times = $derived(sunTimes(vs.date, unit.lat, unit.lon));
	const exposure = $derived(
		times.sunrise !== null && times.sunset !== null
			? indoorExposure(unit, (m) => sunPosition(localDate(vs.date, m), unit.lat, unit.lon), times.sunrise, times.sunset)
			: null
	);
	const score = $derived(sunScore(unit));
	const sunnyItems = $derived([...new Set([...furniture.lit].map((i) => ITEM_LABELS[unit.items[i].kind]).filter((n) => n !== 'Rug'))]);
	const litWalls = $derived(
		[...new Set(unit.windows.filter((w) => {
			const az = ((sun.azimuth - unit.bearing) * Math.PI) / 180;
			return sun.altitude > 0 && Math.sin(az) * w.normal[0] - Math.cos(az) * w.normal[1] > 0.03;
		}).map((w) => compass(Math.atan2(w.normal[0], -w.normal[1]) * (180 / Math.PI) + unit.bearing)))]
	);
	const summary = $derived(
		sun.altitude <= 0
			? 'The sun is down — the home is in shade.'
			: litWalls.length
				? `Direct sun through the ${litWalls.join(' & ')}-facing windows.` +
					(sunnyItems.length ? ` In the sun: ${sunnyItems.join(', ').toLowerCase()}.` : '')
				: 'Sun is up, but no windows face it right now — soft daylight only.'
	);
	let infoOpen = $state(false);
	let howOpen = $state(false);
	function fmtMin(m: number | null) {
		if (m === null) return '—';
		m = ((Math.round(m) % 1440) + 1440) % 1440;
		const h = Math.floor(m / 60);
		const mm = String(m % 60).padStart(2, '0');
		return profile.data.clock === '24h' ? `${String(h).padStart(2, '0')}:${mm}` : `${((h + 11) % 12) + 1}:${mm} ${h < 12 ? 'AM' : 'PM'}`;
	}
	const dateLabel = $derived(new Date(vs.date + 'T00:00:00').toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' }));
	const hint = $derived(
		vs.view === 'top'
			? 'Drag to pan · pinch or + / − to zoom'
			: vs.view === '3d'
				? 'Drag to turn · pinch or + / − to zoom'
				: 'Joystick or W A S D to walk · drag to look around'
	);

	// ---- "How we worked this out"
	const glazing = $derived.by(() => {
		const groups = new Map<string, number>();
		let doors = 0;
		for (const w of unit.windows) {
			if (w.sill <= 0) {
				doors++;
				continue;
			}
			const g = w.head - w.sill;
			const label = g >= unit.ceiling - 5 ? 'full height' : `${(g / 100).toFixed(1)} m of glass`;
			groups.set(label, (groups.get(label) ?? 0) + 1);
		}
		const parts = [...groups].map(([l, n]) => `${n} × ${l}`);
		return { windows: parts.join(', ') || 'none drawn', doors };
	});
	const balcony = $derived(unit.balcony ? `${Math.round(unit.balcony.d)} cm deep (drawn, but not used to shade the windows)` : 'None drawn — windows are treated as unshaded');
	const traceSource = $derived(
		info.demo ? 'Built-in demo plan' : info.plan?.source === 'ai' ? 'Traced by AI from your floor plan, checked in Studio' : 'Traced in Studio from your floor plan'
	);
	const scaleSource = $derived(
		info.demo
			? 'Drawn to scale'
			: info.plan?.scaleSource === 'dimensions'
				? `Read from the plan (${info.plan.scaleNote ?? 'dimension line'})`
				: `Fitted to the unit's size (${info.sizeSqft?.toLocaleString() ?? '—'} sq ft)`
	);
	const northNote = $derived(
		info.demo
			? 'Set for the demo'
			: info.northAngle !== null
				? `Set by you — plan turned ${Math.round(info.northAngle)}° to put north up`
				: 'Set by you when you turned the plan north-up'
	);
</script>

<div class="study">
	<section class="viewer">
		<div class="seg" role="tablist" aria-label="View">
			{#each views as v (v)}
				<button role="tab" aria-selected={vs.view === v} class:on={vs.view === v} onclick={() => { vs.view = v; zoomPct = 100; }}>{LABELS[v]}</button>
			{/each}
		</div>

		<div class="canvas" style:height="{canvasH}px">
			<div class="scene">
			{#if vs.view === 'walk'}
				<WalkView {unit} {sun} {patches} {dark} {furniture} sunColor={tint} eyeLevelCm={profile.eyeLevelCm} walkSpeed={profile.data.walkSpeed} lookSensitivity={profile.data.lookSensitivity} onexit={() => (vs.view = views[0])} />
			{:else if vs.view === 'top'}
					<TopDownView bind:this={plan} {unit} {sun} {patches} {dark} {furniture} sunColor={tint} showSun={profile.data.showSunMarker} bind:grid onzoom={(k) => (zoomPct = Math.round(k * 100))} />
			{:else}
					<Plan3DView bind:this={plan} {unit} {sun} {patches} {dark} {furniture} sunColor={tint} showSun={profile.data.showSunMarker} bind:grid onzoom={(k) => (zoomPct = Math.round(k * 100))} />
			{/if}
			</div>
			{#if vs.view !== 'walk'}
				<div class="zoom">
					<button onclick={() => zoom(1.2)} aria-label="Zoom in"><Icon name="plus" size={16} /></button>
					<span>{zoomPct}%</span>
					<button onclick={() => zoom(1 / 1.2)} aria-label="Zoom out"><Icon name="minus" size={16} /></button>
					<button class="g" onclick={() => (grid = !grid)} aria-label="Toggle grid" aria-pressed={grid}><Icon name="grid" size={15} /></button>
				</div>
			{/if}
		</div>
		<div
			class="grip"
			role="slider"
			aria-label="Resize view"
			aria-valuenow={canvasH}
			tabindex="0"
			onpointerdown={hDown}
			onpointermove={hMove}
			onpointerup={hUp}
			onpointercancel={hUp}
			onkeydown={(e) => {
				if (e.key === 'ArrowDown') canvasH = clampH(canvasH + 30);
				else if (e.key === 'ArrowUp') canvasH = clampH(canvasH - 30);
				else return;
				e.preventDefault();
				hUp();
			}}
		>
			<span></span>
		</div>
		<div class="legend">
			<span class="key"><i class="am"></i>Pale yellow = morning sun</span>
			<span class="key"><i class="pm"></i>Orange = afternoon sun</span>
			<span class="hint">{hint}</span>
		</div>
	</section>

	<div class="below">
		<p class="summary">{summary}</p>
		{#if score}
			<button class="score" onclick={() => (howOpen = true)} aria-label="Sun score {score.score} out of 10. How we worked this out">
				<strong>{score.score.toFixed(1)}</strong><small>/10</small>
				<span>
					<b>Sun score · {score.verdict}</b>
					<em>{score.room} faces {score.facingWords} ({score.facingDeg}°)</em>
				</span>
			</button>
		{/if}
	</div>

	<aside class="side">
		<section class="card">
			<h3><Icon name="sun" size={16} /> Sun position</h3>
			<p class="big">{fmtMin(vs.minutes)} <span class="muted">· {dateLabel}</span></p>
			{#if sun.altitude > 0}
				<p>{Math.round(sun.altitude)}° up, in the {facingWords(sun.azimuth)} ({Math.round(sun.azimuth)}°)</p>
			{:else}
				<p class="muted">Below the horizon</p>
			{/if}
			<p class="muted small">Sunrise {fmtMin(times.sunrise)} · Sunset {fmtMin(times.sunset)}</p>
			<button class="link" onclick={() => (infoOpen = true)}>More sun info</button>
		</section>
		<section class="card">
			<h3><Icon name="home" size={16} /> Unit details</h3>
			<dl>
				<dt>Type</dt><dd>{info.typeLabel}</dd>
				<dt>Unit</dt><dd>{[info.unitNo, info.level !== null ? `Level ${info.level}` : ''].filter(Boolean).join(' · ') || '—'}</dd>
				<dt>Size</dt><dd>{info.sizeSqft ? `${info.sizeSqft.toLocaleString()} sq ft` : '—'}</dd>
				<dt>Ceiling</dt><dd>{(info.ceilingCm / 100).toFixed(2)} m</dd>
				{#if score}<dt>Facing</dt><dd>{score.facingWords} ({score.facingDeg}°)</dd>{/if}
			</dl>
		</section>
	</aside>

	<div class="timeline">
		<SunTimeline bind:minutes={vs.minutes} bind:date={vs.date} sunrise={times.sunrise} sunset={times.sunset} lat={unit.lat} lon={unit.lon} {sun} {exposure} oninfo={() => (infoOpen = true)} />
	</div>

	<div class="how">
		<Collapse title="How we worked this out" bind:open={howOpen}>
			<dl>
				<dt>Floor plan</dt><dd>{traceSource}</dd>
				<dt>Scale</dt><dd>{scaleSource}</dd>
				<dt>North</dt><dd>{northNote}</dd>
				<dt>Windows</dt><dd>{unit.windows.length - glazing.doors} — {glazing.windows}</dd>
				<dt>Glass doors</dt><dd>{glazing.doors ? `${glazing.doors} (sun from the floor up)` : 'None'}</dd>
				<dt>Balcony / ledge</dt><dd>{balcony}</dd>
				<dt>Ceiling</dt><dd>{(unit.ceiling / 100).toFixed(2)} m</dd>
				<dt>Sun</dt><dd>Calculated for {unit.lat.toFixed(4)}, {unit.lon.toFixed(4)} (Singapore time)</dd>
				<dt>Surroundings</dt><dd>Neighbouring buildings and trees are <strong>not</strong> included — the unit is treated as unobstructed</dd>
				{#if score}
					<dt>Sun score</dt>
					<dd>Direct afternoon sun (after 1 pm) on the {score.room.toLowerCase()} windows, added up over a year. 10 = none, 1 = the hottest facing at this location.</dd>
				{/if}
			</dl>
			<p class="muted small">Estimates for guidance only.</p>
		</Collapse>
	</div>
</div>

<SunInfoSheet bind:open={infoOpen} {unit} {sun} date={vs.date} minutes={vs.minutes} sunrise={times.sunrise} sunset={times.sunset} fmt={fmtMin} />

<style>
	.study {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		grid-template-areas: 'viewer' 'below' 'timeline' 'side' 'how';
		gap: 0 20px;
	}
	.viewer {
		grid-area: viewer;
		background: var(--canvas);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		overflow: hidden;
	}
	.below {
		grid-area: below;
	}
	.timeline {
		grid-area: timeline;
	}
	.side {
		grid-area: side;
		display: grid;
		gap: 12px;
		margin-top: 12px;
	}
	.how {
		grid-area: how;
		margin-top: 10px;
	}
	@media (min-width: 1100px) {
		.study {
			grid-template-columns: minmax(0, 1fr) 300px;
			grid-template-areas: 'viewer side' 'below side' 'timeline timeline' 'how how';
		}
		.side {
			margin-top: 0;
			align-content: start;
		}
	}
	.seg {
		display: flex;
		gap: 4px;
		margin: 10px;
		padding: 4px;
		background: var(--surface-2);
		border-radius: 14px;
	}
	.seg button {
		flex: 1;
		min-height: 42px;
		border: 0;
		border-radius: 11px;
		background: transparent;
		color: var(--muted);
		font-weight: 600;
		font-size: 15px;
		cursor: pointer;
	}
	.seg button.on {
		background: var(--surface);
		color: var(--forest);
		box-shadow: var(--shadow);
	}
	.canvas {
		position: relative;
		border-top: 1px solid var(--line);
	}
	/* Plan colours read by the views (the floor stays light in dark mode, so labels stay dark). */
	.scene {
		height: 100%;
		--floor: #e9dfcb;
		--floor-line: #dccfb6;
		--wall: #3a4139;
		--wall-top: #59625a;
		--glass: #9fb8b9;
		--balcony: #e4e2d8;
		--ochre: #f6c453;
		--forest: #476551;
	}
	:global([data-mode='dark']) .scene {
		--floor: #cbbfa6;
		--floor-line: #bcae93;
		--balcony: #4a4a44;
		--text: #24302a;
		--surface: #1f2420;
	}
	.grip {
		height: 22px;
		display: grid;
		place-items: center;
		cursor: ns-resize;
		touch-action: none;
		border-top: 1px solid var(--line);
	}
	.grip span {
		width: 44px;
		height: 5px;
		border-radius: 3px;
		background: color-mix(in srgb, var(--muted) 55%, transparent);
	}
	.legend {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px 14px;
		padding: 8px 12px 10px;
		font-size: 12px;
		color: var(--muted);
		border-top: 1px solid var(--line);
	}
	.key {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	.key i {
		width: 14px;
		height: 10px;
		border-radius: 3px;
		border: 1px solid color-mix(in srgb, var(--text) 15%, transparent);
	}
	.key .am {
		background: #f6e27a;
	}
	.key .pm {
		background: #f28c30;
	}
	.hint {
		margin-left: auto;
	}
	@media (max-width: 560px) {
		.hint {
			margin-left: 0;
			width: 100%;
		}
	}
	.zoom {
		position: absolute;
		right: 12px;
		top: 12px;
		display: flex;
		flex-direction: column;
		align-items: center;
		background: color-mix(in srgb, var(--surface) 92%, transparent);
		border: 1px solid var(--line);
		border-radius: 12px;
		padding: 2px;
		z-index: 3;
	}
	.zoom button {
		width: 34px;
		height: 34px;
		border: 0;
		background: none;
		border-radius: 9px;
		display: grid;
		place-items: center;
		cursor: pointer;
		color: var(--text);
	}
	.zoom .g {
		border-top: 1px solid var(--line);
		border-radius: 0 0 9px 9px;
	}
	.zoom button[aria-pressed='true'] {
		color: var(--forest);
	}
	.zoom span {
		font-size: 10px;
		font-variant-numeric: tabular-nums;
		color: var(--muted);
	}
	.summary {
		margin: 12px 4px 8px;
		font-size: 14px;
		color: var(--muted);
	}
	.score {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		min-height: 52px;
		margin: 0 0 4px;
		padding: 8px 12px;
		border: 1px solid var(--line);
		border-radius: var(--radius-sm);
		background: var(--surface);
		color: var(--text);
		text-align: left;
		cursor: pointer;
	}
	.score strong {
		font-size: 24px;
		font-family: var(--serif);
		color: var(--forest);
		line-height: 1;
	}
	.score small {
		color: var(--muted);
		margin-left: -8px;
		align-self: flex-end;
		margin-bottom: 4px;
	}
	.score span {
		display: grid;
		gap: 2px;
		min-width: 0;
	}
	.score b {
		font-size: 14px;
	}
	.score em {
		font-style: normal;
		font-size: 12px;
		color: var(--muted);
	}
	.card {
		padding: 14px 16px;
	}
	.card h3 {
		display: flex;
		align-items: center;
		gap: 6px;
		margin: 0 0 8px;
		font-size: 12px;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--muted);
	}
	.card p {
		margin: 0 0 4px;
		font-size: 14px;
	}
	.card .big {
		font-size: 20px;
		font-weight: 600;
	}
	.card .big .muted {
		font-size: 14px;
		font-weight: 400;
	}
	.link {
		border: 0;
		background: none;
		padding: 10px 0 0;
		min-height: 44px;
		color: var(--forest);
		font-weight: 600;
		cursor: pointer;
	}
	dl {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: 8px 16px;
		margin: 0;
		font-size: 14px;
	}
	dt {
		color: var(--muted);
	}
	dd {
		margin: 0;
	}
	.small {
		font-size: 12px;
		margin: 10px 0 0;
	}
</style>
