<script lang="ts">
	/**
	 * Admin → AI keys. Keys are sent once to an admin-only server function that stores them in
	 * Supabase Vault (encrypted). The browser only ever sees provider, label and the last 4 characters.
	 * The active key is what the AI edge functions use.
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
	let provider = $state<ProviderId>('openai');
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

	onMount(load);
</script>

<section class="card">
	<div class="head">
		<strong>AI API keys</strong>
		{#if !adding}<button class="btn" onclick={() => (adding = true)}><Icon name="plus" size={18} /> Add key</button>{/if}
	</div>
	<p class="muted small">
		Keys are encrypted in Supabase Vault and can't be read back — only the last 4 characters are shown. The
		<strong>active</strong> key is the one the AI features use.
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
				<input id="k-name" maxlength="40" placeholder="e.g. Main OpenAI" bind:value={label} />
			</div>
			<div class="field">
				<label for="k-key">API key</label>
				<input id="k-key" type="password" autocomplete="new-password" spellcheck="false" maxlength="400" bind:value={secret} />
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
				<li class:active={k.active}>
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
							{#if k.active}<span class="tag on">Active</span>{:else}<button class="btn" onclick={() => use(k.id)} disabled={busy}>Use this</button>{/if}
							<button class="btn icon" aria-label="Delete {k.label}" onclick={() => (confirmDelete = k.id)}><Icon name="trash" size={18} /></button>
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
		color: var(--ochre);
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
	.tag.on {
		background: color-mix(in srgb, #2f9e5b 16%, transparent);
		color: #2a8a50;
	}
</style>
