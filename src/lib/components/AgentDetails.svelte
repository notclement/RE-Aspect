<script lang="ts">
	/** Profile card: full name and CEA number, shown to clients on shared pages (migration 0020). */
	import { profile } from '#lib/stores/profile.svelte.ts';
	import { auth } from '#lib/stores/auth.svelte.ts';
	import { validateFullName, validateCeaNo } from '#lib/validate.ts';
	import Icon from '#lib/components/Icon.svelte';

	let editing = $state(false);
	let fullName = $state('');
	let ceaNo = $state('');
	let errors = $state<Record<string, string>>({});
	let busy = $state(false);

	function start() {
		fullName = profile.data.fullName || profile.data.name;
		ceaNo = profile.data.ceaNo;
		errors = {};
		editing = true;
	}
	async function save(e: SubmitEvent) {
		e.preventDefault();
		const f = validateFullName(fullName);
		const c = validateCeaNo(ceaNo);
		errors = { ...(f.ok ? {} : { fullName: f.error }), ...(c.ok ? {} : { ceaNo: c.error }) };
		if (!f.ok || !c.ok) return;
		busy = true;
		try {
			await auth.saveAgentInfo(f.value, c.value);
			editing = false;
		} catch (err) {
			errors = { form: err instanceof Error ? err.message : 'Could not save.' };
		}
		busy = false;
	}
</script>

{#if auth.status === 'signed-in'}
	<section class="card agent" aria-label="Shown to clients">
		<div class="top">
			<strong>Shown to clients</strong>
			{#if !editing}<button class="ib" onclick={start} title="Edit full name and CEA number" aria-label="Edit full name and CEA number"><Icon name="pencil" size={18} /></button>{/if}
		</div>
		{#if editing}
			<form onsubmit={save} novalidate>
				<div class="field">
					<label for="ag-full">Full name (as registered with CEA)</label>
					<input id="ag-full" autocomplete="name" maxlength="80" bind:value={fullName} placeholder="Type here…" />
					{#if errors.fullName}<span class="error">{errors.fullName}</span>{/if}
				</div>
				<div class="field">
					<label for="ag-cea">CEA registration number</label>
					<input id="ag-cea" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="12" bind:value={ceaNo} placeholder="e.g. R123456A" />
					{#if errors.ceaNo}<span class="error">{errors.ceaNo}</span>{/if}
				</div>
				{#if errors.form}<p class="error">{errors.form}</p>{/if}
				<div class="btns">
					<button type="button" class="btn" onclick={() => (editing = false)}>Cancel</button>
					<button class="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
				</div>
			</form>
		{:else}
			<p class="line">Sent by <b>{profile.data.fullName || '—'}</b>{#if profile.data.ceaNo}<span class="muted"> · CEA {profile.data.ceaNo}</span>{/if}</p>
			<p class="muted small">This line appears on every page you share.</p>
		{/if}
	</section>
{/if}

<style>
	.agent {
		margin-top: 14px;
	}
	.top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		min-height: 44px;
	}
	.ib {
		width: 44px;
		height: 44px;
		display: grid;
		place-items: center;
		border: 0;
		background: none;
		color: var(--muted);
		cursor: pointer;
		border-radius: 50%;
	}
	.line {
		margin: 4px 0;
	}
	.small {
		font-size: 13px;
		margin: 0;
	}
	.btns {
		display: flex;
		gap: 8px;
		justify-content: flex-end;
	}
	.error {
		color: #b5483a;
	}
</style>
