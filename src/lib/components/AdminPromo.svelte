<script lang="ts">
	/** Admin: give everyone Pro for N days with a message (one-time banner for each user). Reverts by itself. */
	import { onMount } from 'svelte';
	import { promo } from '#lib/stores/promo.svelte.ts';
	import { validateNumber, validateFreeText } from '#lib/validate.ts';

	let days = $state('7');
	let message = $state('');
	let err = $state<string | null>(null);
	let busy = $state(false);
	let confirm = $state<'start' | 'end' | null>(null);
	type Row = Awaited<ReturnType<typeof promo.list>>[number];
	let rows = $state<Row[]>([]);
	let confirmDelete = $state<string | null>(null);
	async function loadList() {
		try {
			rows = await promo.list();
		} catch (e) {
			err = e instanceof Error ? e.message : 'Could not load promos.';
		}
	}
	onMount(loadList);
	const fmt = (s: string) => new Date(s).toLocaleString('en-SG', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });

	function check(): { d: number; m: string } | null {
		const d = validateNumber(days, { min: 1, max: 90, label: 'Days', decimals: 0 });
		const m = validateFreeText(message, { max: 280, label: 'Message' });
		if (!d.ok) return (err = d.error), null;
		if (!m.ok) return (err = m.error), null;
		if (!m.value) return (err = 'Write the message everyone will see.'), null;
		if (/[{}\\]/.test(m.value)) return (err = 'Remove { } or \\ from the message.'), null;
		err = null;
		return { d: d.value, m: m.value };
	}
	async function run(fn: () => Promise<void>) {
		busy = true;
		err = null;
		try {
			await fn();
			confirm = null;
			confirmDelete = null;
			await loadList();
		} catch (e) {
			err = e instanceof Error ? e.message : 'Could not update.';
		}
		busy = false;
	}
</script>

<section class="card promo">
	<h3>Pro for everyone</h3>
	{#if promo.active && promo.current}
		<p><strong>Running</strong> until {fmt(promo.current.endsAt)}. Everyone has Pro until then, then goes back to their own plan.</p>
		<p class="msg">{promo.current.message}</p>
		{#if confirm === 'end'}
			<div class="row">
				<span>End it now? Everyone goes back to their own plan straight away.</span>
				<button class="btn" onclick={() => (confirm = null)}>Cancel</button>
				<button class="btn danger" disabled={busy} onclick={() => run(() => promo.end())}>End promo</button>
			</div>
		{:else}
			<button class="btn danger" onclick={() => (confirm = 'end')}>End now</button>
		{/if}
	{:else}
		<p class="muted small">Give every account Pro for a number of days. Each person sees your message once as a banner (they can reopen it from the gift button, top right). When it ends, everyone is back on their own plan automatically.</p>
		<div class="field"><label for="pd">Days (1–90)</label><input id="pd" inputmode="numeric" maxlength="2" placeholder="Type here…" bind:value={days} /></div>
		<div class="field">
			<label for="pm">Message</label>
			<textarea id="pm" rows="3" maxlength="280" placeholder="Type here…" bind:value={message}></textarea>
		</div>
		{#if confirm === 'start'}
			<div class="row">
				<span>Give everyone Pro for {days} day{days === '1' ? '' : 's'} and show the banner?</span>
				<button class="btn" onclick={() => (confirm = null)}>Cancel</button>
				<button class="btn primary" disabled={busy} onclick={() => { const c = check(); if (c) void run(() => promo.start(c.d, c.m)); }}>Start promo</button>
			</div>
		{:else}
			<button class="btn primary" onclick={() => check() && (confirm = 'start')}>Give everyone Pro</button>
		{/if}
	{/if}
	{#if err}<p class="err">{err}</p>{/if}
</section>

{#if rows.length}
	<section class="card promo">
		<h3>All promos</h3>
		<ul class="list">
			{#each rows as r (r.id)}
				<li>
					<div class="ltext">
						<strong>{r.active ? 'Running' : new Date(r.endsAt).getTime() > Date.now() ? 'Scheduled' : 'Ended'}</strong>
						<span class="muted small">{fmt(r.startsAt)} → {fmt(r.endsAt)}</span>
						<span class="small">{r.message}</span>
					</div>
					{#if confirmDelete === r.id}
						<div class="row">
							<span>{r.active ? 'Delete it? It ends now — everyone goes back to their own plan and the banner disappears.' : 'Delete this promo?'}</span>
							<button class="btn" onclick={() => (confirmDelete = null)}>Cancel</button>
							<button class="btn danger" disabled={busy} onclick={() => run(() => promo.remove(r.id))}>Delete</button>
						</div>
					{:else}
						<button class="btn danger" onclick={() => (confirmDelete = r.id)}>Delete</button>
					{/if}
				</li>
			{/each}
		</ul>
	</section>
{/if}

<style>
	.promo {
		display: flex;
		flex-direction: column;
		gap: 10px;
		align-items: flex-start;
	}
	h3 {
		margin: 0;
	}
	p {
		margin: 0;
	}
	.msg {
		white-space: pre-wrap;
		background: var(--surface-2);
		padding: 10px 12px;
		border-radius: var(--radius-sm);
		width: 100%;
	}
	.field {
		width: 100%;
	}
	textarea {
		width: 100%;
		padding: 10px 12px;
		border-radius: var(--radius-sm);
		border: 1px solid var(--line);
		background: var(--surface);
		font: inherit;
		font-size: 16px;
		color: inherit;
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		align-items: center;
		font-size: 14px;
	}
	.small {
		font-size: 13px;
	}
	.promo + .promo {
		margin-top: 14px;
	}
	.list {
		list-style: none;
		margin: 0;
		padding: 0;
		width: 100%;
	}
	.list li {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		padding: 10px 0;
	}
	.list li + li {
		border-top: 1px solid var(--line);
	}
	.ltext {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
		flex: 1;
		white-space: pre-wrap;
	}
	.err {
		color: #b5483a;
		font-size: 13px;
	}
	.btn.danger {
		color: #b5483a;
	}
</style>
