<script lang="ts">
	/** Admin: "Contact us for agency rates" enquiries. */
	import { onMount } from 'svelte';
	import { getSupabase } from '#lib/supabase.ts';
	import Spinner from './Spinner.svelte';

	interface Enquiry {
		id: string;
		name: string;
		email: string;
		company: string;
		team_size: number;
		phone: string;
		message: string;
		handled: boolean;
		created_at: string;
	}
	let rows = $state<Enquiry[] | null>(null);
	let error = $state<string | null>(null);

	async function load() {
		try {
			const sb = await getSupabase();
			const { data, error: e } = await sb.rpc('admin_list_enquiries');
			if (e) throw e;
			rows = (data ?? []) as Enquiry[];
		} catch (e) {
			error = e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : 'Could not load enquiries.';
		}
	}
	async function setHandled(r: Enquiry, value: boolean) {
		try {
			const sb = await getSupabase();
			const { error: e } = await sb.rpc('admin_set_enquiry_handled', { p_id: r.id, value });
			if (e) throw e;
			rows = rows!.map((x) => (x.id === r.id ? { ...x, handled: value } : x));
		} catch {
			/* ignore — list stays as is */
		}
	}
	onMount(load);
	const fmt = (s: string) => new Date(s).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' });
</script>

{#if error}
	<div class="card">{error}</div>
{:else if !rows}
	<div class="card center"><Spinner /></div>
{:else if !rows.length}
	<div class="card muted">No agency enquiries yet. They come from Plans → Agency → Contact us.</div>
{:else}
	<ul class="list">
		{#each rows as r (r.id)}
			<li class="card" class:done={r.handled}>
				<div class="top">
					<strong>{r.company}</strong>
					<span class="muted small">{fmt(r.created_at)}</span>
				</div>
				<p class="small">{r.name || '(no name)'} · <a href="mailto:{r.email}">{r.email}</a>{r.phone ? ` · ${r.phone}` : ''} · team of {r.team_size}</p>
				{#if r.message}<p class="msg">{r.message}</p>{/if}
				<button class="btn" onclick={() => setHandled(r, !r.handled)}>{r.handled ? 'Mark as open' : 'Mark as handled'}</button>
			</li>
		{/each}
	</ul>
{/if}

<style>
	.list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.done {
		opacity: 0.6;
	}
	.top {
		display: flex;
		justify-content: space-between;
		gap: 8px;
	}
	.small {
		font-size: 13px;
		margin: 4px 0;
	}
	.msg {
		white-space: pre-wrap;
		font-size: 14px;
		background: var(--surface-2);
		padding: 8px 10px;
		border-radius: var(--radius-sm);
	}
	.center {
		display: grid;
		place-items: center;
	}
</style>
