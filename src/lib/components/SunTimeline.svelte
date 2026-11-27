<script lang="ts">
	/**
	 * The DayTrace sun timeline — always visible under every view of a unit.
	 * `minutes` = minutes after local midnight (0–1440). "Auto sun" runs the whole day in `cycleSeconds`.
	 */
	import Icon from './Icon.svelte';
	import { profile } from '#lib/stores/profile.svelte.ts';

	let {
		minutes = $bindable(16 * 60),
		date = $bindable(''),
		cycleSeconds = 25,
		sunrise = null,
		sunset = null
	}: { minutes?: number; date?: string; cycleSeconds?: number; sunrise?: number | null; sunset?: number | null } = $props();

	/** Night passes 1.5× faster than daytime; the speed eases across sunrise/sunset so there's no jolt. */
	const NIGHT_SPEED = 1.5;
	function speedAt(m: number) {
		if (sunrise === null || sunset === null) return 1;
		const ease = 30; // minutes over which speed blends
		const day = Math.min(1, Math.max(0, Math.min(m - sunrise, sunset - m) / ease + 0.5));
		return NIGHT_SPEED - (NIGHT_SPEED - 1) * day;
	}

	let playing = $state(false);
	let raf = 0;
	let last = 0;

	export function fmt(m: number) {
		const mm = ((Math.round(m) % 1440) + 1440) % 1440;
		const h = Math.floor(mm / 60);
		const min = String(mm % 60).padStart(2, '0');
		if (profile.data.clock === '24h') return `${String(h).padStart(2, '0')}:${min}`;
		return `${((h + 11) % 12) + 1}:${min} ${h < 12 ? 'AM' : 'PM'}`;
	}

	function tick(t: number) {
		if (!playing) return;
		const dt = last ? (t - last) / 1000 : 0;
		last = t;
		minutes = (minutes + (1440 / cycleSeconds) * speedAt(minutes) * Math.min(dt, 0.1)) % 1440;
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
		if (e.key === 'ArrowRight') minutes = Math.min(1440, minutes + step);
		else if (e.key === 'ArrowLeft') minutes = Math.max(0, minutes - step);
		else return;
		e.preventDefault();
	}

	const pct = $derived((minutes / 1440) * 100);
	const dateLabel = $derived(
		date
			? new Date(date + 'T12:00:00').toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })
			: ''
	);
	const ticks = [0, 360, 720, 1080, 1440];
	let dateInput: HTMLInputElement;
</script>

<section class="tl">
	<div class="head">
		<Icon name="clock" size={20} />
		<strong>Sun timeline</strong>
		<label class="date">
			<Icon name="cal" size={18} />
			<span>{dateLabel}</span>
			<input
				bind:this={dateInput}
				type="date"
				bind:value={date}
				aria-label="Date"
				onclick={() => dateInput.showPicker?.()}
			/>
		</label>
	</div>
	<div class="row">
		<button class="auto" class:on={playing} onclick={toggle} aria-pressed={playing}>
			<Icon name={playing ? 'pause' : 'playo'} size={16} />
			{playing ? 'Pause' : 'Auto sun'}
		</button>
		<div class="track">
			<input
				type="range"
				min="0"
				max="1440"
				step="1"
				bind:value={minutes}
				onkeydown={onKey}
				aria-label="Time of day"
				aria-valuetext={fmt(minutes)}
				style:--pct="{pct}%"
			/>
			<div class="ticks">{#each ticks as t (t)}<span>{fmt(t).replace(':00', '')}</span>{/each}</div>
		</div>
		<span class="pill">{fmt(minutes)}</span>
	</div>
</section>

<style>
	.tl {
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		padding: 14px 16px 12px;
		user-select: none;
	}
	.head {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-bottom: 12px;
		color: var(--muted);
	}
	.head strong {
		color: var(--text);
		font-size: 17px;
		flex: 1;
	}
	.date {
		position: relative;
		display: inline-flex;
		align-items: center;
		gap: 8px;
		min-height: 42px;
		padding: 0 14px;
		border: 1px solid var(--line);
		border-radius: 12px;
		color: var(--text);
		font-weight: 600;
		cursor: pointer;
	}
	.date input {
		position: absolute;
		inset: 0;
		opacity: 0;
		cursor: pointer;
		font-size: 16px;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.auto {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-height: 46px;
		padding: 0 12px;
		border: 0;
		border-radius: 12px;
		background: var(--forest);
		color: #fff;
		font-weight: 600;
		white-space: nowrap;
		cursor: pointer;
	}
	.auto.on {
		background: var(--ochre);
	}
	.track {
		flex: 1;
		min-width: 0;
	}
	input[type='range'] {
		-webkit-appearance: none;
		appearance: none;
		width: 100%;
		height: 6px;
		border-radius: 4px;
		margin: 10px 0 8px;
		background: linear-gradient(90deg, var(--ochre) var(--pct), var(--surface-2) var(--pct));
		touch-action: none;
		outline: none;
	}
	input[type='range']::-webkit-slider-thumb {
		-webkit-appearance: none;
		width: 30px;
		height: 30px;
		border-radius: 50%;
		background: #fff;
		border: 1px solid var(--line);
		box-shadow: 0 2px 6px rgba(0, 0, 0, 0.18);
		cursor: grab;
	}
	input[type='range']::-moz-range-thumb {
		width: 28px;
		height: 28px;
		border-radius: 50%;
		background: #fff;
		border: 1px solid var(--line);
	}
	input[type='range']:focus-visible::-webkit-slider-thumb {
		outline: 3px solid var(--forest);
	}
	.ticks {
		display: flex;
		justify-content: space-between;
		font-size: 11px;
		color: var(--muted);
	}
	.pill {
		background: var(--ochre-soft);
		color: var(--ochre);
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		padding: 8px 9px;
		border-radius: 10px;
		font-size: 14px;
		text-align: center;
		white-space: nowrap;
	}
	@media (max-width: 560px) {
		.row {
			flex-wrap: wrap;
		}
		.track {
			order: 3;
			flex-basis: 100%;
		}
		.pill {
			margin-left: auto;
		}
	}
</style>
