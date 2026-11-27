<script lang="ts">
	import Icon from '#lib/components/Icon.svelte';
	import UnitThumb from '#lib/components/UnitThumb.svelte';
	import { profile, greeting } from '#lib/stores/profile.svelte.ts';
	import { nav } from '#lib/stores/nav.svelte.ts';
	import { PLANS } from '#lib/config/plans.ts';
	import { SAMPLE_UNITS } from '#lib/sample-unit.ts';
	import { projectDetails } from '#lib/stores/projects.svelte.ts';

	$effect(() => nav.set({ label: 'Projects' }));
	const plan = $derived(PLANS[profile.planId]);
	const myUnits: unknown[] = []; // Phase 1: loaded from Supabase / local cache
</script>

<svelte:head><title>Projects · RE:Aspect</title></svelte:head>

<p class="muted hello">{greeting()}, {profile.firstName}</p>
<div class="head">
	<h1>Your projects</h1>
	<a class="btn primary" href="/anchor"><Icon name="plus" size={18} /> New project</a>
</div>
<p class="muted meta">{myUnits.length} of {plan.includedUnits ?? '—'} projects · <span class="tag pro">{plan.label}</span></p>

{#each SAMPLE_UNITS as u (u.id)}
	{@const d = projectDetails(u.id)}
	<a class="unit card" href="/unit?id={u.id}">
		<div class="thumb"><UnitThumb unit={u} /></div>
		<div class="info">
			<span class="tag">DEMO</span>
			<strong>{d.name}</strong>
			<span class="muted">{[d.unitNo, `Level ${u.level}`, `${u.sizeSqft.toLocaleString()} sq ft`].filter(Boolean).join(' · ')}</span>
			{#if d.description}<span class="muted desc">{d.description}</span>{/if}
		</div>
		<Icon name="chevron" />
	</a>
{/each}

{#if myUnits.length === 0}
	<section class="empty">
		<h2>Set up your first project</h2>
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
		width: 120px;
		height: 96px;
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
	.unit + .unit {
		margin-top: 10px;
	}
	.desc {
		font-size: 13px;
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
