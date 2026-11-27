<script lang="ts">
	import { goto } from '$app/navigation';
	import { profile } from '#lib/stores/profile.svelte.ts';
	import { auth } from '#lib/stores/auth.svelte.ts';
	import { validateName } from '#lib/validate.ts';
	import { BRAND } from '#lib/config/brand.ts';

	let name = $state(profile.data.name);
	let error = $state<string | null>(null);

	function save(e: SubmitEvent) {
		e.preventDefault();
		const r = validateName(name);
		if (!r.ok) {
			error = r.error;
			return;
		}
		auth.saveName(r.value);
		goto('/', { replaceState: true });
	}
</script>

<svelte:head><title>Welcome · RE:Aspect</title></svelte:head>

<form class="wrap" onsubmit={save} novalidate>
	<h1>Welcome to {BRAND.name}</h1>
	<p class="muted">What should we call you? We'll use your name around the app.</p>
	<div class="field">
		<label for="name">Your name</label>
		<input id="name" autocomplete="name" maxlength="40" bind:value={name} placeholder="Type here…" />
		{#if error}<span class="error">{error}</span>{/if}
	</div>
	<button class="btn primary wide" type="submit">Continue</button>
</form>

<style>
	.wrap {
		max-width: 400px;
		margin: 0 auto;
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
		justify-content: center;
		padding: 24px;
	}
</style>
