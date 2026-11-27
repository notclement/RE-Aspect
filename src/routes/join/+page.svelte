<script lang="ts">
	/**
	 * /join?code=XXXXXXXX — opened from an agency's QR code. Signed-out visitors go to sign in first
	 * (the layout keeps the code); then they ask to join and wait for the lead to approve.
	 */
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { nav } from '#lib/stores/nav.svelte.ts';
	import { agency, pendingJoin } from '#lib/stores/agency.svelte.ts';
	import { auth } from '#lib/stores/auth.svelte.ts';
	import { validateInviteCode } from '#lib/validate.ts';
	import Icon from '#lib/components/Icon.svelte';
	import Spinner from '#lib/components/Spinner.svelte';

	$effect(() => nav.set({ label: 'Join an agency' }));

	const parsed = validateInviteCode(page.url.searchParams.get('code') ?? pendingJoin.get() ?? '');
	const code = parsed.ok ? parsed.value : null;

	type State = 'loading' | 'ask' | 'sent' | 'already' | 'other' | 'invalid' | 'preview';
	let view = $state<State>('loading');
	let found = $state<{ id: string; name: string; lead: string } | null>(null);
	let busy = $state(false);
	let error = $state<string | null>(null);

	onMount(async () => {
		if (auth.status === 'preview') return void (view = 'preview');
		if (!code) {
			pendingJoin.set(null);
			return void (view = 'invalid');
		}
		try {
			await agency.refresh();
			found = await agency.peek(code);
			if (!found) {
				pendingJoin.set(null);
				return void (view = 'invalid');
			}
			if (agency.info) {
				pendingJoin.set(null);
				view = agency.info.id === found.id ? 'already' : 'other';
				return;
			}
			view = 'ask';
		} catch (e) {
			error = e instanceof Error ? e.message : 'Could not check this invite.';
			view = 'ask';
		}
	});

	async function join() {
		if (!code) return;
		busy = true;
		error = null;
		try {
			const s = await agency.join(code);
			pendingJoin.set(null);
			view = s === 'active' ? 'already' : 'sent';
		} catch (e) {
			error = e instanceof Error ? e.message : 'Could not send your request.';
		}
		busy = false;
	}
	function notNow() {
		pendingJoin.set(null);
		goto('/', { replaceState: true });
	}
</script>

<svelte:head><title>Join an agency · RE:Aspect</title></svelte:head>

<div class="card center">
	<span class="big"><Icon name="users" size={28} /></span>
	{#if view === 'loading'}
		<Spinner size={20} />
	{:else if view === 'preview'}
		<h1>Join an agency</h1>
		<p class="muted">Agencies need an account — open this link on the live app and sign in.</p>
	{:else if view === 'invalid'}
		<h1>This invite doesn't work</h1>
		<p class="muted">The QR code may have been replaced. Ask your agency lead for their current QR code.</p>
		<a class="btn" href="/">Go to projects</a>
	{:else if view === 'ask'}
		<h1>{found ? `Join ${found.name}?` : 'Join this agency?'}</h1>
		{#if found}<p class="muted">{found.lead || 'The agency lead'} will be asked to approve you. Once approved you'll use the agency's shared projects and see your team.</p>{/if}
		<p class="muted small">Projects you make while in the agency belong to the agency, and stay with it if you leave.</p>
		{#if error}<p class="error">{error}</p>{/if}
		<div class="row">
			<button class="btn" onclick={notNow}>Not now</button>
			<button class="btn primary" onclick={join} disabled={busy}>{busy ? 'Sending…' : 'Ask to join'}</button>
		</div>
	{:else if view === 'sent'}
		<h1>Request sent</h1>
		<p class="muted">{found?.lead || 'Your agency lead'} needs to approve you. You can check the status under <strong>My agency</strong> (tap your photo).</p>
		<a class="btn primary" href="/agency">My agency</a>
	{:else if view === 'already'}
		<h1>You're in {found?.name ?? 'this agency'}</h1>
		<p class="muted">{agency.info?.status === 'pending' ? 'Your request is waiting for the lead to approve it.' : "You're already a member."}</p>
		<a class="btn primary" href="/agency">My agency</a>
	{:else if view === 'other'}
		<h1>You're already in an agency</h1>
		<p class="muted">You're in <strong>{agency.info?.name}</strong>. Leave it first under My agency, then scan this QR code again.</p>
		<a class="btn primary" href="/agency">My agency</a>
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
		color: var(--ochre);
	}
	.row {
		display: flex;
		gap: 8px;
		margin-top: 8px;
	}
	.small {
		font-size: 13px;
	}
	.error {
		color: #b5483a;
	}
</style>
