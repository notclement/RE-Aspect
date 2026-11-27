<script lang="ts">
	import Icon from '#lib/components/Icon.svelte';
	import { profile, greeting } from '#lib/stores/profile.svelte.ts';
	import { nav } from '#lib/stores/nav.svelte.ts';
	import { PLANS, effectivePlan } from '#lib/config/plans.ts';
	import { SAMPLE_UNIT } from '#lib/sample-unit.ts';

	$effect(() => nav.set({ label: 'Units' }));
	const plan = $derived(PLANS[effectivePlan(profile.data.plan)]);
	const myUnits: unknown[] = []; // Phase 1: loaded from Supabase / local cache
</script>

<svelte:head><title>Units · RE:Aspect</title></svelte:head>

<p class="muted hello">{greeting()}, {profile.firstName}</p>
<div class="head">
	<h1>Your units</h1>
	<a class="btn primary" href="/anchor"><Icon name="plus" size={18} /> New unit</a>
</div>
<p class="muted meta">{myUnits.length} of {plan.includedUnits ?? '—'} units · <span class="tag pro">{plan.label}</span></p>

<a class="unit card" href="/unit?id={SAMPLE_UNIT.id}">
	<div class="thumb" aria-hidden="true">
		<svg viewBox="0 0 200 130">
			<rect x="10" y="10" width="180" height="110" rx="4" fill="#E9DFCB" />
			<polygon points="30,120 120,120 150,70 60,70" fill="#F2B84B" opacity=".7" />
			<rect x="10" y="10" width="180" height="110" rx="4" fill="none" stroke="#3A4139" stroke-width="6" />
			<path d="M120 10v50M120 75v45M120 65h70M10 55h45" stroke="#3A4139" stroke-width="5" />
		</svg>
	</div>
	<div class="info">
		<span class="tag">DEMO</span>
		<strong>{SAMPLE_UNIT.name}</strong>
		<span class="muted">{SAMPLE_UNIT.unitNo} · Level {SAMPLE_UNIT.level} · {SAMPLE_UNIT.sizeSqft.toLocaleString()} sq ft</span>
	</div>
	<Icon name="chevron" />
</a>

{#if myUnits.length === 0}
	<section class="empty">
		<h2>Anchor your first unit</h2>
		<p class="muted">
			Upload the developer's floor plan, add the address and unit number, and see exactly where the sun lands — any day, any time.
		</p>
		<a class="btn" href="/anchor"><Icon name="anchor" size={18} /> Start</a>
	</section>
{/if}

<style>
	.hello {
		margin: 4px 0 0;
	}
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}
	.head h1 {
		margin: 0;
	}
	.meta {
		font-size: 14px;
		margin: 6px 0 18px;
	}
	.unit {
		display: flex;
		align-items: center;
		gap: 14px;
		text-decoration: none;
		padding: 12px;
		border-radius: var(--radius);
	}
	.thumb {
		width: 96px;
		flex-shrink: 0;
		background: var(--canvas);
		border-radius: 12px;
		padding: 6px;
	}
	.info {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 3px;
		align-items: flex-start;
		font-size: 14px;
	}
	.info strong {
		font-family: var(--serif);
		font-size: 20px;
	}
	.empty {
		text-align: center;
		margin-top: 28px;
		padding: 26px 18px;
		border: 1.5px dashed var(--line);
		border-radius: var(--radius);
	}
	.empty h2 {
		font-family: var(--serif);
		font-size: 22px;
	}
	.empty p {
		max-width: 420px;
		margin: 0 auto 16px;
	}
</style>
