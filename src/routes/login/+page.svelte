<script lang="ts">
	import { goto } from '$app/navigation';
	import Icon from '#lib/components/Icon.svelte';
	import Spinner from '#lib/components/Spinner.svelte';
	import { auth } from '#lib/stores/auth.svelte.ts';
	import { BRAND } from '#lib/config/brand.ts';
	import Logo from '#lib/components/Logo.svelte';
	import RoomArt from '#lib/components/RoomArt.svelte';

	let busy = $state(false);

	$effect(() => {
		if (auth.status === 'signed-in' || auth.status === 'preview') goto('/', { replaceState: true });
	});

	async function google() {
		busy = true;
		await auth.signInWithGoogle();
		busy = false;
	}
</script>

<svelte:head><title>Sign in · RE:Aspect</title></svelte:head>

<div class="wrap">
	<div class="sky"><RoomArt height={190} align="gentle" eager /></div>
	<h1 class="brandmark"><Logo height={52} label={BRAND.name} /></h1>
	<p class="muted">{BRAND.tagline}</p>

	<button class="btn wide" onclick={google} disabled={busy}>
		{#if busy}<Spinner />{:else}<Icon name="google" />{/if} Continue with Google
	</button>
	<button class="btn wide dark" disabled title="Coming later">Continue with Apple · soon</button>

	{#if auth.error}<p class="err">{auth.error}</p>{/if}
	<p class="fine muted">By continuing you agree to the <a href="/legal#terms">Terms</a> and <a href="/legal#privacy">Privacy notice</a>. Sun results are <a href="/legal#accuracy">estimates</a>.</p>
</div>

<style>
	.wrap {
		max-width: 380px;
		margin: 0 auto;
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 10px;
		padding: 24px;
		text-align: center;
	}
	.sky {
		margin-bottom: 6px;
	}
	h1 {
		font-size: 30px;
		margin: 0;
	}
	.brandmark {
		display: flex;
		justify-content: center;
		margin: 0 0 4px;
	}
	.err {
		color: var(--ochre-ink);
		font-size: 14px;
	}
	.fine {
		font-size: 12px;
		margin-top: 10px;
	}
</style>
