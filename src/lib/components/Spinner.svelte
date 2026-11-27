<script lang="ts">
	/** The small loading circle shown wherever a lazy resource is loading. */
	let { size = 14, label = 'Loading' }: { size?: number; label?: string } = $props();
</script>

<span class="spin" style:width="{size}px" style:height="{size}px" role="status" aria-label={label}></span>

<style>
	.spin {
		display: inline-block;
		border: 2px solid color-mix(in srgb, var(--dusk) 25%, transparent);
		border-top-color: var(--dusk);
		border-radius: 50%;
		animation: r 0.7s linear infinite;
		vertical-align: -2px;
	}
	@keyframes r {
		to {
			transform: rotate(360deg);
		}
	}
</style>
