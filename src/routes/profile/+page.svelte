<script lang="ts">
	import { nav } from '#lib/stores/nav.svelte.ts';
	$effect(() => nav.set({ label: 'Profile' }));
	import { profile, ROLE_LABELS } from '#lib/stores/profile.svelte.ts';
	import { auth } from '#lib/stores/auth.svelte.ts';
	import { PLANS, FREE_LAUNCH } from '#lib/config/plans.ts';
	import { validateName } from '#lib/validate.ts';

	let name = $state(profile.data.name);
	let error = $state<string | null>(null);
	let saved = $state(false);
	const plan = $derived(PLANS[profile.planId]);

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
	<div class="li"><span class="muted">Plan</span><span class="tag pro">{plan.label}</span></div>
	<div class="li"><span class="muted">Units included</span><span>{plan.includedUnits}</span></div>
	<div class="li"><span class="muted">AI re-runs per function</span><span>{plan.aiRunsPerFunctionPerUnit}</span></div>
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
	.fine {
		font-size: 13px;
	}
</style>
