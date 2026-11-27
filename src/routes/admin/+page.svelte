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

	$effect(() => nav.set({ label: 'Admin' }));

	interface UserRow {
		id: string;
		email: string;
		name: string;
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
	let busy = $state<string | null>(null);
	let toast = $state<string | null>(null);

	const filtered = $derived.by(() => {
		const t = q.trim().toLowerCase();
		return t ? users.filter((u) => u.name.toLowerCase().includes(t) || u.email.toLowerCase().includes(t)) : users;
	});
	const stats = $derived({
		users: users.length,
		pro: users.filter((u) => status(u).kind === 'pro').length,
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
		} catch (e) {
			error = e instanceof Error ? e.message : 'Could not load users.';
		}
		loading = false;
	}

	async function toggle(u: UserRow) {
		open = open === u.id ? null : u.id;
		confirm = null;
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
	<div class="stats">
		<div class="card"><span class="muted">Users</span><strong>{stats.users}</strong></div>
		<div class="card"><span class="muted">On Pro</span><strong>{stats.pro}</strong></div>
		<div class="card"><span class="muted">Projects</span><strong>{stats.projects}</strong></div>
	</div>

	<div class="tools">
		<input class="search" type="search" placeholder="Search name or email" bind:value={q} aria-label="Search users" maxlength="80" />
		<button class="btn" onclick={load} disabled={loading}>Refresh</button>
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
						<span class="av">{(u.name || u.email).slice(0, 1).toUpperCase()}</span>
						<span class="who">
							<strong>{u.name || '(no name)'}</strong>
							<span class="muted">{u.email}</span>
							<span class="tags">
								{#if u.is_admin}<span class="tag adm">Admin</span>{/if}
								<span class="tag" class:pro={st.kind !== 'free'}>{st.label}</span>
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
								<p class="muted small">1 month adds to any time they already have. During the launch everyone gets Pro features anyway — grants decide who keeps Pro after launch.</p>
							{/if}
						</div>
					{/if}
				</li>
			{/each}
		</ul>
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
	.tools {
		display: flex;
		gap: 8px;
		margin-bottom: 12px;
	}
	.search {
		flex: 1;
		min-height: 44px;
		padding: 0 12px;
		border-radius: var(--radius-sm);
		border: 1px solid var(--line);
		background: var(--surface);
		font-size: 16px;
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
	.av {
		width: 42px;
		height: 42px;
		flex-shrink: 0;
		border-radius: 50%;
		display: grid;
		place-items: center;
		background: var(--ochre-soft);
		color: var(--ochre);
		font-weight: 700;
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
