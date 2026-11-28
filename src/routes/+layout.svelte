<script lang="ts">
	import { pendingJoin } from '#lib/stores/agency.svelte.ts';
	import { pendingRef } from '#lib/stores/referral.svelte.ts';
	import { validateInviteCode } from '#lib/validate.ts';
	import '../app.css';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import AppShell from '#lib/components/AppShell.svelte';
	import Spinner from '#lib/components/Spinner.svelte';
	import { theme } from '#lib/stores/theme.svelte.ts';
	import { profile } from '#lib/stores/profile.svelte.ts';
	import { auth } from '#lib/stores/auth.svelte.ts';
	import { blockPageZoom } from '#lib/no-zoom.ts';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	// Pages that render full-screen, without the nav shell.
	const BARE = ['/login', '/welcome', '/s', '/start']; // /start = public landing page // /s = public share page (no account needed)
	const bare = $derived(BARE.includes(page.url.pathname));

	onMount(() => {
		const unblock = blockPageZoom();
		theme.init();
		profile.load();
		auth.init();
		return unblock;
	});

	/** Every signed-in user gives their full name and CEA number once (shown on shared pages, migration 0020). */
	const needsAgentInfo = () => auth.status === 'signed-in' && profile.serverLoaded && (!profile.data.fullName || (!profile.data.ceaNo && !profile.data.notAgent));

	// Route guard: signed-out → /start (home) or /login; signed-in (or preview) without a name → /welcome.
	$effect(() => {
		const path = page.url.pathname;
		if (auth.status === 'loading' || !profile.loaded) return;
		if (path === '/s' || path === '/legal') return; // public: read-only share links and the terms work signed out
		// A scanned agency QR (/join?code=…) survives the sign-in: keep the code until /join handles it.
		if (path === '/join') {
			const c = validateInviteCode(page.url.searchParams.get('code') ?? '');
			if (c.ok) pendingJoin.set(c.value);
		}
		// A scanned referral QR (/refer?code=…) also survives the sign-in.
		if (path === '/refer') {
			const c = validateInviteCode(page.url.searchParams.get('code') ?? '');
			if (c.ok) pendingRef.set(c.value);
		}
		// Signed out: the home page shows the landing page; anything else asks to sign in.
		if (auth.status === 'signed-out') {
			if (path === '/') goto('/start', { replaceState: true });
			else if (path !== '/login' && path !== '/start') goto('/login', { replaceState: true });
		} else if (path === '/start') goto('/', { replaceState: true });
		else if (auth.status === 'signed-in' && profile.data.name && path !== '/join' && pendingJoin.get()) goto('/join', { replaceState: true });
		else if (auth.status === 'signed-in' && profile.data.name && path !== '/refer' && path !== '/join' && pendingRef.get()) goto('/refer', { replaceState: true });
		else if ((!profile.data.name || needsAgentInfo()) && !BARE.includes(path))
			goto('/welcome', { replaceState: true });
		// Already named, with full name + CEA number (e.g. returning user) → never ask again.
		else if (path === '/welcome' && profile.data.name && !needsAgentInfo() && (auth.status !== 'signed-in' || profile.serverLoaded)) goto('/', { replaceState: true });
	});
</script>

<svelte:head>
	<title>RE:Aspect</title>
</svelte:head>

{#if auth.status === 'loading'}
	<div class="boot"><Spinner size={22} /></div>
{:else if auth.status === 'signed-in' && profile.data.disabled}
	<div class="boot disabled">
		<div>
			<h1>Account disabled</h1>
			<p class="muted">This account has been disabled by an administrator. If you think this is a mistake, please get in touch.</p>
			<button class="btn" onclick={() => auth.signOut()}>Sign out</button>
		</div>
	</div>
{:else if bare}
	{@render children()}
{:else}
	<AppShell>{@render children()}</AppShell>
{/if}

<style>
	.boot {
		min-height: 100dvh;
		display: grid;
		place-items: center;
	}
	.disabled > div {
		max-width: 380px;
		padding: 24px;
		text-align: center;
	}
</style>
