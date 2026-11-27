<script lang="ts">
	import Icon from '#lib/components/Icon.svelte';
	import UnitThumb from '#lib/components/UnitThumb.svelte';
	import { profile, greeting } from '#lib/stores/profile.svelte.ts';
	import { nav } from '#lib/stores/nav.svelte.ts';
	import { PLANS } from '#lib/config/plans.ts';
	import { SAMPLE_UNITS } from '#lib/sample-unit.ts';
	import { projectDetails, myProjects } from '#lib/stores/projects.svelte.ts';
	import { planReady, planToUnit } from '#lib/plan.ts';
	import { propertyTypeLabel } from '#lib/config/property-types.ts';

	$effect(() => nav.set({ label: 'Projects' }));
	const plan = $derived(PLANS[profile.planId]);
	// The user's own projects first, then the demos. The quota counts own projects only (demos are free).
	const projects = SAMPLE_UNITS;
	const STATUS: Record<string, string> = { draft: 'Needs tracing', processing: 'Processing…', failed: 'Needs tracing', ready: '' };
</script>

<svelte:head><title>Projects · RE:Aspect</title></svelte:head>

<p class="muted hello">{greeting()}, {profile.firstName}</p>
<div class="head">
	<h1>Your projects</h1>
	<a class="btn primary" href="/new"><Icon name="plus" size={18} /> New project</a>
</div>
<p class="muted meta">{myProjects.length} of {plan.includedUnits ?? '—'} projects used · <span class="tag pro">{plan.label}</span></p>

{#each myProjects as p (p.id)}
	<a class="unit card" href="/unit?id={p.id}">
		<div class="thumb">
			{#if planReady(p.plan)}
				<UnitThumb unit={planToUnit(p.plan, { id: p.id, name: p.name, unitNo: p.unitNo, level: p.level, sizeSqft: p.sizeSqft, ceilingCm: p.ceilingCm, lat: p.lat, lon: p.lon })} />
			{:else}
				<span class="ph"><Icon name="plan" size={28} /></span>
			{/if}
		</div>
		<div class="info">
			{#if STATUS[p.status] || !planReady(p.plan)}<span class="tag pro">{STATUS[p.status] || 'Needs tracing'}</span>{/if}
			<strong>{p.name}</strong>
			<span class="muted">{[p.unitNo, p.level !== null ? `Level ${p.level}` : '', p.sizeSqft ? `${p.sizeSqft.toLocaleString()} sq ft` : '', propertyTypeLabel(p.propertyType)].filter(Boolean).join(' · ')}</span>
			{#if p.description}<span class="muted desc">{p.description}</span>{/if}
		</div>
		<Icon name="chevron" />
	</a>
{/each}

{#if myProjects.length === 0}
	<a class="first card" href="/new">
		<Icon name="plus" size={22} />
		<span><strong>Add your own project</strong><br /><span class="muted">Upload the floor plan and photos — see where the sun lands in minutes.</span></span>
	</a>
{/if}

{#if myProjects.length}<h3 class="demos">Demo projects</h3>{/if}
{#each projects as u (u.id)}
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
	.ph {
		display: grid;
		place-items: center;
		height: 100%;
		color: var(--muted);
	}
	.first {
		display: flex;
		align-items: center;
		gap: 14px;
		text-decoration: none;
		margin-bottom: 10px;
		border-style: dashed;
		color: var(--forest);
	}
	.first .muted {
		font-size: 13px;
	}
	.demos {
		margin: 22px 0 10px;
		font-size: 13px;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--muted);
	}
	.unit + .unit {
		margin-top: 10px;
	}
	.desc {
		font-size: 13px;
	}
</style>
