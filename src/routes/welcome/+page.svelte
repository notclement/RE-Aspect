<script lang="ts">
	/**
	 * First-time setup: display name, plus every signed-in user's full name and CEA number (shown to clients on
	 * shared pages: "Sent by … · CEA R123456A"). Existing users without them are sent here once.
	 */
	import { goto } from '$app/navigation';
	import { profile } from '#lib/stores/profile.svelte.ts';
	import { auth } from '#lib/stores/auth.svelte.ts';
	import { validateName, validateFullName, validateCeaNo } from '#lib/validate.ts';
	import { BRAND } from '#lib/config/brand.ts';

	const agent = auth.status === 'signed-in';
	let name = $state(profile.data.name);
	let fullName = $state(profile.data.fullName || profile.data.name);
	let ceaNo = $state(profile.data.ceaNo);
	let errors = $state<Record<string, string>>({});
	let busy = $state(false);

	async function save(e: SubmitEvent) {
		e.preventDefault();
		const n = validateName(name);
		const f = agent ? validateFullName(fullName) : null;
		const c = agent ? validateCeaNo(ceaNo) : null;
		errors = {
			...(n.ok ? {} : { name: n.error }),
			...(f && !f.ok ? { fullName: f.error } : {}),
			...(c && !c.ok ? { ceaNo: c.error } : {})
		};
		if (!n.ok || (f && !f.ok) || (c && !c.ok)) return;
		busy = true;
		try {
			if (n.value !== profile.data.name || !agent) await auth.saveName(n.value);
			if (f?.ok && c?.ok) await auth.saveAgentInfo(f.value, c.value);
			goto('/', { replaceState: true });
		} catch (err) {
			errors = { form: err instanceof Error ? err.message : 'Could not save — please try again.' };
		}
		busy = false;
	}
</script>

<svelte:head><title>Welcome · RE:Aspect</title></svelte:head>

<form class="wrap" onsubmit={save} novalidate>
	<h1>Welcome to {BRAND.name}</h1>
	<p class="muted">A few details first. Your full name and CEA number appear on pages you share with clients.</p>
	<div class="field">
		<label for="name">Display name</label>
		<input id="name" autocomplete="nickname" maxlength="40" bind:value={name} placeholder="What should we call you?" />
		{#if errors.name}<span class="error">{errors.name}</span>{/if}
	</div>
	{#if agent}
		<div class="field">
			<label for="full">Full name (as registered with CEA)</label>
			<input id="full" autocomplete="name" maxlength="80" bind:value={fullName} placeholder="Type here…" />
			{#if errors.fullName}<span class="error">{errors.fullName}</span>{/if}
		</div>
		<div class="field">
			<label for="cea">CEA registration number</label>
			<input id="cea" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="12" bind:value={ceaNo} placeholder="e.g. R123456A" />
			{#if errors.ceaNo}<span class="error">{errors.ceaNo}</span>{/if}
		</div>
	{/if}
	{#if errors.form}<p class="error">{errors.form}</p>{/if}
	<button class="btn primary wide" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Continue'}</button>
</form>

<style>
	.wrap {
		max-width: 400px;
		margin: 0 auto;
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 4px;
		padding: 24px;
	}
</style>
