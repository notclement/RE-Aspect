<script lang="ts">
	import { nav } from '#lib/stores/nav.svelte.ts';
	$effect(() => nav.set({ label: 'Profile' }));
	import { profile, ROLE_LABELS } from '#lib/stores/profile.svelte.ts';
	import { auth } from '#lib/stores/auth.svelte.ts';
	import { PLANS, FREE_LAUNCH } from '#lib/config/plans.ts';
	import { validateName } from '#lib/validate.ts';
	import { SAMPLE_UNITS } from '#lib/sample-unit.ts';

	let name = $state(profile.data.name);
	let error = $state<string | null>(null);
	let saved = $state(false);
	const plan = $derived(PLANS[profile.planId]);

	// Usage (projects: demo projects included for now; AI tools arrive with the Anchor wizard).
	const used = SAMPLE_UNITS.length;
	const included = $derived(plan.includedUnits ?? 0);
	const pct = $derived(included ? Math.min(100, Math.round((used / included) * 100)) : 0);
	const aiFunctions = ['Floor-plan trace', 'Windows & doors', 'Furniture placement'];
	const until = $derived(profile.data.proUntil);
	const planNote = $derived(
		profile.viewAs
			? 'Preview of this role'
			: until === 'infinity'
				? 'Lifetime Pro'
				: until
					? `Pro until ${new Date(until).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })}`
					: FREE_LAUNCH && profile.data.plan === 'free'
						? 'Free during launch'
						: ''
	);

	function save(e: SubmitEvent) {
		e.preventDefault();
		const r = validateName(name);
		error = r.ok ? null : r.error;
		if (r.ok) {
			auth.saveName(r.value);
			saved = true;
			setTimeout(() => (saved = false), 1500);
		}
	}
</script>

<svelte:head><title>Profile · RE:Aspect</title></svelte:head>

<h1>{profile.firstName}'s profile</h1>

<form class="card" onsubmit={save} novalidate>
	<div class="field">
		<label for="n">Name</label>
		<input id="n" maxlength="40" autocomplete="name" bind:value={name} />
		{#if error}<span class="error">{error}</span>{/if}
	</div>
	<button class="btn primary" type="submit">{saved ? 'Saved ✓' : 'Save'}</button>
</form>

<div class="card list">
	<div class="li"><span class="muted">Email</span><span>{auth.email ?? '—'}</span></div>
	<div class="li">
		<span class="muted">Role</span>
		<span>{ROLE_LABELS[profile.role]}{#if profile.viewAs} <span class="muted">(preview)</span>{/if}</span>
	</div>
	<div class="li">
		<span class="muted">Plan</span>
		<span class="planv"><span class="tag pro">{plan.label}</span>{#if planNote}<span class="muted small">{planNote}</span>{/if}</span>
	</div>
</div>

<h3>Usage</h3>
<div class="card usage">
	<div class="u-head">
		<strong>Projects</strong>
		<span><b>{used}</b> of {included || '—'}</span>
	</div>
	<div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax={included} aria-valuenow={used} aria-label="Projects used">
		<span style:width="{pct}%" class:full={pct >= 100}></span>
	</div>
	<p class="muted small">
		{included - used > 0 ? `${included - used} left` : 'Quota reached'}
		{#if plan.extraUnitOneOffSgd} · extra projects S${plan.extraUnitOneOffSgd} each, one-off{/if}
		· demo projects count for now
	</p>

	<div class="u-head ai">
		<strong>AI re-runs</strong>
		<span>{plan.aiRunsPerFunctionPerUnit} per function, per project</span>
	</div>
	<ul class="ai-list">
		{#each aiFunctions as f (f)}
			<li><span>{f}</span><span class="muted">0 of {plan.aiRunsPerFunctionPerUnit} used</span></li>
		{/each}
	</ul>
	<p class="muted small">AI tools arrive with the New project wizard — nothing has been used yet.</p>
</div>
{#if FREE_LAUNCH}<p class="muted fine">Launch period: everyone gets Pro features free while we test.</p>{/if}

<style>
	.card {
		margin-bottom: 14px;
	}
	.list {
		padding: 4px 16px;
	}
	.li {
		display: flex;
		justify-content: space-between;
		padding: 12px 0;
		border-bottom: 1px solid var(--line);
	}
	.li:last-child {
		border-bottom: 0;
	}
	h3 {
		margin: 22px 0 8px;
		font-size: 13px;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--muted);
	}
	.planv {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 2px;
	}
	.small {
		font-size: 12px;
	}
	.u-head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 10px;
	}
	.u-head b {
		font-size: 20px;
		font-variant-numeric: tabular-nums;
	}
	.u-head.ai {
		margin-top: 18px;
		padding-top: 14px;
		border-top: 1px solid var(--line);
	}
	.u-head.ai span {
		font-size: 13px;
		color: var(--muted);
	}
	.bar {
		height: 10px;
		border-radius: 5px;
		background: var(--surface-2);
		overflow: hidden;
		margin: 8px 0 6px;
	}
	.bar span {
		display: block;
		height: 100%;
		border-radius: inherit;
		background: var(--forest);
		transition: width 0.4s ease;
	}
	.bar span.full {
		background: var(--ochre);
	}
	.ai-list {
		list-style: none;
		margin: 8px 0 0;
		padding: 0;
	}
	.ai-list li {
		display: flex;
		justify-content: space-between;
		padding: 7px 0;
		font-size: 14px;
		border-bottom: 1px dashed var(--line);
	}
	.ai-list li:last-child {
		border-bottom: 0;
	}
	.fine {
		font-size: 13px;
	}
</style>
