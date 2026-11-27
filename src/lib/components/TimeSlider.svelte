<script lang="ts">
	/**
	 * The signature DayTrace time slider. Always visible in Sun View, 3D and Walkthrough.
	 * `minutes` = minutes after midnight (bindable). Auto-play cycles the whole range in `cycleSeconds`.
	 * Phase 1 will pass real sunrise/sunset for the unit's location + date.
	 */
	import Icon from './Icon.svelte';
	import { profile } from '#lib/stores/profile.svelte.ts';

	let {
		minutes = $bindable(16 * 60 + 30),
		start = 6 * 60,
		end = 20 * 60,
		sunrise = 7 * 60,
		sunset = 19 * 60 + 5,
		cycleSeconds = 25,
		dateLabel = new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
	}: {
		minutes?: number;
		start?: number;
		end?: number;
		sunrise?: number;
		sunset?: number;
		cycleSeconds?: number;
		dateLabel?: string;
	} = $props();

	let playing = $state(false);
	let raf = 0;
	let last = 0;

	function fmt(m: number) {
		const h = Math.floor(m / 60);
		const mm = String(Math.floor(m % 60)).padStart(2, '0');
		if (profile.data.clock === '24h') return `${String(h).padStart(2, '0')}:${mm}`;
		const h12 = ((h + 11) % 12) + 1;
		return `${h12}:${mm} ${h < 12 ? 'AM' : 'PM'}`;
	}

	function tick(t: number) {
		if (!playing) return;
		const dt = last ? (t - last) / 1000 : 0;
		last = t;
		const span = end - start;
		let next = minutes + (span / cycleSeconds) * dt;
		if (next > end) next = start; // loop the day
		minutes = next;
		raf = requestAnimationFrame(tick);
	}

	function toggle() {
		playing = !playing;
		last = 0;
		if (playing) raf = requestAnimationFrame(tick);
		else cancelAnimationFrame(raf);
	}

	$effect(() => () => cancelAnimationFrame(raf));

	function onKey(e: KeyboardEvent) {
		const step = e.shiftKey ? 60 : 10;
		if (e.key === 'ArrowRight') minutes = Math.min(end, minutes + step);
		else if (e.key === 'ArrowLeft') minutes = Math.max(start, minutes - step);
		else return;
		e.preventDefault();
	}

	const pct = $derived(((minutes - start) / (end - start)) * 100);
	const ticks = $derived(
		Array.from({ length: Math.floor((end - start) / 180) + 1 }, (_, i) => start + i * 180)
	);
</script>

<div class="ts">
	<div class="top">
		<button class="play" onclick={toggle} aria-label={playing ? 'Pause day' : 'Play through the day'}>
			<Icon name={playing ? 'pause' : 'play'} size={12} />
		</button>
		<span class="time">{fmt(minutes)}</span>
		<span class="date">{dateLabel}</span>
		<span class="sun muted">↑ {fmt(sunrise)} · ↓ {fmt(sunset)}</span>
	</div>
	<div class="track-wrap">
		<input
			type="range"
			min={start}
			max={end}
			step="1"
			bind:value={minutes}
			onkeydown={onKey}
			aria-label="Time of day"
			aria-valuetext={fmt(minutes)}
			style:--pct="{pct}%"
		/>
	</div>
	<div class="ticks muted">
		{#each ticks as t (t)}<span>{fmt(t).replace(':00', '')}</span>{/each}
	</div>
</div>

<style>
	.ts {
		background: color-mix(in srgb, var(--surface) 94%, transparent);
		backdrop-filter: blur(8px);
		border: 1px solid var(--line);
		border-radius: 14px;
		padding: 8px 12px 6px;
		box-shadow: var(--shadow);
		user-select: none;
	}
	.top {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.play {
		width: 30px;
		height: 30px;
		border-radius: 50%;
		border: 0;
		background: var(--text);
		color: var(--paper);
		display: grid;
		place-items: center;
		cursor: pointer;
	}
	.time {
		font-weight: 700;
		font-size: 17px;
		font-variant-numeric: tabular-nums;
		min-width: 78px;
	}
	.date {
		font-size: 12px;
		padding: 2px 8px;
		border-radius: 20px;
		background: var(--surface-2);
	}
	.sun {
		margin-left: auto;
		font-size: 11px;
	}
	.track-wrap {
		padding: 10px 0 4px;
	}
	input[type='range'] {
		-webkit-appearance: none;
		appearance: none;
		width: 100%;
		height: 10px;
		border-radius: 6px;
		background: linear-gradient(
			90deg,
			#3b4a66 0%,
			#e9a47e 10%,
			#ffd98a 28%,
			#fff1c7 50%,
			#ffd98a 72%,
			#e46f4e 90%,
			#3b4a66 100%
		);
		outline: none;
		touch-action: none; /* dragging the slider never scrolls the page */
		margin: 0;
	}
	input[type='range']::-webkit-slider-thumb {
		-webkit-appearance: none;
		width: 26px;
		height: 26px;
		border-radius: 50%;
		background: #fff;
		border: 4px solid var(--dusk);
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
		cursor: grab;
	}
	input[type='range']::-moz-range-thumb {
		width: 20px;
		height: 20px;
		border-radius: 50%;
		background: #fff;
		border: 4px solid var(--dusk);
		cursor: grab;
	}
	input[type='range']:focus-visible::-webkit-slider-thumb {
		outline: 3px solid var(--sun);
	}
	.ticks {
		display: flex;
		justify-content: space-between;
		font-size: 10px;
	}
</style>
