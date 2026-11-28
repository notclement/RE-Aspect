<script lang="ts">
	/**
	 * Admin → AI keys. Keys are sent once to an admin-only server function that stores them in
	 * Supabase Vault (encrypted). The browser only ever sees provider, label and the last 4 characters.
	 * Claude is required: wall tracing and north detection always use the Claude key (the active one if several).
	 * "Check key" sends Claude a one-word test; spend comes from our own log of every AI call (Anthropic has no
	 * balance API for individual organisations, so the balance itself is a link to the Console).
	 */
	import { onMount } from 'svelte';
	import Icon from './Icon.svelte';
	import Spinner from './Spinner.svelte';
	import { getSupabase } from '#lib/supabase.ts';
	import { validateFreeText } from '#lib/validate.ts';

	const PROVIDERS = [
		{ id: 'openai', label: 'OpenAI' },
		{ id: 'anthropic', label: 'Anthropic (Claude)' },
		{ id: 'google', label: 'Google Gemini' },
		{ id: 'deepseek', label: 'DeepSeek' },
		{ id: 'other', label: 'Other' }
	] as const;
	type ProviderId = (typeof PROVIDERS)[number]['id'];
	const providerLabel = (id: string) => PROVIDERS.find((p) => p.id === id)?.label ?? id;

	interface KeyRow {
		id: string;
		provider: ProviderId;
		label: string;
		last4: string;
		active: boolean;
		created_at: string;
	}

	let keys = $state<KeyRow[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let adding = $state(false);
	let provider = $state<ProviderId>('anthropic');
	let label = $state('');
	let secret = $state('');
	let formError = $state<string | null>(null);
	let busy = $state(false);
	let confirmDelete = $state<string | null>(null);

	async function load() {
		loading = true;
		error = null;
		try {
			const sb = await getSupabase();
			const { data, error: e } = await sb.rpc('admin_list_ai_keys');
			if (e) throw e;
			keys = (data ?? []) as KeyRow[];
		} catch (e) {
			error = e instanceof Error ? e.message : 'Could not load keys.';
		}
		loading = false;
	}

	async function add(e: SubmitEvent) {
		e.preventDefault();
		formError = null;
		const l = validateFreeText(label, { max: 40, label: 'Name' });
		const k = secret.trim();
		if (!l.ok) return void (formError = l.error);
		if (!l.value) return void (formError = 'Give the key a name, e.g. "Main OpenAI".');
		if (!/^\S{20,400}$/.test(k)) return void (formError = "That doesn't look like an API key.");
		if (!PROVIDERS.some((p) => p.id === provider)) return void (formError = 'Choose a provider.');
		busy = true;
		try {
			const sb = await getSupabase();
			const { error: e2 } = await sb.rpc('admin_add_ai_key', { p_provider: provider, p_label: l.value, p_key: k });
			if (e2) throw e2;
			secret = '';
			label = '';
			adding = false;
			await load();
		} catch (err) {
			formError = err instanceof Error ? err.message : 'Could not save the key.';
		}
		secret = '';
		busy = false;
	}

	async function use(id: string) {
		busy = true;
		try {
			const sb = await getSupabase();
			const { error: e } = await sb.rpc('admin_set_active_ai_key', { p_id: id });
			if (e) throw e;
			keys = keys.map((k) => ({ ...k, active: k.id === id }));
		} catch (err) {
			error = err instanceof Error ? err.message : 'Could not switch key.';
		}
		busy = false;
	}

	async function remove(id: string) {
		busy = true;
		confirmDelete = null;
		try {
			const sb = await getSupabase();
			const { error: e } = await sb.rpc('admin_delete_ai_key', { p_id: id });
			if (e) throw e;
			await load();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Could not delete the key.';
		}
		busy = false;
	}

	// The Claude key the server uses: the active Claude key, else the newest one (same rule as ai_key_for).
	const claudeInUse = $derived(
		keys.filter((k) => k.provider === 'anthropic').sort((a, b) => Number(b.active) - Number(a.active) || b.created_at.localeCompare(a.created_at))[0]?.id ?? null
	);

	// Any key can be tested; the dropdown starts on the Claude key in use.
	let checkId = $state<string | null>(null);
	const checkKeyId = $derived(checkId ?? claudeInUse ?? keys[0]?.id ?? null);
	const BILLING: Record<string, string> = {
		anthropic: 'https://platform.claude.com/settings/billing',
		openai: 'https://platform.openai.com/settings/organization/billing/overview',
		deepseek: 'https://platform.deepseek.com/top_up',
		google: 'https://aistudio.google.com/usage'
	};
	let check = $state<{ status: string; message: string; provider?: string; balance?: string } | null>(null);
	let checking = $state(false);
	async function checkKey() {
		checking = true;
		check = null;
		try {
			const sb = await getSupabase();
			const { data, error: e } = await sb.functions.invoke('ai-key-check', { body: checkKeyId ? { id: checkKeyId } : {} });
			if (e) throw e;
			check = data as { status: string; message: string; provider?: string; balance?: string };
			loadUsage();
		} catch {
			check = { status: 'error', message: 'Could not run the check.' };
		}
		checking = false;
	}

	interface UsageRow {
		fn: string;
		period: string;
		calls: number;
		usd: number;
		avg_ms: number | null;
	}
	let usage = $state<UsageRow[]>([]);
	async function loadUsage() {
		try {
			const sb = await getSupabase();
			const { data } = await sb.rpc('admin_ai_usage_summary');
			usage = (data ?? []) as UsageRow[];
		} catch {
			usage = [];
		}
	}
	const PERIODS = [
		['today', 'Today'],
		['7d', '7 days'],
		['month', 'This month']
	] as const;
	const FN_LABEL: Record<string, string> = { 'detect-north': 'North checks', 'process-project': 'Wall tracing', 'key-check': 'Key checks' };
	const total = (p: string) => usage.filter((u) => u.period === p).reduce((a, u) => a + Number(u.usd), 0);
	const usd = (n: number) => (n < 0.01 && n > 0 ? '< US$0.01' : `US$${n.toFixed(2)}`);

	onMount(() => {
		load();
		loadUsage();
	});
</script>

<section class="card claude">
	<div class="head">
		<strong>Key check</strong>
	</div>
	<p class="muted small">Wall tracing and north detection always use your Claude key.</p>
	<div class="checkrow">
		<label class="sr-only" for="k-check">Key to check</label>
		<select id="k-check" value={checkKeyId} onchange={(e) => ((checkId = e.currentTarget.value), (check = null))} disabled={!keys.length}>
			{#each keys as k (k.id)}<option value={k.id}>{k.label} · {providerLabel(k.provider)}{k.id === claudeInUse ? ' · in use' : ''}</option>{/each}
		</select>
		<button class="btn" onclick={checkKey} disabled={checking || !checkKeyId}>{#if checking}<Spinner size={16} /> Checking…{:else}Check key{/if}</button>
	</div>
	{#if check}
		<div class="status {check.status}" role="status">
			<span>{check.message}</span>
			{#if check.provider}
				<span class="bal">
					Balance: {#if check.balance}<strong>{check.balance}</strong>{:else}not shared by {providerLabel(check.provider)}{/if}
					{#if BILLING[check.provider]} · <a href={BILLING[check.provider]} target="_blank" rel="noopener">Billing ↗</a>{/if}
				</span>
			{/if}
		</div>
	{/if}
	<table class="spend">
		<thead><tr><th>Spend</th>{#each PERIODS as [, l] (l)}<th>{l}</th>{/each}</tr></thead>
		<tbody>
			{#each Object.keys(FN_LABEL) as fn (fn)}
				{#if usage.some((u) => u.fn === fn)}
					<tr>
						<td>{FN_LABEL[fn]}</td>
						{#each PERIODS as [p] (p)}
							{@const r = usage.find((u) => u.fn === fn && u.period === p)}
							<td>{r ? `${usd(Number(r.usd))} · ${r.calls}` : '—'}</td>
						{/each}
					</tr>
				{/if}
			{/each}
			<tr class="sum"><td>Total</td>{#each PERIODS as [p] (p)}<td>{usd(total(p))}</td>{/each}</tr>
		</tbody>
	</table>
	<p class="muted small">From RE:Aspect's own log (US$ · calls). Remaining balance: <a href="https://platform.claude.com/settings/billing" target="_blank" rel="noopener">Claude Console ↗</a></p>
</section>

<section class="card">
	<div class="head">
		<strong>AI API keys</strong>
		{#if !adding}<button class="btn" onclick={() => (adding = true)}><Icon name="plus" size={18} /> Add key</button>{/if}
	</div>
	<p class="muted small">
		Keys are encrypted in Supabase Vault and can't be read back — only the last 4 characters are shown. The AI
		features use the Claude key marked <strong>In use</strong>; other providers' keys are kept but not used.
	</p>

	{#if adding}
		<form class="add" onsubmit={add} novalidate autocomplete="off">
			<div class="field">
				<label for="k-prov">Provider</label>
				<select id="k-prov" bind:value={provider}>
					{#each PROVIDERS as p (p.id)}<option value={p.id}>{p.label}</option>{/each}
				</select>
			</div>
			<div class="field">
				<label for="k-name">Name</label>
				<input id="k-name" maxlength="40" placeholder="Type here…" bind:value={label} />
			</div>
			<div class="field">
				<label for="k-key">API key</label>
				<input id="k-key" type="password" placeholder="Paste key here…" autocomplete="new-password" spellcheck="false" maxlength="400" bind:value={secret} />
			</div>
			{#if formError}<p class="error small">{formError}</p>{/if}
			<div class="actions">
				<button type="button" class="btn" onclick={() => ((adding = false), (secret = ''), (formError = null))}>Cancel</button>
				<button type="submit" class="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Save key'}</button>
			</div>
		</form>
	{/if}

	{#if loading}
		<div class="center"><Spinner size={18} /></div>
	{:else if error}
		<p class="error small">{error}</p>
	{:else if keys.length === 0}
		<p class="muted small empty">No keys yet. Add one to switch on the AI features.</p>
	{:else}
		<ul class="keys">
			{#each keys as k (k.id)}
				<li class:active={k.id === claudeInUse}>
					<span class="ic"><Icon name="key" size={18} /></span>
					<span class="info">
						<strong>{k.label}</strong>
						<span class="muted small">{providerLabel(k.provider)} · ••••{k.last4}</span>
					</span>
					{#if confirmDelete === k.id}
						<span class="row-actions">
							<button class="btn" onclick={() => (confirmDelete = null)}>Keep</button>
							<button class="btn danger" onclick={() => remove(k.id)} disabled={busy}>Delete</button>
						</span>
					{:else}
						<span class="row-actions">
							{#if k.id === claudeInUse}<span class="tag on">In use</span>{:else if k.provider === 'anthropic'}<button class="btn" onclick={() => use(k.id)} disabled={busy}>Use this</button>{:else}<span class="tag" title="Tracing and north detection need Claude">Not used</span>{/if}
							<button class="btn icon" title="Delete {k.label}" aria-label="Delete {k.label}" onclick={() => (confirmDelete = k.id)}><Icon name="trash" size={18} /></button>
						</span>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</section>

<style>
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		margin-bottom: 6px;
	}
	.small {
		font-size: 12px;
	}
	.error {
		color: #b5483a;
	}
	.add {
		margin: 12px 0;
		padding: 12px;
		border: 1px dashed var(--line);
		border-radius: var(--radius-sm);
	}
	select {
		min-height: 44px;
		padding: 0 10px;
		border-radius: var(--radius-sm);
		border: 1px solid var(--line);
		background: var(--surface);
		font-size: 16px;
	}
	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
	}
	.center {
		display: grid;
		place-items: center;
		padding: 16px;
	}
	.empty {
		margin-top: 12px;
	}
	.keys {
		list-style: none;
		margin: 12px 0 0;
		padding: 0;
	}
	.keys li {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 10px 0;
		border-top: 1px solid var(--line);
	}
	.ic {
		width: 36px;
		height: 36px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		background: var(--surface-2);
		color: var(--muted);
		flex-shrink: 0;
	}
	.active .ic {
		background: var(--ochre-soft);
		color: var(--ochre-ink);
	}
	.info {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}
	.row-actions {
		display: flex;
		gap: 6px;
		align-items: center;
	}
	.btn.icon {
		padding: 0;
		width: 44px;
	}
	.claude {
		margin-bottom: 12px;
	}
	.checkrow {
		display: flex;
		gap: 8px;
		margin-top: 8px;
	}
	.checkrow select {
		flex: 1;
		min-width: 0;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
	}
	.status .bal {
		display: block;
		margin-top: 2px;
		font-size: 13px;
		opacity: 0.9;
	}
	.status a {
		color: inherit;
	}
	.status {
		margin: 8px 0 4px;
		padding: 8px 10px;
		border-radius: var(--radius-sm);
		font-size: 14px;
		background: var(--surface-2);
	}
	.status.ok {
		background: color-mix(in srgb, #2f9e5b 14%, transparent);
		color: #2a8a50;
	}
	.status.no-credit,
	.status.invalid,
	.status.no-key {
		background: color-mix(in srgb, #b5483a 12%, transparent);
		color: #b5483a;
	}
	.spend {
		width: 100%;
		margin: 10px 0 4px;
		border-collapse: collapse;
		font-size: 13px;
		font-variant-numeric: tabular-nums;
	}
	.spend th,
	.spend td {
		padding: 6px 4px;
		text-align: right;
		border-top: 1px solid var(--line);
		white-space: nowrap;
	}
	.spend th:first-child,
	.spend td:first-child {
		text-align: left;
	}
	.spend th {
		color: var(--muted);
		font-weight: 600;
		border-top: 0;
	}
	.spend .sum td {
		font-weight: 700;
	}
	.tag.on {
		background: color-mix(in srgb, #2f9e5b 16%, transparent);
		color: #2a8a50;
	}
</style>
