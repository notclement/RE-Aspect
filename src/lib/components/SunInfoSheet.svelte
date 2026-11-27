<script lang="ts">
	/**
	 * "Sun info" — opened from the ⓘ on the Sun timeline. Full sun position (arc, altitude, azimuth,
	 * rise/set), where the unit is, and where the numbers come from. Bottom sheet on phones, dialog on desktop.
	 */
	import Icon from './Icon.svelte';
	import SunArc from './SunArc.svelte';
	import type { Unit } from '#lib/sample-unit.ts';

	let {
		open = $bindable(false),
		unit,
		sun,
		date,
		minutes,
		sunrise,
		sunset,
		fmt
	}: {
		open?: boolean;
		unit: Unit;
		sun: { altitude: number; azimuth: number };
		date: string;
		minutes: number;
		sunrise: number | null;
		sunset: number | null;
		fmt: (m: number) => string;
	} = $props();

	const dayLen = $derived(sunrise !== null && sunset !== null ? sunset - sunrise : null);
	const dateLabel = $derived(
		new Date(date + 'T12:00:00').toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
	);

	function onKey(e: KeyboardEvent) {
		if (open && e.key === 'Escape') open = false;
	}
</script>

<svelte:window onkeydown={onKey} />

{#if open}
	<button class="scrim" aria-label="Close sun info" onclick={() => (open = false)}></button>
	<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="suninfo-title">
		<div class="grab" aria-hidden="true"></div>
		<header>
			<Icon name="sun" size={20} />
			<h2 id="suninfo-title">Sun info</h2>
			<span class="muted">{dateLabel}</span>
			<button class="x" onclick={() => (open = false)} aria-label="Close"><Icon name="close" size={20} /></button>
		</header>

		<SunArc {date} {minutes} lat={unit.lat} lon={unit.lon} {sunrise} {sunset} altitude={sun.altitude} azimuth={sun.azimuth} {fmt} full />

		<dl>
			<dt>Daylight</dt><dd>{dayLen === null ? '—' : `${Math.floor(dayLen / 60)} h ${dayLen % 60} min`}</dd>
			<dt>Location</dt><dd>{unit.lat.toFixed(4)}, {unit.lon.toFixed(4)}</dd>
			<dt>Plan rotation</dt><dd>{unit.bearing}° from true north</dd>
		</dl>

		<h3>Where this comes from</h3>
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
	</div>
{/if}

<style>
	.scrim {
		position: fixed;
		inset: 0;
		z-index: 40;
		border: 0;
		background: rgba(20, 26, 22, 0.4);
		animation: fade 0.2s ease-out;
	}
	.sheet {
		position: fixed;
		z-index: 41;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		width: min(560px, calc(100vw - 32px));
		max-height: calc(100dvh - 48px);
		overflow-y: auto;
		overscroll-behavior: contain;
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		box-shadow: 0 20px 50px rgba(0, 0, 0, 0.25);
		padding: 16px 18px 20px;
		animation: pop 0.2s ease-out;
	}
	.grab {
		display: none;
	}
	header {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-bottom: 12px;
		color: var(--ochre);
	}
	header h2 {
		margin: 0;
		font-family: var(--serif);
		font-weight: var(--heading-weight);
		font-size: 22px;
		color: var(--text);
	}
	header .muted {
		flex: 1;
		font-size: 13px;
	}
	.x {
		width: 44px;
		height: 44px;
		border: 0;
		border-radius: var(--radius-sm);
		background: var(--surface-2);
		color: var(--text);
		display: grid;
		place-items: center;
		cursor: pointer;
	}
	h3 {
		margin: 18px 0 6px;
		font-size: 12px;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--muted);
	}
	dl {
		display: grid;
		grid-template-columns: 150px 1fr;
		gap: 8px 12px;
		margin: 14px 0 0;
		font-size: 14px;
	}
	dt {
		color: var(--muted);
	}
	dd {
		margin: 0;
	}
	.src {
		margin-top: 0;
	}
	.note {
		font-size: 12px;
		margin: 10px 0 0;
	}
	.note a {
		color: var(--forest);
	}
	@keyframes fade {
		from {
			opacity: 0;
		}
	}
	@keyframes pop {
		from {
			opacity: 0;
			transform: translate(-50%, -48%) scale(0.98);
		}
	}
	@media (max-width: 560px) {
		.sheet {
			left: 0;
			right: 0;
			top: auto;
			bottom: 0;
			transform: none;
			width: auto;
			max-height: 88dvh;
			border-radius: var(--radius) var(--radius) 0 0;
			padding: 8px 16px calc(20px + var(--safe-b));
			animation: up 0.25s cubic-bezier(0.2, 0.8, 0.2, 1);
		}
		.grab {
			display: block;
			width: 40px;
			height: 5px;
			border-radius: 3px;
			background: var(--line);
			margin: 0 auto 10px;
		}
		dl {
			grid-template-columns: 120px 1fr;
			font-size: 13px;
		}
	}
	@keyframes up {
		from {
			transform: translateY(100%);
		}
	}
</style>
