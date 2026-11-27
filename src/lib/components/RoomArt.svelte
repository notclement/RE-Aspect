<script lang="ts">
	/**
	 * Generic room illustration (brand kit), on a soft tinted "stage". The room stands on the stage's bottom
	 * edge (its cut floor slab lines up with that edge) and follows the rule of thirds:
	 *   align="thirds"  room centred on the right-third line; the left third is open space the light
	 *                   (window on the left, facing the sun → light falls across the floor to the right; the image is mirrored for this) flows into, with a small sun to balance it
	 *   align="gentle"  room centred at 60% — for narrow panels above centred text, so the screen doesn't tilt
	 * Mood art only: use it where we talk about RE:Aspect in general or while the user waits.
	 * NEVER on shared unit pages, the live plan/3D, or a unit's link preview — those must show the real unit.
	 */
	let {
		height = 220,
		align = 'thirds',
		sun = align === 'thirds',
		scale = 0.86,
		flush = false,
		eager = false
	}: { height?: number; align?: 'thirds' | 'gentle'; sun?: boolean; scale?: number; flush?: boolean; eager?: boolean } = $props();
</script>

<div class="stage {align}" class:flush style:height="{height}px" style:--h="{height}px" style:--s={scale} aria-hidden="true">
	{#if sun}<span class="sun"></span>{/if}
	<img
		src="/img/room-768.webp"
		srcset="/img/room-768.webp 768w, /img/room-1536.webp 1536w"
		sizes="(min-width: 900px) 480px, 70vw"
		width="768"
		height="653"
		alt=""
		loading={eager ? 'eager' : 'lazy'}
		decoding="async"
	/>
</div>

<style>
	.stage {
		/* Warm, quiet backdrop: paper tinted toward the sunlight colour; darker surface on dark themes. */
		--stage: color-mix(in srgb, var(--ochre-soft) 70%, var(--surface));
		--cx: 67%; /* where the room's centre sits across the stage */
		position: relative;
		overflow: hidden;
		background: var(--stage);
		border-radius: var(--radius);
	}
	.stage.gentle {
		--cx: 60%;
	}
	:global([data-mode='dark']) .stage {
		--stage: color-mix(in srgb, var(--surface-2) 75%, var(--paper));
	}
	.stage.flush {
		border-radius: 0;
	}
	img {
		position: absolute;
		bottom: -1px; /* the cut floor slab sits exactly on the edge */
		/* Never past the right edge: the room is (scale × stage height × 1.18) wide. */
		left: min(var(--cx), calc(100% - var(--h) * var(--s) * 0.589 - 12px));
		transform: translateX(-50%);
		display: block;
		height: calc(var(--s) * 100%);
		width: auto;
		max-width: none;
	}
	/* Small sun on the top-left third intersection: balances the room and tells the story (sun → window → floor). */
	.sun {
		position: absolute;
		left: 18%;
		top: 30%;
		width: 7%;
		aspect-ratio: 1;
		max-width: 26px;
		border-radius: 50%;
		transform: translate(-50%, -50%);
		background: var(--sun);
		box-shadow: 0 0 0 5px color-mix(in srgb, var(--sun) 16%, transparent);
	}
</style>
