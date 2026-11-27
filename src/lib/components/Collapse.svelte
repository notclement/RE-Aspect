<script lang="ts">
	import type { Snippet } from 'svelte';
	let { title, open = $bindable(false), children }: { title: string; open?: boolean; children: Snippet } = $props();
</script>

<section class="col">
	<button class="hd" onclick={() => (open = !open)} aria-expanded={open}>
		<span>{title}</span><span class="pm">{open ? '−' : '+'}</span>
	</button>
	{#if open}<div class="bd">{@render children()}</div>{/if}
</section>

<style>
	.col {
		border-bottom: 1px solid var(--line);
	}
	.hd {
		width: 100%;
		display: flex;
		justify-content: space-between;
		align-items: center;
		min-height: 56px;
		padding: 0 8px;
		border: 0;
		background: none;
		font-size: 17px;
		cursor: pointer;
	}
	.pm {
		font-size: 22px;
		color: var(--muted);
	}
	.bd {
		padding: 0 8px 16px;
	}
</style>
