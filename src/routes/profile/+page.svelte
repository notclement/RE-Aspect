<script lang="ts">
	import { nav } from '#lib/stores/nav.svelte.ts';
	$effect(() => nav.set({ label: 'Profile' }));
	import { profile, ROLE_LABELS } from '#lib/stores/profile.svelte.ts';
	import { auth } from '#lib/stores/auth.svelte.ts';
	import { PLANS, FREE_LAUNCH } from '#lib/config/plans.ts';
	import { validateName } from '#lib/validate.ts';
	import { myProjects } from '#lib/stores/projects.svelte.ts';
	import Avatar from '#lib/components/Avatar.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import CropSquare from '#lib/components/CropSquare.svelte';
	import { agency } from '#lib/stores/agency.svelte.ts';

	let fileInput = $state<HTMLInputElement>();
	let photoBusy = $state(false);
	let photoError = $state<string | null>(null);
	let cropFile = $state<File | null>(null);
	function pickPhoto(e: Event) {
		const file = (e.currentTarget as HTMLInputElement).files?.[0];
		(e.currentTarget as HTMLInputElement).value = '';
		photoError = null;
		if (!file) return;
		if (!file.type.startsWith('image/') || file.size > 30 * 1024 * 1024) return void (photoError = 'Please choose an image under 30 MB.');
		cropFile = file;
	}
	async function cropped(dataUrl: string) {
		cropFile = null;
		photoBusy = true;
		try {
			await auth.saveAvatar(dataUrl);
		} catch (err) {
			photoError = err instanceof Error ? err.message : 'Could not use that photo.';
		}
		photoBusy = false;
	}
	async function removePhoto() {
		photoError = null;
		try {
			await auth.saveAvatar(null);
		} catch (err) {
			photoError = err instanceof Error ? err.message : 'Could not remove the photo.';
		}
	}

	let editingName = $state(false);
	let name = $state('');
	let error = $state<string | null>(null);
	let nameInput = $state<HTMLInputElement>();
	function startEditName() {
		name = profile.data.name;
		error = null;
		editingName = true;
		queueMicrotask(() => nameInput?.select());
	}
	const plan = $derived(PLANS[profile.planId]);

	// Usage: own projects (demos are free); AI re-runs are counted per project on the server.
	const used = $derived(agency.active && agency.info ? agency.info.used : myProjects.length);
	const included = $derived(agency.active && agency.info ? agency.info.pool : (plan.includedUnits ?? 0));
	const pct = $derived(included ? Math.min(100, Math.round((used / included) * 100)) : 0);
	const until = $derived(profile.data.proUntil);
	const planNote = $derived(
		profile.viewAs
			? 'Preview of this role'
			: until === 'infinity'
				? 'Lifetime Pro'
				: until
					? `Pro until ${new Date(until).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })}`
					: FREE_LAUNCH && profile.data.plan === 'free'
						? 'Free during launch'
						: ''
	);

	function save(e?: SubmitEvent) {
		e?.preventDefault();
		const r = validateName(name);
		error = r.ok ? null : r.error;
		if (r.ok) {
			if (r.value !== profile.data.name) void auth.saveName(r.value);
			editingName = false;
		}
	}
</script>

<svelte:head><title>Profile · RE:Aspect</title></svelte:head>

<section class="card head">
	<button class="av" onclick={() => fileInput?.click()} disabled={photoBusy} aria-label={profile.data.avatar ? 'Change photo' : 'Add photo'}>
		<Avatar size={84} />
		<span class="cam"><Icon name="camera" size={16} /></span>
	</button>
	<input bind:this={fileInput} type="file" accept="image/*" hidden onchange={pickPhoto} />

	<div class="who">
		<span class="lbl muted">Display name</span>
		{#if editingName}
			<form class="nameedit" onsubmit={save} novalidate>
				<input
					bind:this={nameInput}
					maxlength="40"
					autocomplete="name"
					bind:value={name}
					aria-label="Display name"
					onkeydown={(e) => e.key === 'Escape' && (editingName = false)}
				/>
				<button class="ib ok" type="submit" aria-label="Save name"><Icon name="check" size={18} /></button>
				<button class="ib" type="button" onclick={() => (editingName = false)} aria-label="Cancel"><Icon name="close" size={18} /></button>
			</form>
			{#if error}<span class="error small">{error}</span>{/if}
		{:else}
			<div class="namerow">
				<h1>{profile.data.name || 'Add your name'}</h1>
				<button class="ib" onclick={startEditName} aria-label="Edit display name"><Icon name="pencil" size={18} /></button>
			</div>
		{/if}
		<span class="muted email">{auth.email ?? 'Preview mode'}</span>
		<div class="badges">
			<span class="tag">{ROLE_LABELS[profile.role]}{profile.viewAs ? ' · preview' : ''}</span>
			<span class="tag pro">{plan.label}</span>
			{#if planNote}<span class="muted small">{planNote}</span>{/if}
		</div>
		{#if profile.data.avatar}<button class="link small" onclick={removePhoto} disabled={photoBusy}>Remove photo</button>{/if}
		{#if photoError}<span class="error small">{photoError}</span>{/if}
	</div>
</section>
{#if cropFile}<CropSquare file={cropFile} ondone={cropped} oncancel={() => (cropFile = null)} />{/if}

<section class="card usage" aria-label="Usage">
	<div class="u-head">
		<strong>{agency.active ? `${agency.info?.name} · shared projects` : 'Projects'}</strong>
		<span><b>{used}</b> / {included || '—'}</span>
	</div>
	<div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax={included} aria-valuenow={used} aria-label="Projects used">
		<span style:width="{pct}%" class:full={pct >= 100}></span>
	</div>
	<div class="facts">
		<span><b>{Math.max(0, included - used)}</b> projects left</span>
		<span><b>{plan.aiRunsPerFunctionPerUnit}×</b> AI re-runs per project</span>
		{#if plan.extraUnitOneOffSgd}<span><b>S${plan.extraUnitOneOffSgd}</b> per extra project</span>{/if}
	</div>
	{#if FREE_LAUNCH}<p class="muted small">Launch period: everyone gets Pro features free while we test. Demo projects don't count.</p>{/if}
	<a class="plans-link" href="/upgrade">See plans<Icon name="chevron" size={16} /></a>
</section>

<style>
	.head {
		display: flex;
		align-items: center;
		gap: 18px;
		margin-bottom: 14px;
	}
	.av {
		position: relative;
		border: 0;
		background: none;
		padding: 0;
		cursor: pointer;
		border-radius: 50%;
		flex-shrink: 0;
	}
	.cam {
		position: absolute;
		right: -2px;
		bottom: -2px;
		width: 32px;
		height: 32px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		background: var(--forest);
		color: var(--on-primary);
		border: 2px solid var(--surface);
	}
	.who {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
		align-items: flex-start;
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
		max-width: 100%;
	}
	.namerow h1 {
		margin: 0;
		font-size: clamp(22px, 6vw, 30px);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.nameedit {
		display: flex;
		gap: 6px;
		width: 100%;
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
	.ib:hover {
		background: var(--surface-2);
	}
	.ib.ok {
		background: var(--forest);
		color: var(--on-primary);
	}
	.email {
		font-size: 14px;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 100%;
	}
	.badges {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
		margin-top: 4px;
	}
	.small {
		font-size: 12px;
	}
	.link {
		border: 0;
		background: none;
		padding: 0;
		color: var(--muted);
		text-decoration: underline;
		cursor: pointer;
		min-height: 32px;
	}
	.error {
		color: #b5483a;
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
		margin: 8px 0 12px;
	}
	.bar span {
		display: block;
		height: 100%;
		border-radius: inherit;
		background: var(--forest);
		transition: width 0.4s ease;
	}
	.bar span.full {
		background: var(--ochre);
	}
	.facts {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
		gap: 8px;
	}
	.facts span {
		background: var(--surface-2);
		border-radius: var(--radius-sm);
		padding: 10px 12px;
		font-size: 13px;
		color: var(--muted);
	}
	.facts b {
		display: block;
		font-size: 18px;
		color: var(--text);
	}
	.usage .small {
		margin: 10px 0 0;
	}
	.plans-link {
		display: inline-flex;
		align-items: center;
		gap: 2px;
		min-height: 44px;
		margin-top: 4px;
		color: var(--forest);
		font-weight: 600;
		text-decoration: none;
	}
	.plans-link :global(svg) {
		transform: rotate(-90deg);
	}
	@media (max-width: 420px) {
		.head {
			align-items: flex-start;
		}
	}
</style>
