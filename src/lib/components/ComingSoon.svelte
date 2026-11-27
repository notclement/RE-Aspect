<script lang="ts">
	import Icon, { type IconName } from './Icon.svelte';

	let {
		icon,
		title,
		phase,
		points
	}: { icon: IconName; title: string; phase: string; points: string[] } = $props();
</script>

<section class="card soon">
	<div class="badge"><Icon name={icon} size={26} /></div>
	<h2>{title}</h2>
	<p class="muted">Arrives in <strong>{phase}</strong>. Set up a project first to unlock this view.</p>
	<ul>
		{#each points as p (p)}<li>{p}</li>{/each}
	</ul>
</section>

<style>
	.soon {
		text-align: left;
		padding: 22px;
	}
	.badge {
		width: 52px;
		height: 52px;
		border-radius: 14px;
		display: grid;
		place-items: center;
		background: color-mix(in srgb, var(--sun) 22%, var(--surface));
		color: var(--dusk);
		margin-bottom: 12px;
	}
	ul {
		margin: 8px 0 0;
		padding-left: 18px;
	}
	li {
		margin-bottom: 4px;
	}
</style>
