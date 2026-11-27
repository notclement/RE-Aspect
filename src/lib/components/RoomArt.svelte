<script lang="ts">
	/**
	 * Generic room illustration (brand kit). Mood art only: use it where we talk about RE:Aspect in general
	 * or while the user waits. NEVER on shared unit pages, the live plan/3D, or a unit's link preview —
	 * those must show the real unit. Decorative, so it has an empty alt.
	 */
	let {
		height = 220,
		position = '50% 50%',
		eager = false
	}: { height?: number; position?: string; eager?: boolean } = $props();
</script>

<img
	class="room-art"
	src="/img/room-768.webp"
	srcset="/img/room-768.webp 768w, /img/room-1536.webp 1536w"
	sizes="(min-width: 900px) 560px, 100vw"
	width="768"
	height="653"
	alt=""
	loading={eager ? 'eager' : 'lazy'}
	decoding="async"
	style:height="{height}px"
	style:object-position={position}
/>

<style>
	/* The room is cut out (transparent background), so it sits on every theme, light or dark. */
	.room-art {
		display: block;
		width: 100%;
		object-fit: contain;
	}
</style>
