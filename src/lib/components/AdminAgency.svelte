<script lang="ts" module>
	export interface AgencyRow {
		member: string;
		agency: string;
		agency_name: string;
		role: 'lead' | 'member';
		status: 'pending' | 'active';
		seats: number;
		members: number;
		pool: number;
		used: number;
	}
</script>

<script lang="ts">
	/** Admin: make a user an Agency Lead (name + paid seats), change seats, or remove the agency. Server re-checks everything. */
	import { getSupabase } from '#lib/supabase.ts';
	import { validateCompanyName, validateNumber } from '#lib/validate.ts';
	import { agencyUnitPool } from '#lib/config/plans.ts';

	let { userId, userName, row, onchange }: { userId: string; userName: string; row: AgencyRow | undefined; onchange: () => void } = $props();

	let editing = $state(false);
	let name = $state('');
	let seats = $state('10');
	let err = $state<string | null>(null);
	let busy = $state(false);
	let confirmRemove = $state(false);
	const preview = $derived.by(() => {
		const s = validateNumber(seats, { min: 1, max: 500, label: 'Seats', decimals: 0 });
		return s.ok ? `${s.value + 1} members (incl. lead) · ${agencyUnitPool(s.value)} shared projects` : '';
	});

	function start() {
		name = row?.agency_name ?? '';
		seats = String(row?.seats ?? 10);
		err = null;
		editing = true;
	}
	async function call(p_name: string | null, p_seats: number | null) {
		busy = true;
		err = null;
		try {
			const sb = await getSupabase();
			const { error } = await sb.rpc('admin_set_agency', { target: userId, p_name, p_seats });
			if (error) throw error;
			editing = false;
			confirmRemove = false;
			onchange();
		} catch (e) {
			err = e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : 'Could not update.';
		}
		busy = false;
	}
	function save(e: SubmitEvent) {
		e.preventDefault();
		const n = validateCompanyName(name);
		const s = validateNumber(seats, { min: 1, max: 500, label: 'Seats', decimals: 0 });
		if (!n.ok) return void (err = n.error);
		if (!s.ok) return void (err = s.error);
		void call(n.value, s.value);
	}
</script>

{#if row && row.role === 'member'}
	<p class="muted small">{row.status === 'pending' ? 'Asked to join' : 'Member of'} <strong>{row.agency_name}</strong>. Their lead manages membership.</p>
{:else if editing}
	<form class="agf" onsubmit={save} novalidate>
		<div class="field"><label for="agn-{userId}">Agency name</label><input id="agn-{userId}" maxlength="60" bind:value={name} placeholder="Type here…" /></div>
		<div class="field"><label for="ags-{userId}">Paid seats</label><input id="ags-{userId}" inputmode="numeric" maxlength="3" placeholder="Type here…" bind:value={seats} /></div>
		{#if preview}<p class="muted small">{preview}</p>{/if}
		{#if err}<p class="err small">{err}</p>{/if}
		<div class="row">
			<button type="button" class="btn" onclick={() => (editing = false)}>Cancel</button>
			<button class="btn primary" disabled={busy}>{row ? 'Save' : `Make ${userName} an Agency Lead`}</button>
		</div>
	</form>
{:else if row}
	<p class="small"><strong>Lead of {row.agency_name}</strong><br /><span class="muted">{row.seats} paid seats · {row.members} of {row.seats + 1} members · {row.used} of {row.pool} shared projects</span></p>
	{#if confirmRemove}
		<div class="confirm">
			<span>Remove {row.agency_name}? All members are detached and get their own plans back; projects stay with whoever owns them now.</span>
			<button class="btn" onclick={() => (confirmRemove = false)}>Cancel</button>
			<button class="btn danger" disabled={busy} onclick={() => call(null, null)}>Remove agency</button>
		</div>
	{:else}
		<div class="row">
			<button class="btn" onclick={start}>Change name / seats</button>
			<button class="btn danger" onclick={() => (confirmRemove = true)}>Remove agency</button>
		</div>
	{/if}
	{#if err}<p class="err small">{err}</p>{/if}
{:else}
	<button class="btn" onclick={start}>Make Agency Lead</button>
	<p class="muted small">They get a "My agency" page to invite agents with a QR code and share one project pool.</p>
{/if}

<style>
	.agf {
		display: flex;
		flex-direction: column;
		gap: 8px;
		max-width: 420px;
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.confirm {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		font-size: 14px;
	}
	.small {
		font-size: 13px;
		margin: 4px 0;
	}
	.err {
		color: #b5483a;
	}
	.btn.danger {
		color: #b5483a;
	}
</style>
