<script lang="ts">
	/** Profile card: your referral QR. A friend who joins with it and you both get 1 month of Pro (migration 0018). */
	import { myReferral, referralLink, type MyReferral } from '#lib/stores/referral.svelte.ts';
	import { supabaseConfigured } from '#lib/supabase.ts';
	import Icon from '#lib/components/Icon.svelte';
	import Spinner from '#lib/components/Spinner.svelte';
	import QrCode from '#lib/components/QrCode.svelte';

	let open = $state(false);
	let busy = $state(false);
	let info = $state<MyReferral | null>(null);
	let error = $state<string | null>(null);
	let copied = $state(false);
	const link = $derived(info ? referralLink(info.code) : '');

	async function show() {
		open = !open;
		if (!open || info) return;
		busy = true;
		error = null;
		try {
			info = await myReferral();
			if (!info) error = 'Invites need an account.';
		} catch (e) {
			error = e instanceof Error ? e.message : 'Could not load your invite.';
		}
		busy = false;
	}
	async function copy() {
		try {
			await navigator.clipboard.writeText(link);
			copied = true;
			setTimeout(() => (copied = false), 1800);
		} catch {
			error = 'Copy failed — long-press the link instead.';
		}
	}
	async function share() {
		try {
			await navigator.share({ title: 'RE:Aspect', text: 'See the sunlight inside any home. Join with my invite and we both get 1 month of Pro:', url: link });
		} catch {
			/* cancelled */
		}
	}
</script>

{#if supabaseConfigured}
	<section class="card invite" aria-label="Invite a friend">
		<button class="row" onclick={show} aria-expanded={open}>
			<span class="ic"><Icon name="gift" size={20} /></span>
			<span class="txt"><strong>Invite a friend</strong><small class="muted">You both get 1 month of Pro</small></span>
			<span class="chev" class:up={open}><Icon name="chevron" size={16} /></span>
		</button>
		{#if open}
			<div class="body">
				{#if busy}
					<Spinner size={18} />
				{:else if error}
					<p class="error small">{error}</p>
				{:else if info}
					<QrCode text={link} size={180} label="Your invite QR code" />
					<code class="link">{link}</code>
					<div class="btns">
						<button class="btn" onclick={copy}>{copied ? 'Copied' : 'Copy link'}</button>
						{#if typeof navigator !== 'undefined' && 'share' in navigator}<button class="btn primary" onclick={share}>Share</button>{/if}
					</div>
					<p class="muted small">
						For new accounts only. {info.joined ? `${info.joined} joined with your invite · ${info.months} month${info.months === 1 ? '' : 's'} of Pro earned (up to 12).` : 'Nobody has joined with it yet.'}
					</p>
				{/if}
			</div>
		{/if}
	</section>
{/if}

<style>
	.invite {
		margin-top: 14px;
		padding: 0;
		overflow: hidden;
	}
	.row {
		width: 100%;
		min-height: 56px;
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 10px 16px;
		border: 0;
		background: none;
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	.ic {
		width: 36px;
		height: 36px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		background: var(--ochre-soft);
		color: var(--ochre-ink);
		flex-shrink: 0;
	}
	.txt {
		display: grid;
		flex: 1;
	}
	.txt small {
		font-size: 13px;
	}
	.chev {
		transform: rotate(90deg);
		transition: transform 0.2s;
		color: var(--muted);
	}
	.chev.up {
		transform: rotate(-90deg);
	}
	.body {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 10px;
		padding: 4px 16px 18px;
		text-align: center;
	}
	.link {
		font-size: 12px;
		word-break: break-all;
		color: var(--muted);
	}
	.btns {
		display: flex;
		gap: 8px;
	}
	.small {
		font-size: 13px;
		margin: 0;
	}
	.error {
		color: #b5483a;
	}
</style>
