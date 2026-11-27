<script lang="ts">
	import Icon from '#lib/components/Icon.svelte';
	import { profile, greeting } from '#lib/stores/profile.svelte.ts';
	import { PLANS, effectivePlan } from '#lib/config/plans.ts';

	const plan = $derived(PLANS[effectivePlan(profile.data.plan)]);
	const units: unknown[] = []; // Phase 1: loaded from Supabase / local cache
</script>

<svelte:head><title>Projects · RE:Aspect</title></svelte:head>

<header class="head">
	<div>
		<p class="muted hello">{greeting()}, {profile.firstName} 👋</p>
		<h1>Your units</h1>
		<p class="muted small">
			{units.length} of {plan.includedUnits ?? '—'} units · <span class="tag pro">{plan.label}</span>
		</p>
	</div>
	<a class="btn primary" href="/anchor"><Icon name="plus" size={18} /> New unit</a>
</header>

{#if units.length === 0}
	<section class="card empty">
		<div class="art" aria-hidden="true">
			<svg viewBox="0 0 200 110" width="200" height="110">
				<path d="M10 105 Q100 -20 190 105" fill="none" stroke="currentColor" stroke-dasharray="2 6" stroke-linecap="round" />
				<circle cx="140" cy="40" r="12" fill="var(--dusk)" />
				<rect x="60" y="62" width="80" height="44" fill="var(--surface)" stroke="currentColor" stroke-width="3" />
				<polygon points="70,106 110,106 128,80 88,80" fill="var(--sun)" opacity=".55" />
			</svg>
		</div>
		<h2>Anchor your first unit</h2>
		<p class="muted">
			Upload the developer's floor plan, add the address and unit number, and see exactly where the sun lands — any day, any time.
		</p>
		<a class="btn primary" href="/anchor"><Icon name="anchor" size={18} /> Start</a>
	</section>
{/if}

<style>
	.head {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 18px;
		flex-wrap: wrap;
	}
	.hello {
		margin: 0 0 2px;
	}
	.small {
		font-size: 13px;
		margin: 0;
	}
	.empty {
		text-align: center;
		padding: 32px 20px;
	}
	.art {
		color: var(--muted);
		margin-bottom: 8px;
	}
	.empty p {
		max-width: 420px;
		margin: 0 auto 16px;
	}
</style>
