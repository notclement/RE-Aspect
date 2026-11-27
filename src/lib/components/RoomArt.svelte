<script lang="ts">
	/**
	 * Generic room illustration (brand kit), shown on a soft tinted "stage": the room stands on the stage's
	 * bottom edge (its cut floor slab lines up with that edge) instead of floating in empty space.
	 * Mood art only: use it where we talk about RE:Aspect in general or while the user waits.
	 * NEVER on shared unit pages, the live plan/3D, or a unit's link preview — those must show the real unit.
	 *   height  stage height in px
	 *   flush   no rounded corners (when the stage fills the top of a card)
	 */
	let {
		height = 220,
		flush = false,
		eager = false
	}: { height?: number; flush?: boolean; eager?: boolean } = $props();
</script>

<div class="stage" class:flush style:height="{height}px" aria-hidden="true">
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
		position: relative;
		display: flex;
		align-items: flex-end;
		justify-content: center;
		overflow: hidden;
		background: var(--stage);
		border-radius: var(--radius);
	}
	:global([data-mode='dark']) .stage {
		--stage: color-mix(in srgb, var(--surface-2) 75%, var(--paper));
	}
	.stage.flush {
		border-radius: 0;
	}
	img {
		display: block;
		height: 86%;
		width: auto;
		max-width: 92%;
		object-fit: contain;
		object-position: 50% 100%;
		/* Sit the cut floor slab exactly on the edge. */
		margin-bottom: -1px;
	}
</style>
