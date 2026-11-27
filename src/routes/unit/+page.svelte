<script lang="ts">
	/**
	 * Unit page — the heart of RE:Aspect. One unit, three views (3D plan / Top down / Walk),
	 * the DayTrace sun timeline always underneath, details tucked into collapsibles.
	 * URL: /unit?id=<unit id>  (query param keeps the site fully static)
	 */
	import { page } from '$app/state';
	import Icon from '#lib/components/Icon.svelte';
	import SunStudy, { type StudyInfo } from '#lib/components/SunStudy.svelte';
	import ShareSheet from '#lib/components/ShareSheet.svelte';
	import { loadFloorPlan } from '#lib/floorplan-store.ts';
	import { viewHash } from '#lib/share-state.ts';
	import { PROPERTY_TYPES, isPropertyType, propertyTypeLabel } from '#lib/config/property-types.ts';
	import Collapse from '#lib/components/Collapse.svelte';
	import { sampleById } from '#lib/sample-unit.ts';
	import { goto } from '$app/navigation';
	import ConfirmDelete from '#lib/components/ConfirmDelete.svelte';
	import { planReady, planToUnit } from '#lib/plan.ts';
	import { projectDetails, saveProjectDetails, getProject, type ProjectDetails } from '#lib/stores/projects.svelte.ts';
	import { validateProjectName, validateUnitNumber, validateFreeText } from '#lib/validate.ts';
	import { nav } from '#lib/stores/nav.svelte.ts';
	import { profile } from '#lib/stores/profile.svelte.ts';

	import { unitView } from '#lib/stores/unit-view.svelte.ts';

	// A user's own project (traced in Studio), or one of the built-in demos.
	const id = $derived(page.url.searchParams.get('id'));
	const mine = $derived(getProject(id));
	const needsTrace = $derived(!!mine && !planReady(mine.plan));
	const unit = $derived(
		mine && planReady(mine.plan)
			? planToUnit(mine.plan, { id: mine.id, name: mine.name, unitNo: mine.unitNo, level: mine.level, sizeSqft: mine.sizeSqft, ceilingCm: mine.ceilingCm, lat: mine.lat, lon: mine.lon })
			: sampleById(id)
	);
	let confirmDelete = $state(false);
	const details = $derived(projectDetails(mine ? mine.id : unit.id));

	// ---- edit project details
	let editing = $state(false);
	let form = $state<ProjectDetails>({ name: '', unitNo: '', address: '', propertyType: 'hdb', description: '', notes: '' });
	let errors = $state<Partial<Record<keyof ProjectDetails, string>>>({});
	let detailsOpen = $state(false);
	function startEdit() {
		if (!mine) return; // demo projects are read-only
		form = { ...details };
		errors = {};
		editing = true;
		detailsOpen = true;
	}
	function saveEdit(e: SubmitEvent) {
		e.preventDefault();
		const name = validateProjectName(form.name);
		const unitNo = form.unitNo.trim() ? validateUnitNumber(form.unitNo, mine?.level ?? unit.level) : ({ ok: true, value: '' } as const);
		const address = validateFreeText(form.address, { max: 120, label: 'Address' });
		const description = validateFreeText(form.description, { max: 280, label: 'Description', multiline: true });
		const notes = validateFreeText(form.notes, { max: 2000, label: 'Notes', multiline: true });
		errors = {
			name: name.ok ? undefined : name.error,
			unitNo: unitNo.ok ? undefined : unitNo.error,
			address: address.ok ? undefined : address.error,
			description: description.ok ? undefined : description.error,
			notes: notes.ok ? undefined : notes.error
		};
		const propertyType = isPropertyType(form.propertyType) ? form.propertyType : null;
		if (!propertyType) errors.propertyType = 'Please choose a type.';
		if (!(name.ok && unitNo.ok && address.ok && description.ok && notes.ok && propertyType)) return;
		void saveProjectDetails(unit.id, {
			name: name.value,
			unitNo: unitNo.value,
			address: address.value,
			propertyType,
			description: description.value,
			notes: notes.value
		});
		editing = false;
	}

	// View, date and time live in a session store so leaving the page and coming back restores them.
	// (Created outside any $derived so it doesn't mutate state during a read.)
	const vs = $derived(unitView(unit.id));
	$effect(() => nav.set({ label: 'Projects', href: '/' }, { label: details.name }));

	// North angle the user chose when turning the plan (kept on this device with the floor-plan image).
	let northAngle = $state<number | null>(null);
	$effect(() => {
		const pid = mine?.id;
		northAngle = null;
		if (!pid) return;
		loadFloorPlan(pid).then((img) => {
			if (mine?.id === pid) northAngle = typeof img?.angle === 'number' ? img.angle : null;
		}).catch(() => {});
	});
	const info = $derived<StudyInfo>({
		address: details.address,
		unitNo: details.unitNo,
		level: mine ? mine.level : unit.level,
		sizeSqft: mine ? mine.sizeSqft : unit.sizeSqft,
		ceilingCm: mine ? mine.ceilingCm : unit.ceiling,
		typeLabel: propertyTypeLabel(details.propertyType),
		plan: mine?.plan ?? null,
		northAngle,
		demo: !mine
	});
	const level = $derived(mine ? mine.level : unit.level);
	let shareOpen = $state(false);
</script>

<svelte:head><title>{details.name} · RE:Aspect</title></svelte:head>

<div class="titlerow">
	<h1>{details.name}</h1>
	<div class="hactions">
		{#if !needsTrace}
			<button class="btn" onclick={() => (shareOpen = true)}><Icon name="share" size={18} /> Share</button>
		{/if}
		{#if mine}
			<a class="btn" href="/studio?id={mine.id}"><Icon name="plan" size={18} /> Edit in Studio</a>
			<button class="btn trash" onclick={() => (confirmDelete = true)} aria-label="Delete project"><Icon name="trash" size={18} /></button>
		{/if}
	</div>
</div>
{#if details.address || level !== null}
	<p class="loc"><Icon name="pin" size={15} />{[details.address, level !== null ? `Level ${level}` : ''].filter(Boolean).join(' · ')}</p>
{/if}
<p class="sub muted">
	{#if mine}
		{[details.unitNo, mine.sizeSqft ? `${mine.sizeSqft.toLocaleString()} sq ft` : ''].filter(Boolean).join(' · ')}
	{:else}
		{[details.unitNo, `${unit.sizeSqft.toLocaleString()} sq ft`].filter(Boolean).join(' · ')} · Demo project
	{/if}
</p>

{#if needsTrace}
	<section class="card trace">
		<h2>{mine?.status === 'processing' ? 'Processing your floor plan…' : 'Next: trace the floor plan'}</h2>
		<p class="muted">
			{mine?.status === 'failed'
				? "The AI couldn't read this floor plan. Trace it in Studio — tap the corners of the unit, then add windows and furniture."
				: 'Open Studio to outline the unit, place the windows and add furniture. The sun view appears here as soon as the outline is done.'}
		</p>
		<a class="btn primary" href="/studio?id={mine?.id}"><Icon name="plan" size={18} /> Open Studio</a>
	</section>
{:else}

<SunStudy {unit} {vs} {info} />
<ShareSheet bind:open={shareOpen} projectId={mine?.id ?? null} demoId={mine ? null : unit.id} title={details.name} hash={viewHash(vs)} />

{/if}

<div class="details">
	<Collapse title="Project details" bind:open={detailsOpen}>
		{#if editing}
			<form class="edit" onsubmit={saveEdit} novalidate>
				<div class="field">
					<label for="pd-name">Project name</label>
					<input id="pd-name" maxlength="60" placeholder="Type here…" bind:value={form.name} />
					{#if errors.name}<span class="error">{errors.name}</span>{/if}
				</div>
				<div class="field">
					<label for="pd-unit">Unit number</label>
					<input id="pd-unit" maxlength="10" placeholder="Type here…" bind:value={form.unitNo} />
					{#if errors.unitNo}<span class="error">{errors.unitNo}</span>{/if}
				</div>
				<div class="field">
					<label for="pd-type">Type</label>
					<select id="pd-type" bind:value={form.propertyType}>
						{#each PROPERTY_TYPES as t (t.id)}<option value={t.id}>{t.label}</option>{/each}
					</select>
					{#if errors.propertyType}<span class="error">{errors.propertyType}</span>{/if}
				</div>
				<div class="field">
					<label for="pd-addr">Address</label>
					<input id="pd-addr" maxlength="120" placeholder="Type here…" bind:value={form.address} />
					{#if errors.address}<span class="error">{errors.address}</span>{/if}
				</div>
				<div class="field">
					<label for="pd-desc">Description</label>
					<textarea id="pd-desc" rows="3" maxlength="280" placeholder="Type here…" bind:value={form.description}></textarea>
					{#if errors.description}<span class="error">{errors.description}</span>{/if}
				</div>
				<div class="field">
					<label for="pd-notes">Notes</label>
					<textarea id="pd-notes" rows="5" maxlength="2000" placeholder="Type here…" bind:value={form.notes}></textarea>
					{#if errors.notes}<span class="error">{errors.notes}</span>{/if}
				</div>
				<div class="actions">
					<button type="button" class="btn" onclick={() => (editing = false)}>Cancel</button>
					<button type="submit" class="btn primary">Save</button>
				</div>
			</form>
		{:else}
			<dl>
				<dt>Name</dt><dd>{details.name}</dd>
				<dt>Unit</dt><dd>{[details.unitNo, (mine ? mine.level : unit.level) != null ? `Level ${mine ? mine.level : unit.level}` : ''].filter(Boolean).join(', ') || '—'}</dd>
				<dt>Type</dt><dd>{propertyTypeLabel(details.propertyType)}</dd>
				<dt>Address</dt><dd>{details.address || '—'}</dd>
				<dt>Description</dt><dd class="pre">{details.description || '—'}</dd>
				<dt>Notes</dt><dd class="pre">{details.notes || '—'}</dd>
				<dt>Size</dt><dd>{(mine ? mine.sizeSqft : unit.sizeSqft)?.toLocaleString() ?? '—'} sq ft</dd>
			</dl>
			{#if mine}
				<div class="editrow">
					<button class="btn editbtn" onclick={startEdit}>Edit details</button>
					<button class="btn danger" onclick={() => (confirmDelete = true)}><Icon name="trash" size={18} />Delete project</button>
				</div>
			{:else}
				<p class="muted small">Demo project · read-only. It doesn't count toward your projects.</p>
			{/if}
		{/if}
	</Collapse>
</div>

{#if confirmDelete && mine}
	<ConfirmDelete id={mine.id} name={mine.name} onclose={() => (confirmDelete = false)} ondeleted={() => goto('/', { replaceState: true })} />
{/if}

<style>
	h1 {
		margin: 6px 0 2px;
	}
	.titlerow {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}
	.hactions {
		display: flex;
		gap: 8px;
		flex-shrink: 0;
	}
	.btn.trash {
		width: 44px;
		padding: 0;
		color: #b5483a;
	}
	.trace {
		text-align: center;
		padding: 28px 20px;
		margin-bottom: 14px;
	}
	.trace h2 {
		font-family: var(--serif);
		font-weight: var(--heading-weight);
	}
	.trace p {
		max-width: 440px;
		margin: 0 auto 16px;
	}
	.editrow {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		margin-top: 14px;
	}
	.editrow .editbtn {
		margin-top: 0;
	}
	.error {
		color: #b5483a;
	}
	.loc {
		display: flex;
		align-items: center;
		gap: 6px;
		margin: 2px 0 4px;
		font-size: 14px;
		color: var(--muted);
	}
	.sub {
		margin: 0 0 14px;
		font-size: 14px;
	}
	.details {
		margin-top: 10px;
	}
	dl {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: 8px 16px;
		margin: 0;
		font-size: 14px;
	}
	dt {
		color: var(--muted);
	}
	dd {
		margin: 0;
	}
	.pre {
		white-space: pre-wrap;
	}
	.editbtn {
		margin-top: 14px;
	}
	.edit select {
		min-height: 44px;
		padding: 0 10px;
		border-radius: var(--radius-sm);
		border: 1px solid var(--line);
		background: var(--surface);
		font-size: 16px;
	}
	.edit textarea {
		padding: 10px 12px;
		border-radius: 10px;
		border: 1px solid var(--line);
		background: var(--surface);
		font-size: 16px;
		resize: vertical;
	}
	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
	}
	.small {
		font-size: 13px;
		margin: 10px 0 0;
	}
</style>
