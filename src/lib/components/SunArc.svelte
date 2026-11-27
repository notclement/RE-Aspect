<script lang="ts">
	/**
	 * Sun position at a glance: the day's sun path (sunrise → sunset) as an arc, with the sun
	 * marked where it is at the selected time, plus altitude / azimuth and rise / set times.
	 */
	import type { Snippet } from 'svelte';
	import Icon from './Icon.svelte';
	import { sunPosition, localDate, compass } from '#lib/sun.ts';

	let {
		date,
		minutes,
		lat,
		lon,
		sunrise,
		sunset,
		altitude,
		azimuth,
		fmt,
		full = false,
		exposure = null,
		onpick,
		note = '',
		tools
	}: {
		date: string;
		minutes: number;
		lat: number;
		lon: number;
		sunrise: number | null;
		sunset: number | null;
		altitude: number;
		azimuth: number;
		fmt: (m: number) => string;
		/** Always show every detail (used in the Sun info sheet); otherwise phones get a compact version. */
		full?: boolean;
		/** Sun inside the home through the day (0..1 per sample) and the minute it peaks. */
		exposure?: { pts: { m: number; v: number }[]; peak: number | null } | null;
		/** Jump the timeline to a minute (tapping the peak). */
		onpick?: (m: number) => void;
		/** Short line under the time; replaces the generic label when set. */
		note?: string;
		/** Date / score / info buttons shown under the time (compact timeline). */
		tools?: Snippet;
	} = $props();

	const W = 300;
	const H = 92;
	const BASE = 80; // horizon line
	const X0 = 14;
	const X1 = W - 14;

	// The day's path — recomputed only when the date or place changes (49 samples).
	const path = $derived.by(() => {
		if (sunrise === null || sunset === null) return null;
		const n = 48;
		const pts: { m: number; alt: number }[] = [];
		for (let i = 0; i <= n; i++) {
			const m = sunrise + ((sunset - sunrise) * i) / n;
			pts.push({ m, alt: Math.max(0, sunPosition(localDate(date, m), lat, lon).altitude) });
		}
		const peak = pts.reduce((a, b) => (b.alt > a.alt ? b : a));
		return { pts, peak };
	});

	const xAt = (m: number) => (path ? X0 + ((m - sunrise!) / (sunset! - sunrise!)) * (X1 - X0) : X0);
	const yAt = (alt: number) => (path ? BASE - (Math.max(0, alt) / Math.max(path.peak.alt, 1)) * (BASE - 12) : BASE);

	const line = $derived(path ? path.pts.map((p, i) => `${i ? 'L' : 'M'}${xAt(p.m).toFixed(1)} ${yAt(p.alt).toFixed(1)}`).join(' ') : '');
	const area = $derived(path ? `${line} L${X1} ${BASE} L${X0} ${BASE} Z` : '');

	// Sun inside the home: a warm band under the arc, tallest when the most sunlight lands indoors.
	const inside = $derived.by(() => {
		if (!path || !exposure || exposure.peak === null) return null;
		const top = (BASE - 12) * 0.62;
		const pts = exposure.pts.map((p) => `${xAt(p.m).toFixed(1)} ${(BASE - p.v * top).toFixed(1)}`);
		return { d: `M${xAt(exposure.pts[0].m).toFixed(1)} ${BASE} L${pts.join(' L')} L${xAt(exposure.pts[exposure.pts.length - 1].m).toFixed(1)} ${BASE} Z`, px: xAt(exposure.peak), py: BASE - top };
	});

	const up = $derived(path !== null && minutes >= sunrise! && minutes <= sunset! && altitude > -0.833);
	const sx = $derived(up ? xAt(minutes) : 0);
	const sy = $derived(up ? yAt(altitude) : BASE);

	const label = $derived.by(() => {
		if (!up || !path) return 'Night — sun below the horizon';
		if (altitude < 12) return minutes < path.peak.m ? 'Early morning sun' : 'Evening sun';
		if (Math.abs(minutes - path.peak.m) < 60) return 'Midday sun';
		return minutes < path.peak.m ? 'Morning sunlight' : 'Afternoon sunlight';
	});
</script>

<div class="sp" class:night={!up} class:full class:withtools={!!tools}>
	<div class="now">
		<span class="bubble"><Icon name={up ? 'sun' : 'moon'} size={24} /></span>
		<div>
			<div class="time">{fmt(minutes)}</div>
			<div class="lbl">{note || label}</div>
		</div>
	</div>
	{#if tools}<div class="tl-tools">{@render tools()}</div>{/if}

	<div class="mid">
	<svg class="arc" viewBox="0 0 {W} {H}" aria-label="Sun path for the day" role="img">
		{#if path}
			<path d={area} class="fill" />
			{#if inside}
				<path d={inside.d} class="inside"><title>Sun inside the home through the day — the taller the band, the more floor gets direct sun</title></path>
				<g class="peakhit">
					<title>Most sun inside at {fmt(exposure!.peak!)} — the time the most direct sunlight lands on the floor indoors</title>
					<line x1={inside.px} y1={inside.py - 4} x2={inside.px} y2={BASE} class="peakline" />
					<line x1={inside.px} y1={inside.py - 8} x2={inside.px} y2={BASE} class="hit" />
				</g>
			{/if}
			<path d={line} class="path" />
		{/if}
		<line x1="4" y1={BASE} x2={W - 4} y2={BASE} class="horizon" />
		{#if up}
			<line x1={sx} y1={sy} x2={sx} y2={BASE} class="drop" />
			<circle cx={sx} cy={sy} r="10" class="halo"><title>The sun now: {altitude.toFixed(0)}° up</title></circle>
			<circle cx={sx} cy={sy} r="5.5" class="disc" />
		{/if}
	</svg>
	<div class="rs">
		<span>Rise <strong>{sunrise === null ? '—' : fmt(sunrise)}</strong></span>
		<span>Set <strong>{sunset === null ? '—' : fmt(sunset)}</strong></span>
	</div>
	{#if exposure}
		{#if exposure.peak !== null}
			<button class="peak" onclick={() => onpick?.(exposure!.peak!)} title="Jump to the most sun inside, {fmt(exposure.peak)}" aria-label="Jump to the most sun inside, {fmt(exposure.peak)}">
				<span class="swatch"></span><span class="long">Most sun inside</span><span class="short">Peak inside</span> <strong>{fmt(exposure.peak)}</strong>
			</button>
		{:else}
			<p class="peak none">No direct sun inside on this day</p>
		{/if}
	{/if}
	</div>

	<div class="stats">
		<div><span>Altitude</span><strong>{up ? `${altitude.toFixed(1)}°` : '—'}</strong></div>
		<div><span>Azimuth</span><strong>{up ? `${Math.round(azimuth)}° ${compass(azimuth)}` : '—'}</strong></div>
	</div>
</div>

<style>
	.sp {
		display: grid;
		grid-template-columns: max-content minmax(0, 1fr) 210px;
		grid-template-areas: 'now mid stats' 'tools mid stats';
		align-items: center;
		gap: 4px 18px;
	}
	.now {
		grid-area: now;
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.bubble {
		width: 48px;
		height: 48px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		background: var(--ochre-soft);
		color: var(--ochre-ink);
		flex-shrink: 0;
		transition: background 0.4s, color 0.4s;
	}
	.night .bubble {
		background: var(--surface-2);
		color: var(--muted);
	}
	.time {
		font-family: var(--serif);
		font-size: 28px;
		line-height: 1.05;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	.lbl {
		color: var(--muted);
		font-size: 14px;
	}
	.mid {
		grid-area: mid;
		min-width: 0;
		width: 100%;
		max-width: 340px;
		justify-self: center;
		text-align: center; /* "Most sun inside" sits centred under the arc */
	}
	.tl-tools {
		grid-area: tools;
		align-self: start;
	}
	.sp:not(.withtools):not(.full) {
		grid-template-areas: 'now mid stats' 'now mid stats';
	}
	.now {
		align-self: end;
	}
	.arc {
		width: 100%;
		display: block;
	}
	.fill {
		fill: var(--ochre-soft);
		opacity: 0.75;
	}
	.inside {
		fill: var(--ochre);
		opacity: 0.45;
	}
	.hit {
		stroke: transparent;
		stroke-width: 14;
		cursor: help;
	}
	.peakline {
		stroke: var(--ochre);
		stroke-width: 1.5;
	}
	.peak {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		margin-top: 6px;
		min-height: 36px;
		padding: 4px 10px;
		border: 1px solid color-mix(in srgb, var(--ochre) 45%, transparent);
		border-radius: 999px;
		background: none;
		color: var(--muted);
		font: inherit;
		font-size: 13px;
		cursor: pointer;
	}
	.peak strong {
		color: var(--text);
	}
	.peak {
		white-space: nowrap;
	}
	.short {
		display: none;
	}
	.peak.none {
		border: 0;
		cursor: default;
		padding-left: 0;
	}
	.swatch {
		width: 10px;
		height: 10px;
		border-radius: 3px;
		background: var(--ochre);
		opacity: 0.7;
	}
	.path {
		fill: none;
		stroke: var(--ochre);
		stroke-width: 1.6;
		stroke-dasharray: 4 4;
		opacity: 0.8;
	}
	.horizon {
		stroke: var(--line);
		stroke-width: 1.4;
	}
	.drop {
		stroke: var(--ochre);
		stroke-width: 1;
		stroke-dasharray: 2 3;
		opacity: 0.7;
	}
	.halo {
		fill: #f2b84b;
		opacity: 0.35;
	}
	.disc {
		fill: var(--ochre);
	}
	.stats {
		grid-area: stats;
		display: flex;
		gap: 18px;
	}
	.stats div {
		display: flex;
		flex-direction: column;
		gap: 2px;
		flex: 1;
	}
	.stats div + div {
		border-left: 1px solid var(--line);
		padding-left: 18px;
	}
	.stats span,
	.rs {
		color: var(--muted);
		font-size: 13px;
	}
	.stats strong {
		font-size: 20px;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	.rs {
		display: flex;
		justify-content: space-between;
		margin-top: 2px;
	}
	.rs strong {
		color: var(--text);
	}
	.full {
		padding-bottom: 12px;
		margin-bottom: 12px;
		grid-template-columns: 1fr;
		grid-template-areas: 'now' 'mid' 'stats';
		border-bottom: 0;
		margin-bottom: 0;
	}
	.full .mid {
		max-width: none;
	}
	.full .stats {
		margin-top: 8px;
		padding-top: 10px;
		border-top: 1px solid var(--line);
	}
	@media (max-width: 720px) {
		.sp:not(.full) {
			grid-template-columns: 1fr minmax(0, 150px);
			grid-template-areas: 'now mid' 'tools tools';
			gap: 8px;
		}
		.sp:not(.full) .time {
			font-size: 22px;
		}
		.sp:not(.full) .lbl {
			font-size: 12px;
		}
		.sp:not(.full) .stats,
		.sp:not(.full) .rs {
			display: none;
		}
		.sp:not(.full) .long {
			display: none;
		}
		.sp:not(.full) .short {
			display: inline;
		}
		.sp:not(.full) .peak {
			font-size: 12px;
			padding: 2px 8px;
		}
		.sp:not(.full) .bubble {
			display: none;
		}
		.sp:not(.full) .time {
			font-size: 22px;
		}
		.sp:not(.full) .lbl {
			font-size: 12px;
			line-height: 1.25;
		}
		.sp:not(.full) .now {
			gap: 10px;
			min-width: 0;
		}
	}
</style>
