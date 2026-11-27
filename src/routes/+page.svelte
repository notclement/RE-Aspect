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
	import ConfirmDelete from '#lib/components/ConfirmDelete.svelte';
	import UpgradeSheet from '#lib/components/UpgradeSheet.svelte';
	import RoomArt from '#lib/components/RoomArt.svelte';
	import { projectUsage } from '#lib/usage.svelte.ts';
	const usage = $derived(projectUsage());
	let showUpgrade = $state(false);
	function newProject(e: MouseEvent) {
		if (usage.full) {
			e.preventDefault();
			showUpgrade = true;
		}
	}
	let toDelete = $state<{ id: string; name: string } | null>(null);

	$effect(() => nav.set({ label: 'Projects' }));
	const plan = $derived(PLANS[profile.planId]);
	// The user's own projects first, then the demos in their own section. Demos are read-only for everyone
	// (admins included) and never count toward any quota.
	const projects = SAMPLE_UNITS;
	const STATUS: Record<string, string> = { draft: 'Needs tracing', processing: 'Processing…', failed: 'Needs tracing', ready: '' };
</script>

<svelte:head><title>Projects · RE:Aspect</title></svelte:head>

<p class="muted hello">{greeting()}, {profile.firstName}</p>
<div class="head">
	<h1>Your projects</h1>
	<a class="btn primary" href="/new" onclick={newProject}><Icon name="plus" size={18} /> New project</a>
</div>
<div class="meter" class:warn={usage.near} class:full={usage.full}>
	<p class="muted meta">
		{usage.used} of {usage.limit ?? '∞'} project{usage.limit === 1 ? '' : 's'} used · <span class="tag pro">{plan.label}</span>
		{#if (usage.full || usage.near) && profile.planId === 'free'}· <a href="/upgrade" class="more">Get more with Pro</a>{/if}
	</p>
	{#if usage.limit}
		<div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax={usage.limit} aria-valuenow={usage.used} aria-label="Projects used">
			<span style:width="{Math.min(100, Math.round((usage.used / usage.limit) * 100))}%"></span>
		</div>
	{/if}
</div>
{#if showUpgrade}<UpgradeSheet reason="projects" used={usage.used} limit={usage.limit ?? undefined} onclose={() => (showUpgrade = false)} />{/if}

{#each myProjects as p (p.id)}
	<div class="own">
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
	<button class="del" onclick={() => (toDelete = { id: p.id, name: p.name })} title="Delete {p.name}" aria-label="Delete {p.name}"><Icon name="trash" size={18} /></button>
	</div>
{/each}
{#if toDelete}<ConfirmDelete id={toDelete.id} name={toDelete.name} onclose={() => (toDelete = null)} />{/if}

{#if myProjects.length === 0}
	<section class="first card">
		<RoomArt height={176} flush />
		<div class="first-body">
			<h2>No projects yet, {profile.firstName}</h2>
			<p class="muted">Upload a floor plan and see the sun move through each room in a few minutes.</p>
			<a class="btn primary wide" href="/new" onclick={newProject}><Icon name="plus" size={18} /> New project</a>
		</div>
	</section>
{/if}

<h3 class="demos">Demo projects</h3>
<p class="muted demo-note">Read-only examples — they don't count toward your projects.</p>
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
		margin: 6px 0 6px;
	}
	.meter {
		margin-bottom: 18px;
	}
	.bar {
		height: 6px;
		border-radius: 3px;
		background: var(--surface-2);
		overflow: hidden;
		max-width: 360px;
	}
	.bar span {
		display: block;
		height: 100%;
		background: var(--forest);
		border-radius: inherit;
	}
	.meter.warn .bar span,
	.meter.full .bar span {
		background: var(--ochre);
	}
	.more {
		color: var(--ochre-ink);
		font-weight: 600;
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
	.own {
		position: relative;
		margin-bottom: 10px;
	}
	.own .unit {
		padding-right: 56px;
	}
	.del {
		position: absolute;
		top: 8px;
		right: 8px;
		width: 44px;
		height: 44px;
		display: grid;
		place-items: center;
		border: 0;
		border-radius: var(--radius-sm);
		background: none;
		color: var(--muted);
		cursor: pointer;
	}
	.del:hover {
		color: #b5483a;
		background: color-mix(in srgb, #b5483a 10%, transparent);
	}
	.ph {
		display: grid;
		place-items: center;
		height: 100%;
		color: var(--muted);
	}
	.first {
		padding: 0;
		overflow: hidden;
		margin-bottom: 10px;
		max-width: 560px;
	}
	.first-body {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 16px;
	}
	.first h2 {
		margin: 0;
		font-family: var(--serif);
		font-weight: var(--heading-weight);
		font-size: 22px;
	}
	.first p {
		margin: 0 0 6px;
		font-size: 15px;
	}
	.demo-note {
		margin: -4px 0 10px;
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
