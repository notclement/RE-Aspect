<script lang="ts">
	/**
	 * App frame: slim left rail on tablet/desktop (≥ 900px), bottom tab bar on phones.
	 * Lenses (Sun View, Studio, 3D) are part of one canvas in Phase 1 — switching never reloads.
	 */
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import Icon, { type IconName } from './Icon.svelte';
	import { auth } from '#lib/stores/auth.svelte.ts';

	let { children }: { children: Snippet } = $props();

	const items: { href: string; label: string; icon: IconName }[] = [
		{ href: '/', label: 'Projects', icon: 'home' },
		{ href: '/sun', label: 'Sun View', icon: 'sun' },
		{ href: '/studio', label: 'Studio', icon: 'plan' },
		{ href: '/walk', label: '3D', icon: 'cube' },
		{ href: '/settings', label: 'Settings', icon: 'gear' }
	];

	const isActive = (href: string) =>
		href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href);
</script>

<div class="shell">
	<nav class="rail" aria-label="Main">
		<a href="/" class="logo" aria-label="RE:Aspect home"><span class="dot"></span></a>
		{#each items as it (it.href)}
			<a href={it.href} class="ri" class:on={isActive(it.href)} aria-current={isActive(it.href) ? 'page' : undefined}>
				<Icon name={it.icon} />
				<small>{it.label}</small>
			</a>
		{/each}
	</nav>

	<main class="main">
		{#if auth.status === 'preview'}
			<div class="preview">Preview mode — sign-in turns on once Supabase is connected. Data stays in this browser.</div>
		{/if}
		{@render children()}
	</main>

	<nav class="tabs" aria-label="Main">
		{#each items as it (it.href)}
			<a href={it.href} class:on={isActive(it.href)} aria-current={isActive(it.href) ? 'page' : undefined}>
				<Icon name={it.icon} size={22} />
				<small>{it.label}</small>
			</a>
		{/each}
	</nav>
</div>

<style>
	.shell {
		min-height: 100dvh;
	}
	.main {
		padding: calc(16px + var(--safe-t)) 18px calc(var(--tabs-h) + var(--safe-b) + 20px);
		max-width: 1100px;
		margin: 0 auto;
	}
	.preview {
		font-size: 12px;
		background: color-mix(in srgb, var(--sun) 18%, var(--surface));
		border: 1px solid color-mix(in srgb, var(--sun) 50%, var(--line));
		padding: 6px 10px;
		border-radius: 8px;
		margin-bottom: 14px;
	}

	/* Phone: bottom tabs */
	.rail {
		display: none;
	}
	.tabs {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		height: calc(var(--tabs-h) + var(--safe-b));
		padding-bottom: var(--safe-b);
		display: flex;
		background: color-mix(in srgb, var(--surface) 92%, transparent);
		backdrop-filter: blur(10px);
		border-top: 1px solid var(--line);
		z-index: 20;
	}
	.tabs a {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 2px;
		text-decoration: none;
		color: var(--muted);
	}
	.tabs small {
		font-size: 10.5px;
		font-weight: 600;
	}
	.tabs a.on {
		color: var(--dusk);
	}

	/* Tablet / desktop: left rail */
	@media (min-width: 900px) {
		.tabs {
			display: none;
		}
		.rail {
			display: flex;
			flex-direction: column;
			align-items: center;
			gap: 4px;
			position: fixed;
			left: 0;
			top: 0;
			bottom: 0;
			width: var(--rail-w);
			padding: 14px 0;
			background: var(--ink);
			z-index: 20;
		}
		.main {
			margin-left: var(--rail-w);
			padding: 28px 32px 40px;
			max-width: calc(1100px + var(--rail-w));
		}
		.logo {
			margin-bottom: 14px;
		}
		.dot {
			display: block;
			width: 26px;
			height: 26px;
			border-radius: 50%;
			background: radial-gradient(circle at 40% 40%, #ffd98a, var(--dusk));
		}
		.ri {
			display: flex;
			flex-direction: column;
			align-items: center;
			gap: 2px;
			width: 62px;
			padding: 8px 0;
			border-radius: 10px;
			color: #b9b0a1;
			text-decoration: none;
		}
		.ri small {
			font-size: 10px;
		}
		.ri.on {
			background: #34312b;
			color: #fff;
		}
		.ri:last-of-type {
			margin-top: auto;
		}
	}
</style>
