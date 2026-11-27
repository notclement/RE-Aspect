<script lang="ts">
	/**
	 * Sun position at a glance: the day's sun path (sunrise → sunset) as an arc, with the sun
	 * marked where it is at the selected time, plus altitude / azimuth and rise / set times.
	 */
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
		full = false
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

<div class="sp" class:night={!up} class:full>
	<div class="now">
		<span class="bubble"><Icon name={up ? 'sun' : 'moon'} size={24} /></span>
		<div>
			<div class="time">{fmt(minutes)}</div>
			<div class="lbl">{label}</div>
		</div>
	</div>

	<div class="mid">
	<svg class="arc" viewBox="0 0 {W} {H}" aria-label="Sun path for the day" role="img">
		{#if path}
			<path d={area} class="fill" />
			<path d={line} class="path" />
		{/if}
		<line x1="4" y1={BASE} x2={W - 4} y2={BASE} class="horizon" />
		{#if up}
			<line x1={sx} y1={sy} x2={sx} y2={BASE} class="drop" />
			<circle cx={sx} cy={sy} r="10" class="halo" />
			<circle cx={sx} cy={sy} r="5.5" class="disc" />
		{/if}
	</svg>
	<div class="rs">
		<span>Rise <strong>{sunrise === null ? '—' : fmt(sunrise)}</strong></span>
		<span>Set <strong>{sunset === null ? '—' : fmt(sunset)}</strong></span>
	</div>
	</div>

	<div class="stats">
		<div><span>Altitude</span><strong>{up ? `${altitude.toFixed(1)}°` : '—'}</strong></div>
		<div><span>Azimuth</span><strong>{up ? `${Math.round(azimuth)}° ${compass(azimuth)}` : '—'}</strong></div>
	</div>
</div>

<style>
	.sp {
		display: grid;
		grid-template-columns: 250px minmax(0, 1fr) 230px;
		grid-template-areas: 'now mid stats';
		align-items: center;
		gap: 4px 18px;
		padding-bottom: 12px;
		margin-bottom: 12px;
		border-bottom: 1px solid var(--line);
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
		color: var(--ochre);
		flex-shrink: 0;
		transition: background 0.4s, color 0.4s;
	}
	.night .bubble {
		background: var(--surface-2);
		color: var(--muted);
	}
	.time {
		font-family: var(--serif);
		font-size: 30px;
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
	}
	.arc {
		width: 100%;
		display: block;
	}
	.fill {
		fill: var(--ochre-soft);
		opacity: 0.75;
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
			grid-template-areas: 'now mid';
			gap: 10px;
			padding-bottom: 8px;
			margin-bottom: 8px;
		}
		.sp:not(.full) .stats,
		.sp:not(.full) .rs {
			display: none;
		}
		.sp:not(.full) .bubble {
			width: 36px;
			height: 36px;
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
