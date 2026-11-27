<script lang="ts">
	/**
	 * Share a unit: a read-only link anyone can open without an account, with the current view, date and time
	 * in it (#v=…&d=…&t=…). Copy link · Share on WhatsApp · QR to the same link. Nothing is downloaded.
	 * Your own projects get a private random link (revocable); demos share a fixed link.
	 */
	import Icon from '#lib/components/Icon.svelte';
	import QrCode from '#lib/components/QrCode.svelte';
	import Spinner from '#lib/components/Spinner.svelte';
	import { getSupabase, supabaseConfigured } from '#lib/supabase.ts';
	import { auth } from '#lib/stores/auth.svelte.ts';
	import { errText } from '#lib/stores/agency.svelte.ts';

	let {
		open = $bindable(false),
		projectId = null,
		demoId = null,
		title,
		hash
	}: { open?: boolean; projectId?: string | null; demoId?: string | null; title: string; hash: string } = $props();

	let base = $state(''); // link without the view hash
	let busy = $state(false);
	let error = $state('');
	let copied = $state(false);
	let showQr = $state(false);

	const url = $derived(base ? base + hash : '');
	const waText = $derived(`${title} — see how the sun moves through this home: ${url}`);

	$effect(() => {
		if (!open || base) return;
		void load();
	});

	async function load() {
		error = '';
		if (demoId) {
			base = `${location.origin}/s?demo=${encodeURIComponent(demoId)}`;
			return;
		}
		if (!projectId) return;
		if (!supabaseConfigured || auth.status !== 'signed-in') {
			error = 'Sign in to share your projects.';
			return;
		}
		busy = true;
		try {
			const sb = await getSupabase();
			const { data, error: e } = await sb.rpc('project_share', { p_id: projectId });
			if (e) throw new Error(errText(e));
			if (typeof data !== 'string' || !/^[0-9a-f]{32}$/.test(data)) throw new Error('Could not create a link.');
			base = `${location.origin}/s?k=${data}`;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Could not create a link.';
		}
		busy = false;
	}

	async function copy() {
		try {
			await navigator.clipboard.writeText(url);
			copied = true;
			setTimeout(() => (copied = false), 1800);
		} catch {
			error = 'Copy failed — press and hold the link to copy it.';
		}
	}

	async function stop() {
		if (!projectId) return;
		busy = true;
		try {
			const sb = await getSupabase();
			const { error: e } = await sb.rpc('project_unshare', { p_id: projectId });
			if (e) throw new Error(errText(e));
			base = '';
			open = false;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Could not turn the link off.';
		}
		busy = false;
	}

	function onKey(e: KeyboardEvent) {
		if (open && e.key === 'Escape') open = false;
	}
</script>

<svelte:window onkeydown={onKey} />

{#if open}
	<button class="scrim" aria-label="Close share" onclick={() => (open = false)}></button>
	<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="share-title">
		<div class="grab" aria-hidden="true"></div>
		<header>
			<Icon name="share" size={20} />
			<h2 id="share-title">Share this unit</h2>
			<button class="x" onclick={() => (open = false)} aria-label="Close"><Icon name="close" size={20} /></button>
		</header>
		<p class="muted">Anyone with the link can view the sun study — no account needed. It opens on the view, date and time you're looking at now. Notes stay private.</p>

		{#if busy && !url}
			<div class="center"><Spinner size={20} /></div>
		{:else if url}
			<input class="link" readonly value={url} aria-label="Share link" onfocus={(e) => (e.currentTarget as HTMLInputElement).select()} />
			<div class="row">
				<button class="btn primary" onclick={copy}><Icon name={copied ? 'check' : 'share'} size={18} />{copied ? 'Copied' : 'Copy link'}</button>
				<a class="btn wa" href="https://wa.me/?text={encodeURIComponent(waText)}" target="_blank" rel="noopener noreferrer">Share on WhatsApp</a>
				<button class="btn" onclick={() => (showQr = !showQr)} aria-pressed={showQr}><Icon name="qr" size={18} />QR</button>
			</div>
			{#if showQr}
				<div class="qr"><QrCode text={url} size={220} label="QR code for the share link" /></div>
			{/if}
			{#if projectId}
				<button class="stop" onclick={stop} disabled={busy}>Stop sharing (turns this link off)</button>
			{/if}
		{/if}
		{#if error}<p class="error" role="alert">{error}</p>{/if}
	</div>
{/if}

<style>
	.scrim {
		position: fixed;
		inset: 0;
		z-index: 40;
		border: 0;
		background: rgba(20, 26, 22, 0.4);
	}
	.sheet {
		position: fixed;
		z-index: 41;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		width: min(480px, calc(100vw - 32px));
		max-height: calc(100dvh - 48px);
		overflow-y: auto;
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		box-shadow: 0 20px 50px rgba(0, 0, 0, 0.25);
		padding: 16px 18px 20px;
	}
	.grab {
		display: none;
	}
	header {
		display: flex;
		align-items: center;
		gap: 10px;
		color: var(--forest);
	}
	header h2 {
		flex: 1;
		margin: 0;
		font-family: var(--serif);
		font-weight: var(--heading-weight);
		font-size: 22px;
		color: var(--text);
	}
	.x {
		width: 44px;
		height: 44px;
		border: 0;
		border-radius: var(--radius-sm);
		background: var(--surface-2);
		color: var(--text);
		display: grid;
		place-items: center;
		cursor: pointer;
	}
	p {
		font-size: 14px;
	}
	.link {
		width: 100%;
		min-height: 44px;
		padding: 0 12px;
		font-size: 16px;
		border: 1px solid var(--line);
		border-radius: var(--radius-sm);
		background: var(--surface-2);
		color: var(--text);
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-top: 10px;
	}
	.wa {
		background: #25d366;
		border-color: #25d366;
		color: #0b2b17;
	}
	.qr {
		display: grid;
		place-items: center;
		margin-top: 14px;
		padding: 10px;
		background: #fff;
		border-radius: var(--radius-sm);
	}
	.stop {
		margin-top: 14px;
		min-height: 44px;
		border: 0;
		background: none;
		color: #b5483a;
		font-weight: 600;
		cursor: pointer;
		padding: 0;
	}
	.center {
		display: grid;
		place-items: center;
		padding: 20px;
	}
	.error {
		color: #b5483a;
	}
	@media (max-width: 560px) {
		.sheet {
			left: 0;
			right: 0;
			top: auto;
			bottom: 0;
			transform: none;
			width: auto;
			max-height: 88dvh;
			border-radius: var(--radius) var(--radius) 0 0;
			padding: 8px 16px calc(20px + var(--safe-b));
		}
		.grab {
			display: block;
			width: 40px;
			height: 5px;
			border-radius: 3px;
			background: var(--line);
			margin: 0 auto 10px;
		}
	}
</style>
