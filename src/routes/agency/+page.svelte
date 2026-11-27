<script lang="ts">
	/**
	 * My agency — for Agency Leads and members (account menu, between Profile and Settings).
	 *   Lead: rename, invite QR (reusable; reset makes old QRs stop working), approve / decline requests,
	 *         see everyone's projects, remove members (their agency projects move to the lead).
	 *   Member: see the team (photo, name, role, projects used) and the shared quota; leave.
	 * The server (migration 0008) enforces every rule; this page only shows and asks.
	 */
	import { onMount } from 'svelte';
	import { nav } from '#lib/stores/nav.svelte.ts';
	import { agency, type AgencyInfo, type AgencyMember } from '#lib/stores/agency.svelte.ts';
	import { profile } from '#lib/stores/profile.svelte.ts';
	import { auth } from '#lib/stores/auth.svelte.ts';
	import { validateCompanyName } from '#lib/validate.ts';
	import Avatar from '#lib/components/Avatar.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import Spinner from '#lib/components/Spinner.svelte';
	import QrCode from '#lib/components/QrCode.svelte';

	$effect(() => nav.set({ label: 'My agency' }));
	onMount(() => void agency.refresh());

	// Admins previewing a role see sample data (nothing is saved).
	const SAMPLE: AgencyInfo = {
		id: 'sample',
		name: 'Harbourfront Realty',
		role: 'lead',
		status: 'active',
		seats: 10,
		memberLimit: 11,
		pool: 130,
		used: 18,
		inviteCode: 'HRB7Q2KZ',
		members: [
			{ id: 'l', name: profile.data.name || 'You', avatar: null, role: 'lead', status: 'active', joinedAt: '', projects: 6, projectList: [] },
			{ id: 'p', name: 'Mei Ling Tan', avatar: null, role: 'member', status: 'pending', joinedAt: '', projects: 0, projectList: [] },
			{ id: 'a', name: 'Arjun Nair', avatar: null, role: 'member', status: 'active', joinedAt: '', projects: 7, projectList: [] },
			{ id: 'b', name: 'Siti Rahman', avatar: null, role: 'member', status: 'active', joinedAt: '', projects: 5, projectList: [] }
		]
	};
	const preview = $derived(!agency.info && (profile.viewAs === 'lead' || profile.viewAs === 'agency'));
	const info = $derived<AgencyInfo | null>(
		agency.info ?? (preview ? { ...SAMPLE, role: profile.viewAs === 'lead' ? 'lead' : 'member', inviteCode: profile.viewAs === 'lead' ? SAMPLE.inviteCode : null } : null)
	);
	const isLead = $derived(info?.role === 'lead' && info.status === 'active');
	const me = $derived(info?.members.find((m) => m.role === (isLead ? 'lead' : 'member') && m.name === profile.data.name)?.id);
	const active = $derived(info?.members.filter((m) => m.status === 'active') ?? []);
	const pending = $derived(info?.members.filter((m) => m.status === 'pending') ?? []);
	const pct = $derived(info?.pool ? Math.min(100, Math.round((info.used / info.pool) * 100)) : 0);
	const joinUrl = $derived(info?.inviteCode ? `${location.origin}/join?code=${info.inviteCode}` : '');

	let busy = $state<string | null>(null);
	let error = $state<string | null>(null);
	let toast = $state<string | null>(null);
	function say(t: string) {
		toast = t;
		setTimeout(() => (toast = null), 2600);
	}
	async function run(key: string, fn: () => Promise<void>, done?: string) {
		if (preview) return say('Preview only — nothing is saved.');
		busy = key;
		error = null;
		try {
			await fn();
			if (done) say(done);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Something went wrong.';
		}
		busy = null;
	}

	// rename
	let editing = $state(false);
	let newName = $state('');
	let nameErr = $state<string | null>(null);
	function rename(e: SubmitEvent) {
		e.preventDefault();
		const r = validateCompanyName(newName);
		if (!r.ok) return void (nameErr = r.error);
		nameErr = null;
		editing = false;
		if (r.value !== info?.name) void run('rename', () => agency.rename(r.value));
	}

	// invite
	let qr = $state<{ toPng: (px?: number) => Promise<Blob | null> }>();
	let confirmReset = $state(false);
	async function copyLink() {
		try {
			await navigator.clipboard.writeText(joinUrl);
			say('Link copied');
		} catch {
			say("Couldn't copy — long-press the link instead.");
		}
	}
	const canShare = typeof navigator !== 'undefined' && 'share' in navigator;
	async function share() {
		const png = await qr?.toPng();
		const file = png ? new File([png], `${info?.name ?? 'agency'}-invite.png`, { type: 'image/png' }) : null;
		const data: ShareData = { title: `Join ${info?.name} on RE:Aspect`, text: `Scan or tap to join ${info?.name} on RE:Aspect:`, url: joinUrl };
		try {
			if (file && navigator.canShare?.({ files: [file] })) await navigator.share({ ...data, files: [file] });
			else await navigator.share(data);
		} catch {
			/* cancelled */
		}
	}
	async function download() {
		const png = await qr?.toPng();
		if (!png) return;
		const a = document.createElement('a');
		a.href = URL.createObjectURL(png);
		a.download = `${(info?.name ?? 'agency').replace(/[^\w-]+/g, '-')}-invite-qr.png`;
		a.click();
		setTimeout(() => URL.revokeObjectURL(a.href), 1000);
	}

	// members
	let open = $state<string | null>(null);
	let confirmRemove = $state<AgencyMember | null>(null);
	let confirmLeave = $state(false);
</script>

<svelte:head><title>My agency · RE:Aspect</title></svelte:head>

{#if !agency.loaded && !preview}
	<div class="card center"><Spinner size={20} /></div>
{:else if auth.status === 'preview' && !preview}
	<div class="card center">
		<h1>My agency</h1>
		<p class="muted">Agencies need an account — sign in on the live app to join or manage one.</p>
	</div>
{:else if !info}
	<div class="card center">
		<span class="big"><Icon name="users" size={28} /></span>
		<h1>You're not in an agency</h1>
		<p class="muted">Ask your agency lead for their QR code and scan it to join. Running a team? Agency plans share one quota across everyone.</p>
		<a class="btn primary" href="/upgrade">See plans</a>
	</div>
{:else if info.status === 'pending'}
	<div class="card center">
		<span class="big"><Icon name="users" size={28} /></span>
		<h1>Waiting for approval</h1>
		<p class="muted">You've asked to join <strong>{info.name}</strong>. {info.lead || 'The agency lead'} needs to approve you — you'll get the agency's quota as soon as they do.</p>
		<div class="row">
			<button class="btn" onclick={() => agency.refresh()}>Check again</button>
			<button class="btn" disabled={busy === 'leave'} onclick={() => run('leave', () => agency.leave(), 'Request cancelled')}>Cancel request</button>
		</div>
		{#if error}<p class="error small">{error}</p>{/if}
	</div>
{:else}
	{#if preview}<p class="note">Preview with sample data — nothing here is saved.</p>{/if}

	<section class="card head">
		<span class="lbl muted">{isLead ? 'Your agency' : 'Your agency'}</span>
		{#if editing}
			<form class="nameedit" onsubmit={rename} novalidate>
				<input maxlength="60" bind:value={newName} placeholder="Type here…" aria-label="Agency name" onkeydown={(e) => e.key === 'Escape' && (editing = false)} />
				<button class="ib ok" type="submit" title="Save name" aria-label="Save name"><Icon name="check" size={18} /></button>
				<button class="ib" type="button" onclick={() => (editing = false)} title="Cancel" aria-label="Cancel"><Icon name="close" size={18} /></button>
			</form>
			{#if nameErr}<span class="error small">{nameErr}</span>{/if}
		{:else}
			<div class="namerow">
				<h1>{info.name}</h1>
				{#if isLead}<button class="ib" onclick={() => ((newName = info.name), (nameErr = null), (editing = true))} title="Rename agency" aria-label="Rename agency"><Icon name="pencil" size={18} /></button>{/if}
			</div>
		{/if}
		<div class="badges">
			<span class="tag lead">{isLead ? 'Agency Lead' : 'Agency member'}</span>
			<span class="muted small">{active.length} of {info.memberLimit} members</span>
		</div>

		<div class="u-head">
			<strong>Shared projects</strong>
			<span><b>{info.used}</b> / {info.pool}</span>
		</div>
		<div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax={info.pool} aria-valuenow={info.used} aria-label="Agency projects used">
			<span style:width="{pct}%" class:full={pct >= 100}></span>
		</div>
		<p class="muted small">Everyone in the agency creates projects from this pool, with Agency limits (25 AI re-runs per project). {info.seats} paid seats + lead.</p>
	</section>

	{#if error}<p class="error card">{error}</p>{/if}

	{#if isLead}
		<section class="card invite">
			<div class="inv-text">
				<h2><Icon name="qr" size={20} />Invite people</h2>
				<p class="muted">Show or send this QR code. People scan it, sign in, and appear below for you to approve.</p>
				{#if info.inviteCode}<p class="code">Code <b>{info.inviteCode}</b></p>{/if}
				<div class="row">
					<button class="btn" onclick={copyLink}>Copy link</button>
					{#if canShare}<button class="btn" onclick={share}>Share</button>{/if}
					<button class="btn" onclick={download}>Save image</button>
				</div>
				{#if confirmReset}
					<div class="confirm">
						<span>Make a new QR code? The current one stops working (people already in the agency stay).</span>
						<div class="row">
							<button class="btn" onclick={() => (confirmReset = false)}>Cancel</button>
							<button class="btn primary" disabled={busy === 'reset'} onclick={() => run('reset', () => agency.resetCode(), 'New QR code ready').then(() => (confirmReset = false))}>New QR code</button>
						</div>
					</div>
				{:else}
					<button class="link" onclick={() => (confirmReset = true)}>Make a new QR code</button>
				{/if}
			</div>
			{#if joinUrl}<QrCode bind:this={qr} text={joinUrl} size={196} label="QR code to join {info.name}" />{/if}
		</section>

		{#if pending.length}
			<section class="card">
				<h2>Waiting for approval <span class="count">{pending.length}</span></h2>
				<ul class="people">
					{#each pending as m (m.id)}
						<li class="person">
							<Avatar size={40} src={m.avatar} name={m.name} />
							<span class="pname"><strong>{m.name}</strong><span class="muted small">Asked to join</span></span>
							<button class="btn" disabled={!!busy} onclick={() => run('rm' + m.id, () => agency.remove(m.id), 'Declined')}>Decline</button>
							<button class="btn primary" disabled={!!busy || active.length >= info.memberLimit} onclick={() => run('ok' + m.id, () => agency.approve(m.id), `${m.name} joined`)}>Approve</button>
						</li>
					{/each}
				</ul>
				{#if active.length >= info.memberLimit}<p class="muted small">All seats are taken — remove someone or <a href="/upgrade">contact us</a> for more seats.</p>{/if}
			</section>
		{/if}
	{/if}

	<section class="card">
		<h2>Team <span class="count">{active.length}</span></h2>
		<ul class="people">
			{#each active as m (m.id)}
				<li class="member" class:open={open === m.id}>
					<svelte:element this={isLead && m.role !== 'lead' ? 'button' : 'div'} class="person" role={isLead && m.role !== 'lead' ? undefined : 'group'} onclick={() => isLead && m.role !== 'lead' && (open = open === m.id ? null : m.id)} aria-expanded={isLead && m.role !== 'lead' ? open === m.id : undefined}>
						<Avatar size={40} src={m.avatar} name={m.name} />
						<span class="pname">
							<strong>{m.name}{#if m.id === me}&nbsp;<span class="muted">(you)</span>{/if}</strong>
							<span class="muted small">{m.role === 'lead' ? 'Agency Lead' : 'Member'}</span>
						</span>
						<span class="pcount"><b>{m.projects}</b> project{m.projects === 1 ? '' : 's'}</span>
						{#if isLead && m.role !== 'lead'}<span class="chev" class:up={open === m.id}><Icon name="chevron" size={18} /></span>{/if}
					</svelte:element>
					{#if isLead && open === m.id}
						<div class="more">
							{#if m.projectList?.length}
								<ul class="projects">
									{#each m.projectList as p (p.id)}
										<li><span>{p.name}{p.unitNo ? ` · ${p.unitNo}` : ''}</span><span class="muted small">{p.updatedAt ? new Date(p.updatedAt).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' }) : ''}</span></li>
									{/each}
								</ul>
							{:else}
								<p class="muted small">No agency projects yet.</p>
							{/if}
							{#if confirmRemove?.id === m.id}
								<div class="confirm">
									<span>Remove {m.name}? {m.projects ? `Their ${m.projects} agency project${m.projects === 1 ? '' : 's'} move to you.` : ''} They can rejoin with the QR code if you approve again.</span>
									<div class="row">
										<button class="btn" onclick={() => (confirmRemove = null)}>Cancel</button>
										<button class="btn danger" disabled={!!busy} onclick={() => run('rm' + m.id, () => agency.remove(m.id), `${m.name} removed`).then(() => (confirmRemove = null))}>Remove</button>
									</div>
								</div>
							{:else}
								<button class="btn danger" onclick={() => (confirmRemove = m)}>Remove from agency</button>
							{/if}
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	</section>

	{#if !isLead}
		<section class="card">
			{#if confirmLeave}
				<div class="confirm">
					<span>Leave {info.name}? Projects you made for the agency stay with the agency, and you go back to your own plan.</span>
					<div class="row">
						<button class="btn" onclick={() => (confirmLeave = false)}>Cancel</button>
						<button class="btn danger" disabled={busy === 'leave'} onclick={() => run('leave', () => agency.leave(), 'You left the agency').then(() => (confirmLeave = false))}>Leave agency</button>
					</div>
				</div>
			{:else}
				<button class="btn danger" onclick={() => (confirmLeave = true)}>Leave agency</button>
			{/if}
		</section>
	{/if}
{/if}

{#if toast}<div class="toast" role="status">{toast}</div>{/if}

<style>
	.card + .card,
	.note + .card {
		margin-top: 14px;
	}
	.center {
		text-align: center;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		padding: 32px 20px;
	}
	.center h1 {
		margin: 4px 0 0;
		font-size: 24px;
	}
	.center p {
		max-width: 420px;
		margin: 0 0 8px;
	}
	.big {
		width: 56px;
		height: 56px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		background: var(--ochre-soft);
		color: var(--ochre-ink);
	}
	.note {
		margin: 0 0 10px;
		font-size: 13px;
		color: var(--ochre-ink);
	}
	.head {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.lbl {
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.namerow {
		display: flex;
		align-items: center;
		gap: 4px;
	}
	.namerow h1 {
		margin: 0;
		font-size: clamp(22px, 6vw, 30px);
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.nameedit {
		display: flex;
		gap: 6px;
	}
	.nameedit input {
		flex: 1;
		min-width: 0;
		min-height: 44px;
		padding: 0 12px;
		border-radius: var(--radius-sm);
		border: 1px solid var(--forest);
		background: var(--surface);
		font-size: 18px;
	}
	.ib {
		width: 44px;
		height: 44px;
		flex-shrink: 0;
		display: grid;
		place-items: center;
		border: 0;
		border-radius: var(--radius-sm);
		background: none;
		color: var(--muted);
		cursor: pointer;
	}
	.ib.ok {
		background: var(--forest);
		color: var(--on-primary);
	}
	.badges {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		margin-bottom: 10px;
	}
	.u-head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
	}
	.u-head b {
		font-size: 20px;
		font-variant-numeric: tabular-nums;
	}
	.bar {
		height: 10px;
		border-radius: 5px;
		background: var(--surface-2);
		overflow: hidden;
		margin: 8px 0 4px;
	}
	.bar span {
		display: block;
		height: 100%;
		border-radius: inherit;
		background: var(--forest);
	}
	.bar span.full {
		background: var(--ochre);
	}
	h2 {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 0 0 6px;
		font-size: 18px;
	}
	.count {
		font-size: 13px;
		font-weight: 700;
		background: var(--surface-2);
		color: var(--muted);
		border-radius: 999px;
		padding: 2px 9px;
	}
	.invite {
		display: flex;
		gap: 18px;
		align-items: center;
		justify-content: space-between;
	}
	.inv-text {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.inv-text p {
		margin: 0;
	}
	.code b {
		letter-spacing: 0.12em;
		font-variant-numeric: tabular-nums;
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.link {
		align-self: flex-start;
		border: 0;
		background: none;
		padding: 0;
		min-height: 44px;
		color: var(--muted);
		text-decoration: underline;
		cursor: pointer;
		font: inherit;
		font-size: 14px;
	}
	.confirm {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 12px;
		border-radius: var(--radius-sm);
		background: var(--surface-2);
		font-size: 14px;
	}
	.people {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
	}
	.people > li + li {
		border-top: 1px solid var(--line);
	}
	.person {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		min-height: 60px;
		padding: 8px 0;
		border: 0;
		background: none;
		text-align: left;
		font: inherit;
		color: inherit;
	}
	button.person {
		cursor: pointer;
	}
	.pname {
		flex: 1;
		min-width: 96px;
		display: flex;
		flex-direction: column;
	}
	.pname strong {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.pcount {
		font-size: 13px;
		color: var(--muted);
		white-space: nowrap;
	}
	.pcount b {
		color: var(--text);
		font-size: 16px;
	}
	.chev {
		display: grid;
		transition: transform 0.2s;
		color: var(--muted);
	}
	.chev.up {
		transform: rotate(180deg);
	}
	.more {
		padding: 0 0 12px 52px;
		display: flex;
		flex-direction: column;
		gap: 10px;
		align-items: flex-start;
	}
	.projects {
		list-style: none;
		margin: 0;
		padding: 0;
		width: 100%;
	}
	.projects li {
		display: flex;
		justify-content: space-between;
		gap: 8px;
		padding: 6px 0;
		font-size: 14px;
	}
	.btn.danger {
		color: #b5483a;
		border-color: rgba(181, 72, 58, 0.35);
	}
	.small {
		font-size: 12px;
	}
	.error {
		color: #b5483a;
	}
	.toast {
		position: fixed;
		left: 50%;
		bottom: calc(24px + var(--safe-b, 0px));
		transform: translateX(-50%);
		background: var(--text);
		color: var(--surface);
		padding: 10px 16px;
		border-radius: 999px;
		font-size: 14px;
		z-index: 50;
	}
	@media (max-width: 420px) {
		.people li.person {
			flex-wrap: wrap;
		}
		.people li.person .pname {
			flex-basis: calc(100% - 52px);
		}
		.people li.person .btn {
			flex: 1;
		}
	}
	@media (max-width: 560px) {
		.invite {
			flex-direction: column-reverse;
			align-items: stretch;
		}
		.invite :global(.qr) {
			align-self: center;
		}
		.more {
			padding-left: 0;
		}
	}
</style>
