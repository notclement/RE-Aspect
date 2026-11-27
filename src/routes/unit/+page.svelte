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
	import { sunPosition, localDate, sunTimes, todaySG, nowMinutesSG, compass } from '#lib/sun.ts';
	import { sunPatches, darkness } from '#lib/light.ts';
	import { nav } from '#lib/stores/nav.svelte.ts';
	import { profile } from '#lib/stores/profile.svelte.ts';

	type View = '3d' | 'top' | 'walk';
	const views: { id: View; label: string }[] = [
		{ id: '3d', label: '3D plan' },
		{ id: 'top', label: 'Top down' },
		{ id: 'walk', label: 'Walk' }
	];

	// Phase 1: load by id (page.url.searchParams.get('id')) from Supabase / local cache.
	// For now only the built-in sample unit exists.
	const unitId = $derived(page.url.searchParams.get('id') ?? 'sample');
	const unit = SAMPLE_UNIT;

	let view = $state<View>('3d');
	let date = $state(todaySG());
	let minutes = $state(Math.max(7 * 60, Math.min(18 * 60, nowMinutesSG())));
	let grid = $state(true);
	let planView = $state<PlanView>();
	let zoomPct = $state(100);

	$effect(() => nav.set({ label: 'Units', href: '/' }, { label: 'Sun study' }));

	const sun = $derived(sunPosition(localDate(date, minutes), unit.lat, unit.lon));
	const patches = $derived(sunPatches(unit, sun.azimuth, sun.altitude));
	const dark = $derived(darkness(sun.altitude));
	const times = $derived(sunTimes(date, unit.lat, unit.lon));

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
				? `Direct sun through the ${litWalls.join(' & ')}-facing windows.`
				: 'Sun is up, but no windows face it right now — soft daylight only.'
	);
</script>

<svelte:head><title>{unit.name} · RE:Aspect</title></svelte:head>

<h1>{unit.name}</h1>
<p class="sub muted">{unit.unitNo} · Level {unit.level} · {unit.sizeSqft.toLocaleString()} sq ft · Demo unit</p>

<section class="viewer">
	<div class="seg" role="tablist" aria-label="View">
		{#each views as v (v.id)}
			<button role="tab" aria-selected={view === v.id} class:on={view === v.id} onclick={() => { view = v.id; zoomPct = 100; }}>{v.label}</button>
		{/each}
	</div>

	<div class="canvas">
		{#if view === 'walk'}
			<div class="walk">
				<Icon name="walk" size={34} />
				<strong>Walkthrough</strong>
				<p class="muted">Walk the unit at your own eye level ({profile.eyeLevelCm} cm). Arrives in Phase 3.</p>
			</div>
		{:else}
			{#key view}
				<PlanView bind:this={planView} {unit} mode={view} {patches} {dark} {grid} />
			{/key}
			<div class="zoom">
				<button onclick={() => zoom(1 / 1.2)} aria-label="Zoom out"><Icon name="minus" size={18} /></button>
				<span>{zoomPct}%</span>
				<button onclick={() => zoom(1.2)} aria-label="Zoom in"><Icon name="plus" size={18} /></button>
				<button onclick={() => (grid = !grid)} aria-label="Toggle grid" aria-pressed={grid}><Icon name="grid" size={18} /></button>
			</div>
		{/if}
	</div>
</section>

<p class="summary">{summary}</p>

<SunTimeline bind:minutes bind:date />

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
		height: min(62vh, 560px);
		min-height: 340px;
		border-top: 1px solid var(--line);
	}
	.zoom {
		position: absolute;
		right: 12px;
		bottom: 12px;
		display: flex;
		align-items: center;
		gap: 2px;
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: 12px;
		padding: 3px;
		z-index: 3;
	}
	.zoom button {
		width: 40px;
		height: 40px;
		border: 0;
		background: none;
		border-radius: 9px;
		display: grid;
		place-items: center;
		cursor: pointer;
	}
	.zoom button[aria-pressed='true'] {
		color: var(--forest);
	}
	.zoom span {
		min-width: 48px;
		text-align: center;
		font-variant-numeric: tabular-nums;
		font-size: 14px;
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
	.note {
		font-size: 12px;
		margin: 10px 0 0;
	}
</style>
