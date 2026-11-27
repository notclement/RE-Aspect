<script lang="ts">
	/**
	 * Unit page — the heart of RE:Aspect. One unit, three views (3D plan / Top down / Walk),
	 * the DayTrace sun timeline always underneath, details tucked into collapsibles.
	 * URL: /unit?id=<unit id>  (query param keeps the site fully static)
	 */
	import { page } from '$app/state';
	import Icon from '#lib/components/Icon.svelte';
	import PlanView from '#lib/components/PlanView.svelte';
	import SunTimeline from '#lib/components/SunTimeline.svelte';
	import Collapse from '#lib/components/Collapse.svelte';
	import { SAMPLE_UNIT } from '#lib/sample-unit.ts';
	import { sunPosition, localDate, sunTimes, compass } from '#lib/sun.ts';
	import { sunPatches, darkness, furnitureLight, windowRays, ITEM_LABELS } from '#lib/light.ts';
	import { nav } from '#lib/stores/nav.svelte.ts';
	import { profile } from '#lib/stores/profile.svelte.ts';

	import { unitView, type View } from '#lib/stores/unit-view.svelte.ts';
	const views: { id: View; label: string }[] = [
		{ id: 'top', label: 'Top down' },
		{ id: '3d', label: '3D plan' },
		{ id: 'walk', label: 'Walk' }
	];

	// Phase 1: load by id (page.url.searchParams.get('id')) from Supabase / local cache.
	// For now only the built-in sample unit exists.
	const unitId = $derived(page.url.searchParams.get('id') ?? 'sample');
	const unit = SAMPLE_UNIT;

	// View, date and time live in a session store so leaving the page and coming back restores them.
	// (Created outside any $derived so it doesn't mutate state during a read.)
	const vs = unitView(page.url.searchParams.get('id') ?? 'sample');
	let grid = $state(true);
	let planView = $state<PlanView>();

	// Canvas height: compact by default so the sun timeline stays on screen; drag the handle to resize.
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
	let zoomPct = $state(100);

	$effect(() => nav.set({ label: 'Units', href: '/' }, { label: 'Sun study' }));

	const sun = $derived(sunPosition(localDate(vs.date, vs.minutes), unit.lat, unit.lon));
	const patches = $derived(sunPatches(unit, sun.azimuth, sun.altitude));
	const dark = $derived(darkness(sun.altitude));
	const furniture = $derived(furnitureLight(unit, sun.azimuth, sun.altitude, patches));
	const rays = $derived(windowRays(unit, sun.azimuth, sun.altitude));
	const sunnyItems = $derived(
		[...new Set([...furniture.lit].map((i) => ITEM_LABELS[unit.items[i].kind]).filter((n) => n !== 'Rug'))]
	);
	const times = $derived(sunTimes(vs.date, unit.lat, unit.lon));

	const litWalls = $derived(
		[...new Set(unit.windows.filter((w) => {
			const az = ((sun.azimuth - unit.bearing) * Math.PI) / 180;
			return sun.altitude > 0 && Math.sin(az) * w.normal[0] - Math.cos(az) * w.normal[1] > 0.03;
		}).map((w) => compass(Math.atan2(w.normal[0], -w.normal[1]) * (180 / Math.PI) + unit.bearing)))]
	);

	function zoom(f: number) {
		planView?.zoomBy(f);
		zoomPct = Math.round((planView?.getScale() ?? 1) * 100);
	}
	function fmtMin(m: number | null) {
		if (m === null) return '—';
		const h = Math.floor(m / 60);
		const mm = String(m % 60).padStart(2, '0');
		return profile.data.clock === '24h' ? `${String(h).padStart(2, '0')}:${mm}` : `${((h + 11) % 12) + 1}:${mm} ${h < 12 ? 'AM' : 'PM'}`;
	}
	const summary = $derived(
		sun.altitude <= 0
			? 'The sun is down — the unit is in shade.'
			: litWalls.length
				? `Direct sun through the ${litWalls.join(' & ')}-facing windows.` +
					(sunnyItems.length ? ` In the sun: ${sunnyItems.join(', ').toLowerCase()}.` : '')
				: 'Sun is up, but no windows face it right now — soft daylight only.'
	);
</script>

<svelte:head><title>{unit.name} · RE:Aspect</title></svelte:head>

<h1>{unit.name}</h1>
<p class="sub muted">{unit.unitNo} · Level {unit.level} · {unit.sizeSqft.toLocaleString()} sq ft · Demo unit</p>

<section class="viewer">
	<div class="seg" role="tablist" aria-label="View">
		{#each views as v (v.id)}
			<button role="tab" aria-selected={vs.view === v.id} class:on={vs.view === v.id} onclick={() => { vs.view = v.id; zoomPct = 100; }}>{v.label}</button>
		{/each}
	</div>

	<div class="canvas" style:height="{canvasH}px">
		{#if vs.view === 'walk'}
			<div class="walk">
				<Icon name="walk" size={34} />
				<strong>Walkthrough</strong>
				<p class="muted">Walk the unit at your own eye level ({profile.eyeLevelCm} cm). Arrives in Phase 3.</p>
			</div>
		{:else}
			{#key vs.view}
				<PlanView bind:this={planView} {unit} mode={vs.view} {patches} {dark} {sun} {furniture} windowRays={rays} showSun={profile.data.showSunMarker} {grid} />
			{/key}
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
</section>

<p class="summary">{summary}</p>

<SunTimeline bind:minutes={vs.minutes} bind:date={vs.date} sunrise={times.sunrise} sunset={times.sunset} />

<div class="details">
	<Collapse title="Study details">
		<dl>
			<dt>Unit</dt><dd>{unit.unitNo}, Level {unit.level}</dd>
			<dt>Size</dt><dd>{unit.sizeSqft.toLocaleString()} sq ft</dd>
			<dt>Ceiling</dt><dd>{(unit.ceiling / 100).toFixed(2)} m</dd>
			<dt>Sunrise · sunset</dt><dd>{fmtMin(times.sunrise)} · {fmtMin(times.sunset)}</dd>
			<dt>Model</dt><dd>Standalone unit — neighbouring buildings not modelled</dd>
		</dl>
	</Collapse>
	<Collapse title="Sun info">
		<dl>
			<dt>Azimuth</dt><dd>{sun.azimuth.toFixed(1)}° ({compass(sun.azimuth)})</dd>
			<dt>Altitude</dt><dd>{sun.altitude.toFixed(1)}°</dd>
			<dt>Location</dt><dd>{unit.lat.toFixed(4)}, {unit.lon.toFixed(4)}</dd>
			<dt>Plan rotation</dt><dd>{unit.bearing}° from true north</dd>
		</dl>
		<dl class="src">
			<dt>Data source</dt><dd>Calculated on this device — no internet or outside data needed</dd>
			<dt>Method</dt><dd>Simplified NOAA solar-position equations (from Jean Meeus, <em>Astronomical Algorithms</em>), accurate to well under 1°</dd>
			<dt>Sunrise / sunset</dt><dd>Sun centre 0.833° below the horizon (standard refraction allowance)</dd>
			<dt>Time zone</dt><dd>Singapore, UTC+8 (no daylight saving)</dd>
		</dl>
		<p class="muted note">
			Check against:
			<a href="https://gml.noaa.gov/grad/solcalc/" target="_blank" rel="noopener noreferrer">NOAA Solar Calculator</a> ·
			<a href="https://www.timeanddate.com/sun/singapore/singapore" target="_blank" rel="noopener noreferrer">timeanddate.com — Singapore</a>
		</p>
		<p class="muted note">Calculated estimates for guidance only.</p>
	</Collapse>
</div>

<style>
	h1 {
		margin: 6px 0 2px;
	}
	.sub {
		margin: 0 0 14px;
		font-size: 14px;
	}
	.viewer {
		background: var(--canvas);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		overflow: hidden;
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
	.zoom {
		position: absolute;
		right: 12px;
		top: 64px;
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
	.walk {
		height: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 6px;
		text-align: center;
		padding: 24px;
		color: var(--forest);
	}
	.walk p {
		max-width: 300px;
	}
	.summary {
		margin: 12px 4px;
		font-size: 14px;
		color: var(--muted);
	}
	.details {
		margin-top: 10px;
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
	.src {
		margin-top: 14px;
		padding-top: 12px;
		border-top: 1px dashed var(--line);
	}
	.note a {
		color: var(--forest);
	}
	.note {
		font-size: 12px;
		margin: 10px 0 0;
	}
</style>
