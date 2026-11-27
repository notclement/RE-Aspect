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
		{ href: '/', label: 'Projects', icon: 'home' }
	];
	// Account menu (tap the avatar): Profile, Settings, Sign out.
	let acct = $state(false);
	const acctLinks: { href: string; label: string; icon: IconName }[] = [
		{ href: '/profile', label: 'Profile', icon: 'user' },
		{ href: '/settings', label: 'Settings', icon: 'gear' }
	];

	$effect(() => {
		page.url.pathname; // close the menu on navigation
		open = false;
		acct = false;
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
	<div class="acct">
		<button class="me" class:on={acct} onclick={() => (acct = !acct)} aria-label="Account menu" aria-expanded={acct}>
			{profile.firstName.slice(0, 1).toUpperCase() || '?'}
		</button>
		{#if acct}
			<button class="acct-scrim" aria-label="Close account menu" onclick={() => (acct = false)}></button>
			<div class="menu" role="menu">
				<div class="who">
					<strong>{profile.data.name || 'You'}</strong>
					{#if auth.email}<span class="muted">{auth.email}</span>{/if}
				</div>
				{#each acctLinks as l (l.href)}
					<a role="menuitem" href={l.href} class:on={page.url.pathname === l.href}><Icon name={l.icon} />{l.label}</a>
				{/each}
				{#if auth.status === 'signed-in'}
					<button role="menuitem" onclick={() => auth.signOut()}><Icon name="logout" />Sign out</button>
				{/if}
			</div>
		{/if}
	</div>
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
	.me.on {
		border-color: var(--forest);
		background: var(--surface-2);
	}
	button.me {
		background: var(--surface);
		cursor: pointer;
		font-size: 16px;
		padding: 0;
		min-width: 44px;
		min-height: 44px;
		width: 44px;
		height: 44px;
	}
	.acct {
		position: relative;
	}
	.acct-scrim {
		position: fixed;
		inset: 0;
		border: 0;
		background: transparent;
		z-index: 20;
		cursor: default;
	}
	.menu {
		position: absolute;
		right: 0;
		top: calc(100% + 8px);
		z-index: 21;
		width: 230px;
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: 14px;
		box-shadow: 0 12px 30px rgba(20, 26, 22, 0.16);
		padding: 6px;
		display: flex;
		flex-direction: column;
		animation: pop 0.14s ease-out;
		transform-origin: top right;
	}
	@keyframes pop {
		from {
			opacity: 0;
			transform: scale(0.96) translateY(-4px);
		}
	}
	.who {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 10px 12px 10px;
		border-bottom: 1px solid var(--line);
		margin-bottom: 4px;
		font-size: 14px;
		overflow: hidden;
	}
	.who span {
		font-size: 12px;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.menu a,
	.menu button {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 44px;
		padding: 0 12px;
		border-radius: 10px;
		text-decoration: none;
		font: inherit;
		font-weight: 500;
		color: inherit;
		background: none;
		border: 0;
		cursor: pointer;
		text-align: left;
	}
	.menu a:hover,
	.menu button:hover,
	.menu a.on {
		background: var(--surface-2);
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
