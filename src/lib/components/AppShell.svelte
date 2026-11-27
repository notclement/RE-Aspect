<script lang="ts">
	/**
	 * App frame, organised by unit: a slim top bar (menu · breadcrumb · account) and a slide-in menu.
	 * Views of a unit (3D plan / Top down / Walk) are tabs inside the unit page, not global navigation.
	 */
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import { afterNavigate, goto } from '$app/navigation';
	import Icon, { type IconName } from './Icon.svelte';
	import { auth } from '#lib/stores/auth.svelte.ts';
	import { nav } from '#lib/stores/nav.svelte.ts';
	import { profile, ROLE_LABELS } from '#lib/stores/profile.svelte.ts';
	import { BRAND } from '#lib/config/brand.ts';

	let { children }: { children: Snippet } = $props();
	let open = $state(false);

	// Settings / Profile / New unit get a back button that returns to wherever you came from.
	const SUB_PAGES = ['/settings', '/profile', '/anchor'];
	const isSub = $derived(SUB_PAGES.includes(page.url.pathname));
	let inAppSteps = 0;
	afterNavigate((n) => {
		if (n.type !== 'enter') inAppSteps++;
	});
	function back() {
		if (inAppSteps > 0 && history.length > 1) history.back();
		else goto('/');
	}

	const links: { href: string; label: string; icon: IconName }[] = [
		{ href: '/', label: 'Units', icon: 'home' },
		{ href: '/anchor', label: 'New unit', icon: 'plus' },
		{ href: '/profile', label: 'Profile', icon: 'user' },
		{ href: '/settings', label: 'Settings', icon: 'gear' }
	];

	$effect(() => {
		page.url.pathname; // close the menu on navigation
		open = false;
	});
</script>

<header class="top">
	{#if isSub}
		<button class="iconbtn" onclick={back} aria-label="Back"><Icon name="back" size={22} /></button>
	{:else}
		<button class="iconbtn" onclick={() => (open = true)} aria-label="Open menu"><Icon name="menu" size={20} /></button>
	{/if}
	<nav class="crumbs" aria-label="Breadcrumb">
		{#each nav.crumbs as c, i (i)}
			{#if i > 0}<span class="sep">/</span>{/if}
			{#if c.href && i < nav.crumbs.length - 1}<a href={c.href}>{c.label}</a>{:else}<strong>{c.label}</strong>{/if}
		{/each}
	</nav>
	<a class="me" href="/profile" aria-label="Profile">{profile.firstName.slice(0, 1).toUpperCase() || '?'}</a>
</header>

{#if auth.status === 'preview'}
	<div class="preview">Preview mode — data stays in this browser.</div>
{/if}
{#if profile.viewAs}
	<div class="preview viewas">
		Viewing as <strong>{ROLE_LABELS[profile.viewAs]}</strong>
		<button onclick={() => profile.setViewAs(null)}>Back to admin</button>
	</div>
{/if}

<main class="main">{@render children()}</main>

{#if open}
	<button class="scrim" aria-label="Close menu" onclick={() => (open = false)}></button>
	<aside class="drawer" aria-label="Menu">
		<div class="brand"><span class="dot"></span><strong>{BRAND.name}</strong></div>
		{#each links as l (l.href)}
			<a href={l.href} class:on={page.url.pathname === l.href}><Icon name={l.icon} />{l.label}</a>
		{/each}
		<div class="spacer"></div>
		<p class="muted small">Signed in as {profile.data.name}</p>
		<button class="btn wide" onclick={() => auth.signOut()}><Icon name="logout" /> Sign out</button>
	</aside>
{/if}

<style>
	.top {
		position: sticky;
		top: 0;
		z-index: 10;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: calc(10px + var(--safe-t)) 14px 10px;
		background: color-mix(in srgb, var(--paper) 92%, transparent);
		backdrop-filter: blur(10px);
		border-bottom: 1px solid var(--line);
	}
	.iconbtn {
		width: 40px;
		height: 40px;
		border: 0;
		background: transparent;
		border-radius: 10px;
		display: grid;
		place-items: center;
		cursor: pointer;
	}
	.crumbs {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 10px;
		white-space: nowrap;
		overflow: hidden;
		font-size: 16px;
	}
	.crumbs a {
		color: var(--muted);
		text-decoration: none;
	}
	.crumbs strong {
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.sep {
		color: var(--muted);
	}
	.me {
		width: 36px;
		height: 36px;
		border-radius: 50%;
		border: 1.5px solid var(--line);
		display: grid;
		place-items: center;
		text-decoration: none;
		font-weight: 600;
		color: var(--forest);
	}
	.preview {
		font-size: 12px;
		text-align: center;
		padding: 5px;
		background: var(--ochre-soft);
		color: var(--ochre);
	}
	.viewas {
		background: color-mix(in srgb, var(--forest) 14%, var(--surface));
		color: var(--forest);
		display: flex;
		justify-content: center;
		align-items: center;
		gap: 10px;
	}
	.viewas button {
		border: 1px solid currentColor;
		background: none;
		color: inherit;
		border-radius: 8px;
		padding: 2px 8px;
		font-size: 12px;
		cursor: pointer;
	}
	.main {
		padding: 18px 16px calc(28px + var(--safe-b));
		max-width: 1040px;
		margin: 0 auto;
	}
	.scrim {
		position: fixed;
		inset: 0;
		border: 0;
		background: rgba(20, 26, 22, 0.35);
		z-index: 30;
	}
	.drawer {
		position: fixed;
		top: 0;
		bottom: 0;
		left: 0;
		width: min(300px, 84vw);
		z-index: 31;
		background: var(--surface);
		border-right: 1px solid var(--line);
		padding: calc(18px + var(--safe-t)) 14px calc(18px + var(--safe-b));
		display: flex;
		flex-direction: column;
		gap: 4px;
		animation: slide 0.18s ease-out;
	}
	@keyframes slide {
		from {
			transform: translateX(-100%);
		}
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 18px;
		padding: 6px 10px 16px;
	}
	.dot {
		width: 24px;
		height: 24px;
		border-radius: 50%;
		background: radial-gradient(circle at 40% 40%, #f8d98c, var(--ochre));
	}
	.drawer a {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 46px;
		padding: 0 12px;
		border-radius: 12px;
		text-decoration: none;
		font-weight: 500;
	}
	.drawer a.on {
		background: var(--surface-2);
		color: var(--forest);
	}
	.spacer {
		flex: 1;
	}
	.small {
		font-size: 13px;
		padding: 0 4px;
		text-align: center;
	}
</style>
