<script lang="ts">
	/**
	 * "Add to Home Screen" helper.
	 * Android / desktop Chrome & Edge: one-tap install via the beforeinstallprompt event.
	 * iPhone / iPad Safari: Apple doesn't allow a button, so we show the 2-step guide.
	 */
	import { onMount } from 'svelte';
	import Icon from './Icon.svelte';

	interface BeforeInstallPromptEvent extends Event {
		prompt: () => Promise<void>;
		userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
	}

	let deferred = $state<BeforeInstallPromptEvent | null>(null);
	let installed = $state(false);
	let ios = $state(false);

	onMount(() => {
		installed =
			matchMedia('(display-mode: standalone)').matches ||
			(navigator as Navigator & { standalone?: boolean }).standalone === true;
		ios =
			/iphone|ipad|ipod/i.test(navigator.userAgent) ||
			(navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

		const onPrompt = (e: Event) => {
			e.preventDefault();
			deferred = e as BeforeInstallPromptEvent;
		};
		const onInstalled = () => (installed = true);
		addEventListener('beforeinstallprompt', onPrompt);
		addEventListener('appinstalled', onInstalled);
		return () => {
			removeEventListener('beforeinstallprompt', onPrompt);
			removeEventListener('appinstalled', onInstalled);
		};
	});

	async function install() {
		if (!deferred) return;
		await deferred.prompt();
		const { outcome } = await deferred.userChoice;
		if (outcome === 'accepted') installed = true;
		deferred = null;
	}
</script>

<div class="card install">
	<div class="head">
		<Icon name="download" />
		<strong>Add RE:Aspect to your home screen</strong>
	</div>
	{#if installed}
		<p class="muted">Installed — open it from your home screen for the full-screen app experience.</p>
	{:else if deferred}
		<p class="muted">Opens full-screen like a normal app, loads instantly and works offline for projects you've viewed.</p>
		<button class="btn primary" onclick={install}>Install app</button>
	{:else if ios}
		<p class="muted">On iPhone / iPad (Safari):</p>
		<ol>
			<li>Tap the <strong>Share</strong> button <Icon name="share" size={16} /> at the bottom of Safari.</li>
			<li>Scroll and tap <strong>Add to Home Screen</strong>, then <strong>Add</strong>.</li>
		</ol>
	{:else}
		<p class="muted">
			In Chrome or Edge, use the browser menu → <strong>Install app</strong> (or <strong>Add to Home screen</strong> on Android).
		</p>
	{/if}
</div>

<style>
	.head {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-bottom: 6px;
	}
	ol {
		margin: 4px 0 0;
		padding-left: 20px;
	}
	li {
		margin-bottom: 4px;
	}
</style>
