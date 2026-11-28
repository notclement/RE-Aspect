<script lang="ts">
	/**
	 * /refer?code=XXXXXXXX — opened from someone's referral QR code. Signed-out visitors sign in first (the layout
	 * keeps the code); then a new account claims it once and both people get 1 month of Pro (migration 0018).
	 */
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { nav } from '#lib/stores/nav.svelte.ts';
	import { auth } from '#lib/stores/auth.svelte.ts';
	import { pendingRef, peekReferral, claimReferral, type ClaimResult } from '#lib/stores/referral.svelte.ts';
	import { validateInviteCode } from '#lib/validate.ts';
	import Icon from '#lib/components/Icon.svelte';
	import Spinner from '#lib/components/Spinner.svelte';

	$effect(() => nav.set({ label: 'Invite' }));

	const parsed = validateInviteCode(page.url.searchParams.get('code') ?? pendingRef.get() ?? '');
	const code = parsed.ok ? parsed.value : null;

	type View = 'loading' | 'ask' | 'preview' | ClaimResult;
	let view = $state<View>('loading');
	let from = $state('A friend');
	let busy = $state(false);
	let error = $state<string | null>(null);

	onMount(async () => {
		if (auth.status === 'preview') return void (view = 'preview');
		if (!code) {
			pendingRef.set(null);
			return void (view = 'invalid');
		}
		try {
			const name = await peekReferral(code);
			if (name === null) {
				pendingRef.set(null);
				return void (view = 'invalid');
			}
			from = name;
			view = 'ask';
		} catch (e) {
			error = e instanceof Error ? e.message : 'Could not check this invite.';
			view = 'ask';
		}
	});

	async function claim() {
		if (!code) return;
		busy = true;
		error = null;
		try {
			view = await claimReferral(code);
			pendingRef.set(null);
			if (view === 'ok') await auth.loadProfile();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Could not claim the invite.';
		}
		busy = false;
	}
	function notNow() {
		pendingRef.set(null);
		goto('/', { replaceState: true });
	}
</script>

<svelte:head><title>Invite · RE:Aspect</title></svelte:head>

<div class="card center">
	<span class="big"><Icon name="gift" size={28} /></span>
	{#if view === 'loading'}
		<Spinner size={20} />
	{:else if view === 'preview'}
		<h1>You've been invited</h1>
		<p class="muted">Invites need an account — open this link on the live app and sign in.</p>
	{:else if view === 'invalid'}
		<h1>This invite doesn't work</h1>
		<p class="muted">Check the QR code or link with the person who sent it.</p>
		<a class="btn" href="/">Go to projects</a>
	{:else if view === 'ask'}
		<h1>{from} invited you</h1>
		<p class="muted">You both get <strong>1 month of RE:Aspect Pro</strong>, added to any Pro time you already have.</p>
		{#if error}<p class="error">{error}</p>{/if}
		<div class="row">
			<button class="btn" onclick={notNow}>Not now</button>
			<button class="btn primary" onclick={claim} disabled={busy}>{busy ? 'Adding…' : 'Get my free month'}</button>
		</div>
	{:else if view === 'ok'}
		<h1>1 month of Pro added</h1>
		<p class="muted">{from} gets a month too. Thanks for joining!</p>
		<a class="btn primary" href="/">Go to projects</a>
	{:else if view === 'own'}
		<h1>That's your own invite</h1>
		<p class="muted">Share it with a friend: you both get a month of Pro when they join.</p>
		<a class="btn primary" href="/profile">Your invite</a>
	{:else if view === 'used'}
		<h1>Invite already used</h1>
		<p class="muted">Each account can use one invite.</p>
		<a class="btn primary" href="/">Go to projects</a>
	{:else if view === 'old'}
		<h1>Invites are for new accounts</h1>
		<p class="muted">This account is more than 14 days old. You can still share your own invite from your profile.</p>
		<a class="btn primary" href="/profile">Your invite</a>
	{/if}
</div>

<style>
	.center {
		text-align: center;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		padding: 32px 20px;
		max-width: 520px;
		margin: 0 auto;
	}
	h1 {
		margin: 4px 0 0;
		font-size: 24px;
	}
	p {
		max-width: 420px;
		margin: 0 0 4px;
	}
	.big {
		width: 56px;
		height: 56px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		background: var(--ochre-soft);
		color: var(--ochre-ink);
	}
	.row {
		display: flex;
		gap: 8px;
		margin-top: 8px;
	}
	.error {
		color: #b5483a;
	}
</style>
