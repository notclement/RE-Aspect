<script lang="ts">
	/**
	 * Unit page — the heart of RE:Aspect. One unit, three views (3D plan / Top down / Walk),
	 * the DayTrace sun timeline always underneath, details tucked into collapsibles.
	 * URL: /unit?id=<unit id>  (query param keeps the site fully static)
	 */
	import { page } from '$app/state';
	import Icon from '#lib/components/Icon.svelte';
	import PlanView from '#lib/components/PlanView.svelte';
	import SunTimeline from '#lib/components/SunTimeline.svelte';
	import SunInfoSheet from '#lib/components/SunInfoSheet.svelte';
	import { PROPERTY_TYPES, isPropertyType, propertyTypeLabel } from '#lib/config/property-types.ts';
	import Collapse from '#lib/components/Collapse.svelte';
	import { sampleById } from '#lib/sample-unit.ts';
	import { goto } from '$app/navigation';
	import ConfirmDelete from '#lib/components/ConfirmDelete.svelte';
	import { planReady, planToUnit } from '#lib/plan.ts';
	import { projectDetails, saveProjectDetails, getProject, type ProjectDetails } from '#lib/stores/projects.svelte.ts';
	import { validateProjectName, validateUnitNumber, validateFreeText } from '#lib/validate.ts';
	import { sunPosition, localDate, sunTimes, compass } from '#lib/sun.ts';
	import { sunPatches, darkness, furnitureLight, indoorExposure, ITEM_LABELS } from '#lib/light.ts';
	import { nav } from '#lib/stores/nav.svelte.ts';
	import { profile } from '#lib/stores/profile.svelte.ts';

	import { unitView, type View } from '#lib/stores/unit-view.svelte.ts';
	const views: { id: View; label: string }[] = [
		{ id: 'top', label: 'Top down' },
		{ id: '3d', label: '3D plan' },
		{ id: 'walk', label: 'Walk' }
	];

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
	let grid = $state(true);
	let planView = $state<PlanView>();

	// Canvas height: compact by default so the sun timeline stays on screen; drag the handle to resize.
	const H_KEY = 'rea.canvasH';
	let canvasH = $state(320);
	$effect(() => {
		const saved = Number(localStorage.getItem(H_KEY));
		canvasH = saved > 0 ? clampH(saved) : clampH(Math.round(innerHeight * 0.38));
	});
	function clampH(h: number) {
		return Math.round(Math.min(innerHeight * 0.85, Math.max(220, h)));
	}
	let dragY: number | null = null;
	function hDown(e: PointerEvent) {
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		dragY = e.clientY;
	}
	function hMove(e: PointerEvent) {
		if (dragY === null) return;
		canvasH = clampH(canvasH + (e.clientY - dragY));
		dragY = e.clientY;
	}
	function hUp() {
		dragY = null;
		try {
			localStorage.setItem(H_KEY, String(canvasH));
		} catch {
			/* ignore */
		}
	}
	let zoomPct = $state(100);

	$effect(() => nav.set({ label: 'Projects', href: '/' }, { label: details.name }));

	const sun = $derived(sunPosition(localDate(vs.date, vs.minutes), unit.lat, unit.lon));
	const patches = $derived(sunPatches(unit, sun.azimuth, sun.altitude));
	const dark = $derived(darkness(sun.altitude));
	const furniture = $derived(furnitureLight(unit, sun.azimuth, sun.altitude, patches));
	const sunnyItems = $derived(
		[...new Set([...furniture.lit].map((i) => ITEM_LABELS[unit.items[i].kind]).filter((n) => n !== 'Rug'))]
	);
	const times = $derived(sunTimes(vs.date, unit.lat, unit.lon));
	// Sun inside the home through the day (for the timeline: when the most light lands indoors).
	const exposure = $derived(
		times.sunrise !== null && times.sunset !== null
			? indoorExposure(unit, (m) => sunPosition(localDate(vs.date, m), unit.lat, unit.lon), times.sunrise, times.sunset)
			: null
	);

	const litWalls = $derived(
		[...new Set(unit.windows.filter((w) => {
			const az = ((sun.azimuth - unit.bearing) * Math.PI) / 180;
			return sun.altitude > 0 && Math.sin(az) * w.normal[0] - Math.cos(az) * w.normal[1] > 0.03;
		}).map((w) => compass(Math.atan2(w.normal[0], -w.normal[1]) * (180 / Math.PI) + unit.bearing)))]
	);

	function zoom(f: number) {
		planView?.zoomBy(f);
		zoomPct = Math.round((planView?.getScale() ?? 1) * 100);
	}
	let infoOpen = $state(false);
	const fmtTime = (m: number) => fmtMin(m);
	function fmtMin(m: number | null) {
		if (m === null) return '—';
		m = ((Math.round(m) % 1440) + 1440) % 1440;
		const h = Math.floor(m / 60);
		const mm = String(m % 60).padStart(2, '0');
		return profile.data.clock === '24h' ? `${String(h).padStart(2, '0')}:${mm}` : `${((h + 11) % 12) + 1}:${mm} ${h < 12 ? 'AM' : 'PM'}`;
	}
	const summary = $derived(
		sun.altitude <= 0
			? 'The sun is down — the home is in shade.'
			: litWalls.length
				? `Direct sun through the ${litWalls.join(' & ')}-facing windows.` +
					(sunnyItems.length ? ` In the sun: ${sunnyItems.join(', ').toLowerCase()}.` : '')
				: 'Sun is up, but no windows face it right now — soft daylight only.'
	);
</script>

<svelte:head><title>{details.name} · RE:Aspect</title></svelte:head>

<div class="titlerow">
	<h1>{details.name}</h1>
	{#if mine}
		<div class="hactions">
			<a class="btn" href="/studio?id={mine.id}"><Icon name="plan" size={18} /> Edit in Studio</a>
			<button class="btn trash" onclick={() => (confirmDelete = true)} aria-label="Delete project"><Icon name="trash" size={18} /></button>
		</div>
	{/if}
</div>
<p class="sub muted">
	{#if mine}
		{[details.unitNo, mine.level !== null ? `Level ${mine.level}` : '', mine.sizeSqft ? `${mine.sizeSqft.toLocaleString()} sq ft` : ''].filter(Boolean).join(' · ')}
	{:else}
		{[details.unitNo, `Level ${unit.level}`, `${unit.sizeSqft.toLocaleString()} sq ft`].filter(Boolean).join(' · ')} · Demo project
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

<section class="viewer">
	<div class="seg" role="tablist" aria-label="View">
		{#each views as v (v.id)}
			<button role="tab" aria-selected={vs.view === v.id} class:on={vs.view === v.id} onclick={() => { vs.view = v.id; zoomPct = 100; }}>{v.label}</button>
		{/each}
	</div>

	<div class="canvas" style:height="{canvasH}px">
		{#if vs.view === 'walk'}
			<div class="walk">
				<Icon name="walk" size={34} />
				<strong>Walkthrough</strong>
				<p class="muted">Walk the unit at your own eye level ({profile.eyeLevelCm} cm). Arrives in Phase 3.</p>
			</div>
		{:else}
			{#key vs.view}
				<PlanView bind:this={planView} {unit} mode={vs.view} {patches} {dark} {sun} {furniture} showSun={profile.data.showSunMarker} {grid} onzoom={(k) => (zoomPct = Math.round(k * 100))} />
			{/key}
			<div class="zoom">
				<button onclick={() => zoom(1.2)} aria-label="Zoom in"><Icon name="plus" size={16} /></button>
				<span>{zoomPct}%</span>
				<button onclick={() => zoom(1 / 1.2)} aria-label="Zoom out"><Icon name="minus" size={16} /></button>
				<button class="g" onclick={() => (grid = !grid)} aria-label="Toggle grid" aria-pressed={grid}><Icon name="grid" size={15} /></button>
			</div>
		{/if}
	</div>
	<div
		class="grip"
		role="slider"
		aria-label="Resize view"
		aria-valuenow={canvasH}
		tabindex="0"
		onpointerdown={hDown}
		onpointermove={hMove}
		onpointerup={hUp}
		onpointercancel={hUp}
		onkeydown={(e) => {
			if (e.key === 'ArrowDown') canvasH = clampH(canvasH + 30);
			else if (e.key === 'ArrowUp') canvasH = clampH(canvasH - 30);
			else return;
			e.preventDefault();
			hUp();
		}}
	>
		<span></span>
	</div>
</section>

<p class="summary">{summary}</p>

<SunTimeline bind:minutes={vs.minutes} bind:date={vs.date} sunrise={times.sunrise} sunset={times.sunset} lat={unit.lat} lon={unit.lon} {sun} {exposure} oninfo={() => (infoOpen = true)} />
<SunInfoSheet bind:open={infoOpen} {unit} {sun} date={vs.date} minutes={vs.minutes} sunrise={times.sunrise} sunset={times.sunset} fmt={fmtTime} />

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
	.sub {
		margin: 0 0 14px;
		font-size: 14px;
	}
	.viewer {
		background: var(--canvas);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		overflow: hidden;
	}
	.seg {
		display: flex;
		gap: 4px;
		margin: 10px;
		padding: 4px;
		background: var(--surface-2);
		border-radius: 14px;
	}
	.seg button {
		flex: 1;
		min-height: 42px;
		border: 0;
		border-radius: 11px;
		background: transparent;
		color: var(--muted);
		font-weight: 600;
		font-size: 15px;
		cursor: pointer;
	}
	.seg button.on {
		background: var(--surface);
		color: var(--forest);
		box-shadow: var(--shadow);
	}
	.canvas {
		position: relative;
		border-top: 1px solid var(--line);
	}
	.grip {
		height: 22px;
		display: grid;
		place-items: center;
		cursor: ns-resize;
		touch-action: none;
		border-top: 1px solid var(--line);
	}
	.grip span {
		width: 44px;
		height: 5px;
		border-radius: 3px;
		background: color-mix(in srgb, var(--muted) 55%, transparent);
	}
	.zoom {
		position: absolute;
		right: 12px;
		top: 64px;
		display: flex;
		flex-direction: column;
		align-items: center;
		background: color-mix(in srgb, var(--surface) 92%, transparent);
		border: 1px solid var(--line);
		border-radius: 12px;
		padding: 2px;
		z-index: 3;
	}
	.zoom button {
		width: 34px;
		height: 34px;
		border: 0;
		background: none;
		border-radius: 9px;
		display: grid;
		place-items: center;
		cursor: pointer;
	}
	.zoom .g {
		border-top: 1px solid var(--line);
		border-radius: 0 0 9px 9px;
	}
	.zoom button[aria-pressed='true'] {
		color: var(--forest);
	}
	.zoom span {
		font-size: 10px;
		font-variant-numeric: tabular-nums;
		color: var(--muted);
	}
	.walk {
		height: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 6px;
		text-align: center;
		padding: 24px;
		color: var(--forest);
	}
	.walk p {
		max-width: 300px;
	}
	.summary {
		margin: 12px 4px;
		font-size: 14px;
		color: var(--muted);
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
