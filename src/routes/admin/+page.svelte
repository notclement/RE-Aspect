<script lang="ts">
	/**
	 * Admin panel: every user, their projects, and Pro grants (1 month / lifetime / remove).
	 * All data comes from admin-only server functions (migration 0003) — the server checks is_admin,
	 * so this page being reachable grants nothing on its own.
	 */
	import { onMount } from 'svelte';
	import Icon from '#lib/components/Icon.svelte';
	import Spinner from '#lib/components/Spinner.svelte';
	import { nav } from '#lib/stores/nav.svelte.ts';
	import { profile } from '#lib/stores/profile.svelte.ts';
	import { auth } from '#lib/stores/auth.svelte.ts';
	import { getSupabase, supabaseConfigured } from '#lib/supabase.ts';
	import { propertyTypeLabel } from '#lib/config/property-types.ts';
	import { SAMPLE_UNITS } from '#lib/sample-unit.ts';
	import Avatar from '#lib/components/Avatar.svelte';
	import AdminAiKeys from '#lib/components/AdminAiKeys.svelte';
	import AdminAgency, { type AgencyRow } from '#lib/components/AdminAgency.svelte';
	import AdminEnquiries from '#lib/components/AdminEnquiries.svelte';
	import AdminPromo from '#lib/components/AdminPromo.svelte';
	import { ROLE_LABELS, type RoleView } from '#lib/stores/profile.svelte.ts';

	const roleList = Object.entries(ROLE_LABELS) as [RoleView, string][];
	let tab = $state<'users' | 'ai' | 'enquiries' | 'promo'>('users');
	type Filter = 'all' | 'pro' | 'agency' | 'free' | 'full' | 'disabled';
	const FILTERS: { id: Filter; label: string }[] = [
		{ id: 'all', label: 'All' },
		{ id: 'pro', label: 'Pro' },
		{ id: 'agency', label: 'Agency' },
		{ id: 'free', label: 'Free' },
		{ id: 'full', label: 'Full' },
		{ id: 'disabled', label: 'Disabled' }
	];
	let filter = $state<Filter>('all');
	let me = $state<string | null>(null);

	$effect(() => nav.set({ label: 'Admin' }));

	interface UserRow {
		id: string;
		email: string;
		name: string;
		avatar: string | null;
		disabled: boolean;
		plan: 'free' | 'pro' | 'agency';
		pro_until: string | null;
		is_admin: boolean;
		created_at: string;
		last_sign_in_at: string | null;
		project_count: number;
	}
	interface ProjectRow {
		id: string;
		demo_key: string | null;
		name: string;
		unit_no: string;
		address: string;
		property_type: string;
		updated_at: string;
	}
	type Grant = { months: number | null; label: string };
	const GRANTS: Grant[] = [
		{ months: 1, label: 'Pro · 1 month' },
		{ months: null, label: 'Pro · lifetime' },
		{ months: 0, label: 'Remove Pro' }
	];

	let users = $state<UserRow[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let q = $state('');
	let open = $state<string | null>(null);
	let projects = $state<Record<string, ProjectRow[] | 'loading' | { error: string }>>({});
	let confirm = $state<{ id: string; grant: Grant } | null>(null);
	let confirmDisable = $state<string | null>(null);
	let busy = $state<string | null>(null);
	let toast = $state<string | null>(null);

	const inFilter = (u: UserRow, f: Filter) =>
		f === 'full'
			? true
			: f === 'disabled'
				? u.disabled
				: !u.disabled && (f === 'all' || (f === 'agency' ? !!agencies[u.id] : status(u).kind === f && !(f === 'free' && agencies[u.id]?.status === 'active')));
	const counts = $derived(Object.fromEntries(FILTERS.map((f) => [f.id, users.filter((u) => inFilter(u, f.id)).length])) as Record<Filter, number>);
	// Live search — filters as you type, no button needed.
	const filtered = $derived.by(() => {
		const t = q.trim().toLowerCase();
		return users.filter(
			(u) => inFilter(u, filter) && (!t || u.name.toLowerCase().includes(t) || u.email.toLowerCase().includes(t))
		);
	});
	const stats = $derived({
		users: counts.all,
		pro: users.filter((u) => !u.disabled && status(u).kind === 'pro').length,
		projects: users.reduce((n, u) => n + Number(u.project_count), 0)
	});

	const fmtDate = (s: string | null) =>
		s ? new Date(s).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

	function status(u: UserRow): { kind: 'free' | 'pro' | 'agency'; label: string } {
		if (u.plan === 'agency') return { kind: 'agency', label: 'Agency' };
		if (u.plan === 'pro') {
			if (u.pro_until === 'infinity') return { kind: 'pro', label: 'Pro · lifetime' };
			if (!u.pro_until) return { kind: 'pro', label: 'Pro' };
			if (new Date(u.pro_until).getTime() > Date.now()) return { kind: 'pro', label: `Pro until ${fmtDate(u.pro_until)}` };
			return { kind: 'free', label: `Free · Pro ended ${fmtDate(u.pro_until)}` };
		}
		return { kind: 'free', label: 'Free' };
	}

	async function load() {
		loading = true;
		error = null;
		try {
			const sb = await getSupabase();
			const { data, error: e } = await sb.rpc('admin_list_users');
			if (e) throw e;
			users = (data ?? []) as UserRow[];
			await loadAgencies();
			const { data: s2 } = await sb.auth.getSession();
			me = s2.session?.user.id ?? null;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Could not load users.';
		}
		loading = false;
	}

	let agencies = $state<Record<string, AgencyRow>>({});
	async function loadAgencies() {
		try {
			const sb = await getSupabase();
			const { data, error: e } = await sb.rpc('admin_agencies');
			if (e) throw e;
			agencies = Object.fromEntries(((data ?? []) as AgencyRow[]).map((r) => [r.member, r]));
		} catch (e) {
			console.warn('[admin] agencies', e);
		}
	}

	async function toggle(u: UserRow) {
		open = open === u.id ? null : u.id;
		confirm = null;
		confirmDisable = null;
		if (open && !Array.isArray(projects[u.id])) {
			projects[u.id] = 'loading';
			try {
				const sb = await getSupabase();
				const { data, error: e } = await sb.rpc('admin_list_projects', { target: u.id });
				if (e) throw e;
				projects[u.id] = (data ?? []) as ProjectRow[];
			} catch (e) {
				projects[u.id] = { error: e instanceof Error ? e.message : 'Could not load projects.' };
			}
		}
	}

	async function grant(u: UserRow, g: Grant) {
		busy = u.id;
		confirm = null;
		try {
			const sb = await getSupabase();
			const { data, error: e } = await sb.rpc('admin_grant_pro', { target: u.id, months: g.months });
			if (e) throw e;
			const row = (Array.isArray(data) ? data[0] : data) as { plan: UserRow['plan']; pro_until: string | null } | undefined;
			if (row) users = users.map((x) => (x.id === u.id ? { ...x, plan: row.plan, pro_until: row.pro_until } : x));
			toast = `${u.name || u.email}: ${g.months === 0 ? 'Pro removed' : g.label.replace('Pro · ', 'Pro granted — ')}`;
			setTimeout(() => (toast = null), 2600);
		} catch (e) {
			toast = e instanceof Error ? e.message : 'Could not update.';
			setTimeout(() => (toast = null), 3500);
		}
		busy = null;
	}

	async function setDisabled(u: UserRow, value: boolean) {
		busy = u.id;
		confirmDisable = null;
		try {
			const sb = await getSupabase();
			const { error: e } = await sb.rpc('admin_set_disabled', { target: u.id, value });
			if (e) throw e;
			users = users.map((x) => (x.id === u.id ? { ...x, disabled: value } : x));
			toast = `${u.name || u.email} ${value ? 'disabled' : 're-enabled'}`;
			setTimeout(() => (toast = null), 2600);
		} catch (e) {
			toast = e instanceof Error ? e.message : 'Could not update.';
			setTimeout(() => (toast = null), 3500);
		}
		busy = null;
	}

	const demoName = (k: string | null) => SAMPLE_UNITS.find((u) => u.id === k)?.name;

	onMount(() => {
		if (supabaseConfigured && profile.data.isAdmin) void load();
		else loading = false;
	});
</script>

<svelte:head><title>Admin · RE:Aspect</title></svelte:head>

<h1>Admin</h1>

{#if !profile.data.isAdmin}
	<div class="card empty"><Icon name="lock" /> Admins only.</div>
{:else if !supabaseConfigured || auth.status === 'preview'}
	<div class="card empty">The admin panel needs the backend — it isn't available in preview mode.</div>
{:else}
	<section class="card viewas">
		<div class="va-head"><Icon name="shield" size={18} /><strong>View the app as</strong><span class="muted">now: {ROLE_LABELS[profile.role]}</span></div>
		<div class="chips" role="radiogroup" aria-label="View the app as">
			{#each roleList as [id, label] (id)}
				<button role="radio" aria-checked={profile.role === id} class:on={profile.role === id} onclick={() => profile.setViewAs(id === 'admin' ? null : id)}>{label}</button>
			{/each}
		</div>
		<p class="muted small">Preview only — changes what you see (limits, menus, badges). The server still enforces every permission.</p>
	</section>

	<div class="seg" role="tablist">
		<button role="tab" aria-selected={tab === 'users'} class:on={tab === 'users'} onclick={() => (tab = 'users')}><Icon name="user" size={18} />Users</button>
		<button role="tab" aria-selected={tab === 'enquiries'} class:on={tab === 'enquiries'} onclick={() => (tab = 'enquiries')}><Icon name="users" size={18} />Enquiries</button>
		<button role="tab" aria-selected={tab === 'promo'} class:on={tab === 'promo'} onclick={() => (tab = 'promo')}><Icon name="gift" size={18} />Promo</button>
		<button role="tab" aria-selected={tab === 'ai'} class:on={tab === 'ai'} onclick={() => (tab = 'ai')}><Icon name="key" size={18} />AI keys</button>
	</div>

	{#if tab === 'ai'}
		<AdminAiKeys />
	{:else if tab === 'enquiries'}
		<AdminEnquiries />
	{:else if tab === 'promo'}
		<AdminPromo />
	{:else}
	<div class="stats">
		<div class="card"><span class="muted">Users</span><strong>{stats.users}</strong></div>
		<div class="card"><span class="muted">On Pro</span><strong>{stats.pro}</strong></div>
		<div class="card"><span class="muted">All projects</span><strong>{stats.projects}</strong></div>
	</div>

	<input class="search" type="search" placeholder="Search…" bind:value={q} aria-label="Search users" maxlength="80" />
	<div class="filters" role="radiogroup" aria-label="Filter users">
		{#each FILTERS as f (f.id)}
			<button role="radio" aria-checked={filter === f.id} class:on={filter === f.id} onclick={() => (filter = f.id)}>{f.label} <span>{counts[f.id]}</span></button>
		{/each}
	</div>

	{#if loading}
		<div class="center"><Spinner /></div>
	{:else if error}
		<div class="card empty err">{error}</div>
	{:else if filtered.length === 0}
		<div class="card empty">No users match.</div>
	{:else}
		<ul class="users">
			{#each filtered as u (u.id)}
				{@const st = status(u)}
				{@const ps = projects[u.id]}
				<li class="card user" class:open={open === u.id}>
					<button class="row" onclick={() => toggle(u)} aria-expanded={open === u.id}>
						<Avatar size={42} src={u.avatar} name={u.name || u.email} />
						<span class="who">
							<strong>{u.name || '(no name)'}</strong>
							<span class="muted">{u.email}</span>
							<span class="tags">
								{#if u.disabled}<span class="tag off">Disabled</span>{:else}<span class="tag on">Active</span>{/if}
								{#if u.id === me}
									<span class="tag adm">{ROLE_LABELS[profile.role]}{profile.viewAs ? ' · preview' : ''}</span>
								{:else}
									{#if u.is_admin}<span class="tag adm">Admin</span>{/if}
									<span class="tag" class:pro={st.kind !== 'free'}>{st.label}</span>
								{/if}
								{#if agencies[u.id]}
									{@const ag = agencies[u.id]}
									<span class="tag lead">{ag.role === 'lead' ? 'Agency Lead' : ag.status === 'pending' ? 'Agency · pending' : 'Agency member'} · {ag.agency_name}</span>
								{/if}
								<span class="tag">{u.project_count} project{Number(u.project_count) === 1 ? '' : 's'}</span>
							</span>
						</span>
						<span class="chev" class:up={open === u.id}><Icon name="chevron" /></span>
					</button>

					{#if open === u.id}
						<div class="more">
							<dl>
								<dt>Joined</dt><dd>{fmtDate(u.created_at)}</dd>
								<dt>Last sign-in</dt><dd>{fmtDate(u.last_sign_in_at)}</dd>
							</dl>

							<h4>Projects</h4>
							{#if ps === 'loading'}
								<Spinner size={18} />
							{:else if ps && !Array.isArray(ps)}
								<p class="err small">{ps.error}</p>
							{:else if ps && ps.length}
								<ul class="projects">
									{#each ps as p (p.id)}
										<li>
											<span>
												<strong>{p.name}</strong>
												{#if p.demo_key}<span class="tag">DEMO · {demoName(p.demo_key) ?? p.demo_key}</span>{/if}
												<br /><span class="muted small">{propertyTypeLabel(p.property_type)}{p.unit_no ? ` · ${p.unit_no}` : ''}{p.address ? ` · ${p.address}` : ''}</span>
											</span>
											<span class="muted small">{fmtDate(p.updated_at)}</span>
										</li>
									{/each}
								</ul>
							{:else}
								<p class="muted small">No projects yet (they appear after the user's first sign-in on this version).</p>
							{/if}

							<h4>Pro access</h4>
							{#if st.kind === 'agency'}
								<p class="muted small">Agency accounts are managed separately.</p>
							{:else if confirm?.id === u.id}
								<div class="confirm">
									<span>{confirm.grant.months === 0 ? `Remove Pro from ${u.name || u.email}?` : `Give ${u.name || u.email} ${confirm.grant.label.replace('Pro · ', '')} of Pro?`}</span>
									<button class="btn" onclick={() => (confirm = null)}>Cancel</button>
									<button class="btn primary" onclick={() => grant(u, confirm!.grant)}>Confirm</button>
								</div>
							{:else}
								<div class="grants">
									{#each GRANTS as g (g.label)}
										{#if !(g.months === 0 && u.plan !== 'pro')}
											<button class="btn" class:primary={g.months === null} disabled={busy === u.id} onclick={() => (confirm = { id: u.id, grant: g })}>{g.label}</button>
										{/if}
									{/each}
								</div>
								<p class="muted small">1 month adds to any time they already have. New sign-ups until 1 Feb 2027 get 3 months automatically.</p>
							{/if}

							<h4>Agency</h4>
							<AdminAgency userId={u.id} userName={u.name || u.email} row={agencies[u.id]} onchange={loadAgencies} />

							<h4>Account</h4>
							{#if u.id === me}
								<p class="muted small">This is you.</p>
							{:else if u.is_admin}
								<p class="muted small">Admins can't be disabled.</p>
							{:else if confirmDisable === u.id}
								<div class="confirm">
									<span>{u.disabled ? `Re-enable ${u.name || u.email}?` : `Disable ${u.name || u.email}? They'll be signed out and blocked until re-enabled.`}</span>
									<button class="btn" onclick={() => (confirmDisable = null)}>Cancel</button>
									<button class="btn" class:danger={!u.disabled} class:primary={u.disabled} onclick={() => setDisabled(u, !u.disabled)}>Confirm</button>
								</div>
							{:else}
								<button class="btn" class:danger={!u.disabled} disabled={busy === u.id} onclick={() => (confirmDisable = u.id)}>{u.disabled ? 'Re-enable account' : 'Disable account'}</button>
							{/if}
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
	{/if}
{/if}

{#if toast}<div class="toast" role="status">{toast}</div>{/if}

<style>
	.empty {
		display: flex;
		align-items: center;
		gap: 10px;
		color: var(--muted);
	}
	.err {
		color: #b5483a;
	}
	.stats {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 10px;
		margin-bottom: 12px;
	}
	.stats .card {
		display: flex;
		flex-direction: column;
		padding: 12px 14px;
	}
	.stats span {
		font-size: 12px;
	}
	.stats strong {
		font-size: 26px;
		font-family: var(--serif);
		font-variant-numeric: tabular-nums;
	}
	.search {
		width: 100%;
		min-height: 44px;
		padding: 0 12px;
		border-radius: var(--radius-sm);
		border: 1px solid var(--line);
		background: var(--surface);
		font-size: 16px;
	}
	.viewas {
		margin-bottom: 14px;
	}
	.va-head {
		display: flex;
		align-items: center;
		gap: 8px;
		color: var(--forest);
		margin-bottom: 10px;
	}
	.va-head strong {
		color: var(--text);
	}
	.va-head .muted {
		margin-left: auto;
		font-size: 13px;
	}
	.chips,
	.filters {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.chips button,
	.filters button {
		min-height: 44px;
		padding: 0 14px;
		border-radius: 22px;
		border: 1px solid var(--line);
		background: var(--surface);
		font-weight: 600;
		cursor: pointer;
	}
	.chips button.on,
	.filters button.on {
		background: var(--forest);
		border-color: var(--forest);
		color: var(--on-primary);
	}
	.filters {
		margin: 10px 0 14px;
	}
	.filters span {
		opacity: 0.7;
		font-weight: 500;
		margin-left: 2px;
	}
	.seg {
		display: flex;
		overflow-x: auto;
		gap: 4px;
		padding: 4px;
		background: var(--surface-2);
		border-radius: calc(var(--radius-sm) + 4px);
		margin-bottom: 14px;
	}
	.seg button {
		flex: 1;
		min-height: 44px;
		border: 0;
		border-radius: var(--radius-sm);
		background: transparent;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		font-weight: 600;
		color: var(--muted);
		cursor: pointer;
	}
	.seg button.on {
		background: var(--surface);
		color: var(--text);
		box-shadow: var(--shadow);
	}
	.tag.on {
		background: color-mix(in srgb, #2f9e5b 16%, transparent);
		color: #2a8a50;
	}
	.tag.off {
		background: var(--surface-2);
		color: var(--muted);
		text-decoration: line-through;
	}
	:global(.btn.danger) {
		color: #b5483a;
		border-color: color-mix(in srgb, #b5483a 40%, var(--line));
	}
	.center {
		display: grid;
		place-items: center;
		padding: 30px;
	}
	.users {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.user {
		padding: 0;
		overflow: hidden;
	}
	.row {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 14px;
		border: 0;
		background: none;
		text-align: left;
		cursor: pointer;
		min-height: 44px;
	}
	.who {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.who .muted {
		font-size: 13px;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-top: 4px;
	}
	.tag.adm {
		background: var(--forest);
		color: var(--on-primary);
	}
	.chev {
		transition: transform 0.2s;
		color: var(--muted);
	}
	.chev.up {
		transform: rotate(90deg);
	}
	.more {
		padding: 0 14px 16px;
		border-top: 1px solid var(--line);
	}
	dl {
		display: grid;
		grid-template-columns: 110px 1fr;
		gap: 6px 10px;
		font-size: 14px;
		margin: 12px 0 0;
	}
	dt {
		color: var(--muted);
	}
	dd {
		margin: 0;
	}
	h4 {
		margin: 16px 0 6px;
		font-size: 12px;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--muted);
	}
	.projects {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.projects li {
		display: flex;
		justify-content: space-between;
		gap: 10px;
		padding: 8px 0;
		border-bottom: 1px dashed var(--line);
		font-size: 14px;
	}
	.projects li:last-child {
		border-bottom: 0;
	}
	.projects .tag {
		margin-left: 6px;
	}
	.small {
		font-size: 12px;
	}
	.grants,
	.confirm {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		align-items: center;
	}
	.confirm span {
		flex-basis: 100%;
		font-weight: 600;
	}
	.toast {
		position: fixed;
		left: 50%;
		bottom: calc(20px + var(--safe-b));
		transform: translateX(-50%);
		background: var(--text);
		color: var(--paper);
		padding: 10px 16px;
		border-radius: 12px;
		font-size: 14px;
		z-index: 50;
		box-shadow: var(--shadow);
		max-width: calc(100vw - 32px);
	}
	@media (max-width: 560px) {
		.stats strong {
			font-size: 22px;
		}
	}
</style>
