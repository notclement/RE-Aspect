<script lang="ts">
	/** Round profile picture, or the first initial when there's no photo. Defaults to the signed-in user. */
	import { profile } from '#lib/stores/profile.svelte.ts';

	let { size = 40, src, name }: { size?: number; src?: string | null; name?: string } = $props();
	const img = $derived(src === undefined ? profile.data.avatar : src);
	const initial = $derived(((name ?? profile.data.name) || '?').trim().slice(0, 1).toUpperCase());
</script>

<span class="av" style:width="{size}px" style:height="{size}px" style:font-size="{Math.round(size * 0.4)}px">
	{#if img}<img src={img} alt="" width={size} height={size} decoding="async" />{:else}{initial}{/if}
</span>

<style>
	.av {
		display: inline-grid;
		place-items: center;
		border-radius: 50%;
		overflow: hidden;
		flex-shrink: 0;
		background: var(--ochre-soft);
		color: var(--ochre);
		font-weight: 700;
	}
	img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}
</style>
