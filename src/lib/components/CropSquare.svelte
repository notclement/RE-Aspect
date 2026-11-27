<script lang="ts">
	/**
	 * Choose the square part of a photo to use as the profile picture.
	 * Drag the square to move it; pinch, scroll or use the slider to resize. Only that square is kept.
	 */
	import { onMount } from 'svelte';
	import { makeAvatarFromRegion } from '#lib/image.ts';

	let { file, ondone, oncancel }: { file: File; ondone: (dataUrl: string) => void; oncancel: () => void } = $props();

	let url = $state('');
	let iw = $state(1);
	let ih = $state(1);
	let box = $state({ x: 0, y: 0, s: 1 }); // in image pixels
	let stage = $state<HTMLDivElement>();
	let busy = $state(false);
	let error = $state<string | null>(null);

	const minS = $derived(Math.max(32, Math.min(iw, ih) * 0.15));
	const maxS = $derived(Math.min(iw, ih));
	function clamp(b: { x: number; y: number; s: number }) {
		const s = Math.min(maxS, Math.max(minS, b.s));
		return { s, x: Math.min(iw - s, Math.max(0, b.x)), y: Math.min(ih - s, Math.max(0, b.y)) };
	}
	function resize(s: number) {
		const cx = box.x + box.s / 2;
		const cy = box.y + box.s / 2;
		box = clamp({ s, x: cx - s / 2, y: cy - s / 2 });
	}

	// screen px → image px
	const k = () => (stage ? iw / stage.clientWidth : 1);
	const pts = new Map<number, { x: number; y: number }>();
	let start: { x: number; y: number; box: typeof box; d?: number } | null = null;
	function down(e: PointerEvent) {
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
		const [a, b] = [...pts.values()];
		start = { x: e.clientX, y: e.clientY, box: { ...box }, d: b ? Math.hypot(a.x - b.x, a.y - b.y) : undefined };
	}
	function move(e: PointerEvent) {
		if (!pts.has(e.pointerId) || !start) return;
		pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
		if (pts.size === 2 && start.d) {
			const [a, b] = [...pts.values()];
			const d = Math.hypot(a.x - b.x, a.y - b.y);
			box = start.box;
			resize(start.box.s * (start.d / Math.max(1, d)) ** -1);
		} else if (pts.size === 1) {
			box = clamp({ ...start.box, x: start.box.x + (e.clientX - start.x) * k(), y: start.box.y + (e.clientY - start.y) * k() });
		}
	}
	function up(e: PointerEvent) {
		pts.delete(e.pointerId);
		const [rest] = [...pts.values()];
		start = rest ? { x: rest.x, y: rest.y, box: { ...box } } : null;
	}
	function wheel(e: WheelEvent) {
		e.preventDefault();
		resize(box.s * Math.exp(e.deltaY * 0.0015));
	}

	async function use() {
		busy = true;
		error = null;
		try {
			ondone(await makeAvatarFromRegion(file, Math.round(box.x), Math.round(box.y), Math.round(box.s)));
		} catch (e) {
			error = e instanceof Error ? e.message : 'Could not use that photo.';
		}
		busy = false;
	}

	onMount(() => {
		url = URL.createObjectURL(file);
		const img = new Image();
		img.onload = () => {
			iw = img.naturalWidth;
			ih = img.naturalHeight;
			const s = Math.min(iw, ih) * 0.8;
			box = { s, x: (iw - s) / 2, y: (ih - s) / 2 };
		};
		img.onerror = () => (error = 'Please choose an image.');
		img.src = url;
		return () => URL.revokeObjectURL(url);
	});
</script>

<button class="scrim" aria-label="Cancel" onclick={oncancel}></button>
<div class="dlg" role="dialog" aria-modal="true" aria-labelledby="crop-title">
	<h2 id="crop-title">Choose your photo</h2>
	<p class="muted small">Drag the square to move it · pinch or use the slider to resize</p>
	{#if url}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="stage" bind:this={stage} style:aspect-ratio="{iw} / {ih}" onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up} onwheel={wheel}>
			<img src={url} alt="" draggable="false" />
			<div
				class="sq"
				style:left="{(box.x / iw) * 100}%"
				style:top="{(box.y / ih) * 100}%"
				style:width="{(box.s / iw) * 100}%"
				style:height="{(box.s / ih) * 100}%"
			></div>
		</div>
		<input type="range" min={minS} max={maxS} step="1" value={box.s} oninput={(e) => resize(Number(e.currentTarget.value))} aria-label="Square size" />
	{/if}
	{#if error}<p class="error small">{error}</p>{/if}
	<div class="actions">
		<button class="btn" onclick={oncancel}>Cancel</button>
		<button class="btn primary" onclick={use} disabled={busy || !url}>{busy ? 'Saving…' : 'Use photo'}</button>
	</div>
</div>

<style>
	.scrim {
		position: fixed;
		inset: 0;
		border: 0;
		background: rgba(10, 14, 12, 0.55);
		z-index: 60;
	}
	.dlg {
		position: fixed;
		z-index: 61;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		width: min(440px, calc(100vw - 24px));
		max-height: calc(100dvh - 24px);
		overflow: auto;
		background: var(--surface);
		border-radius: var(--radius);
		padding: 16px;
	}
	h2 {
		margin: 0;
		font-size: 18px;
	}
	.small {
		font-size: 12px;
	}
	.stage {
		position: relative;
		width: 100%;
		max-height: 60dvh;
		margin: 10px auto;
		overflow: hidden;
		touch-action: none;
		user-select: none;
		border-radius: var(--radius-sm);
		background: #000;
	}
	.stage img {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
	}
	.sq {
		position: absolute;
		border: 2px solid #fff;
		border-radius: 2px;
		box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.55);
		cursor: move;
	}
	input[type='range'] {
		width: 100%;
		accent-color: var(--forest);
	}
	.error {
		color: #b5483a;
	}
	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		margin-top: 8px;
	}
</style>
