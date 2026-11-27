<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import AppShell from '#lib/components/AppShell.svelte';
	import Spinner from '#lib/components/Spinner.svelte';
	import { theme } from '#lib/stores/theme.svelte.ts';
	import { profile } from '#lib/stores/profile.svelte.ts';
	import { auth } from '#lib/stores/auth.svelte.ts';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	// Pages that render full-screen, without the nav shell.
	const BARE = ['/login', '/welcome'];
	const bare = $derived(BARE.includes(page.url.pathname));

	onMount(() => {
		theme.init();
		profile.load();
		auth.init();
	});

	// Route guard: signed-out → /login; signed-in (or preview) without a name → /welcome.
	$effect(() => {
		const path = page.url.pathname;
		if (auth.status === 'loading' || !profile.loaded) return;
		if (auth.status === 'signed-out' && path !== '/login') goto('/login', { replaceState: true });
		else if (auth.status !== 'signed-out' && !profile.data.name && !BARE.includes(path))
			goto('/welcome', { replaceState: true });
		// Already named (e.g. returning user, or name taken from Google) → never ask again.
		else if (auth.status !== 'signed-out' && profile.data.name && path === '/welcome') goto('/', { replaceState: true });
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
