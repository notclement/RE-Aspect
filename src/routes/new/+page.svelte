<script lang="ts">
	/**
	 * New project wizard: Photos (≤15) → Details → Floor plan (pick + rotate north up) → Create.
	 * Photos are shrunk in the browser; they're only sent for processing, never stored on our servers.
	 * The rotated floor plan stays on this device (IndexedDB) as Studio's tracing backdrop.
	 */
	import { goto } from '$app/navigation';
	import Icon from '#lib/components/Icon.svelte';
	import Spinner from '#lib/components/Spinner.svelte';
	import { nav } from '#lib/stores/nav.svelte.ts';
	import { profile } from '#lib/stores/profile.svelte.ts';
	import { auth } from '#lib/stores/auth.svelte.ts';
	import { PLANS } from '#lib/config/plans.ts';
	import { PROPERTY_TYPES, type PropertyType } from '#lib/config/property-types.ts';
	import { createProject, updateProject, myProjects } from '#lib/stores/projects.svelte.ts';
	import { shrinkPhoto, rotateImage, type Shrunk } from '#lib/image.ts';
	import { saveFloorPlan } from '#lib/floorplan-store.ts';
	import { searchAddress, type Place } from '#lib/onemap.ts';
	import { validateProjectName, validateUnitNumber, validateFreeText, validateFloorLevel, validateSizeSqft, validateCeilingHeightM } from '#lib/validate.ts';
	import { getSupabase, supabaseConfigured } from '#lib/supabase.ts';
	import { sanitizePlan } from '#lib/plan.ts';

	$effect(() => nav.set({ label: 'New project' }));

	const MAX_PHOTOS = 15;
	const steps = ['Photos', 'Details', 'Floor plan'] as const;
	let step = $state(0);

	// ── Step 1: photos ───────────────────────────────────────────────────────
	interface Photo {
		id: string;
		img: Shrunk;
	}
	let photos = $state<Photo[]>([]);
	let adding = $state(0);
	let photoError = $state<string | null>(null);
	let fileInput = $state<HTMLInputElement>();

	async function addPhotos(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const files = [...(input.files ?? [])].filter((f) => f.type.startsWith('image/'));
		input.value = '';
		photoError = null;
		const room = MAX_PHOTOS - photos.length;
		if (files.length > room) photoError = `Only ${MAX_PHOTOS} photos per project — the first ${room} were added.`;
		const take = files.slice(0, room);
		adding += take.length;
		// One at a time keeps memory low on phones.
		for (const f of take) {
			try {
				if (f.size > 40 * 1024 * 1024) throw new Error('too big');
				const img = await shrinkPhoto(f, 2048);
				photos.push({ id: crypto.randomUUID(), img });
			} catch {
				photoError = 'One of the photos could not be read and was skipped.';
			}
			adding--;
		}
		if (!planId && photos.length) planId = photos[0].id;
	}
	function removePhoto(id: string) {
		photos = photos.filter((p) => p.id !== id);
		if (planId === id) planId = photos[0]?.id ?? null;
	}

	// ── Step 2: details ──────────────────────────────────────────────────────
	let name = $state('');
	let unitNo = $state('');
	let propertyType = $state<PropertyType>('hdb');
	let level = $state('');
	let size = $state('');
	let ceiling = $state('2.6');
	let addrQuery = $state('');
	let address = $state('');
	let place = $state<Place | null>(null);
	let results = $state<Place[]>([]);
	let searching = $state(false);
	let addrError = $state<string | null>(null);
	let errors = $state<Record<string, string | undefined>>({});
	let ceilingTouched = false;
	$effect(() => {
		const t = propertyType;
		if (!ceilingTouched) ceiling = t === 'hdb' ? '2.6' : '2.8';
	});

	let searchTimer: ReturnType<typeof setTimeout> | undefined;
	let ctrl: AbortController | null = null;
	function onAddrInput() {
		place = null;
		address = addrQuery;
		clearTimeout(searchTimer);
		searchTimer = setTimeout(async () => {
			ctrl?.abort();
			ctrl = new AbortController();
			searching = true;
			addrError = null;
			try {
				results = await searchAddress(addrQuery, ctrl.signal);
			} catch (e) {
				if ((e as Error).name !== 'AbortError') addrError = 'Address search is unavailable — you can still type the address.';
				results = [];
			}
			searching = false;
		}, 350);
	}
	function pickPlace(p: Place) {
		place = p;
		address = p.label;
		addrQuery = p.label;
		results = [];
		if (!name.trim()) {
			const blk = p.label.split(' SINGAPORE')[0];
			name = blk.length <= 60 ? blk.replace(/\b\w+/g, (w) => w[0] + w.slice(1).toLowerCase()) : '';
		}
	}

	function validateDetails() {
		const n = validateProjectName(name);
		const u = unitNo.trim() ? validateUnitNumber(unitNo) : ({ ok: true, value: '' } as const);
		const a = validateFreeText(address, { max: 120, label: 'Address' });
		const l = level.trim() ? validateFloorLevel(level) : ({ ok: true, value: null } as const);
		const s = validateSizeSqft(size);
		const c = validateCeilingHeightM(ceiling);
		errors = {
			name: n.ok ? undefined : n.error,
			unitNo: u.ok ? undefined : u.error,
			address: a.ok ? undefined : a.error,
			level: l.ok ? undefined : l.error,
			size: s.ok ? undefined : s.error,
			ceiling: c.ok ? undefined : c.error
		};
		if (!(n.ok && u.ok && a.ok && l.ok && s.ok && c.ok)) return null;
		return { name: n.value, unitNo: u.value, address: a.value, level: l.value, sizeSqft: s.value, ceilingCm: Math.round(c.value * 100) };
	}

	// ── Step 3: floor plan + north ───────────────────────────────────────────
	let planId = $state<string | null>(null);
	let turns = $state(0); // quarter turns
	let fine = $state(0); // −45…45°
	const angle = $derived(turns * 90 + fine);
	const planPhoto = $derived(photos.find((p) => p.id === planId) ?? null);

	// ── Create & process ─────────────────────────────────────────────────────
	let phase = $state<'edit' | 'creating' | 'processing'>('edit');
	let createError = $state<string | null>(null);
	const STAGES = ['Reading the floor plan…', 'Tracing walls and windows…', 'Placing furniture…', 'Almost done…'];
	let stage = $state(0);
	const plan = $derived(PLANS[profile.planId]);
	const atLimit = $derived(!!plan.includedUnits && myProjects.length >= plan.includedUnits);

	function next() {
		if (step === 0 && !photos.length) return void (photoError = 'Add at least the floor plan photo.');
		if (step === 1 && !validateDetails()) return;
		step++;
		window.scrollTo({ top: 0 });
	}

	async function create() {
		const d = validateDetails();
		if (!d) return void (step = 1);
		if (!planPhoto) return void (step = 2);
		phase = 'creating';
		createError = null;
		try {
			const rotated = await rotateImage(planPhoto.img.dataUrl, angle, 2048);
			const project = await createProject({
				...d,
				propertyType,
				description: '',
				notes: '',
				lat: place?.lat ?? null,
				lon: place?.lon ?? null
			});
			await saveFloorPlan(project.id, rotated);

			// AI processing (when signed in and an AI key is set up). Photos travel in the request only.
			if (supabaseConfigured && auth.status === 'signed-in') {
				phase = 'processing';
				updateProject(project.id, { status: 'processing' });
				const tick = setInterval(() => (stage = Math.min(STAGES.length - 1, stage + 1)), 6000);
				try {
					const interiors = await Promise.all(
						photos.filter((p) => p.id !== planId).map(async (p) => (await shrinkPhoto(p.img.dataUrl, 1024, 0.75)).dataUrl)
					);
					const sb = await getSupabase();
					const { data, error } = await sb.functions.invoke('process-project', {
						body: { projectId: project.id, floorPlan: rotated, interiors, sizeSqft: d.sizeSqft, propertyType, ceilingCm: d.ceilingCm }
					});
					if (error) throw error;
					const p = sanitizePlan((data as { plan?: unknown })?.plan);
					if (p && p.outline.length >= 3) {
						updateProject(project.id, { plan: p, status: 'ready' });
						clearInterval(tick);
						return void goto(`/studio?id=${project.id}&ai=ok`, { replaceState: true });
					}
					throw new Error('no plan');
				} catch {
					updateProject(project.id, { status: 'failed' });
				} finally {
					clearInterval(tick);
					photos = []; // drop the photos from memory once processing is over
				}
				return void goto(`/studio?id=${project.id}&ai=manual`, { replaceState: true });
			}
			photos = [];
			goto(`/studio?id=${project.id}`, { replaceState: true });
		} catch (e) {
			createError = e instanceof Error ? e.message : 'Could not create the project.';
			phase = 'edit';
		}
	}
</script>

<svelte:head><title>New project · RE:Aspect</title></svelte:head>

{#if phase !== 'edit'}
	<div class="busy">
		<Spinner size={28} />
		<h2>{phase === 'creating' ? 'Creating your project…' : STAGES[stage]}</h2>
		<p class="muted">{phase === 'processing' ? 'This usually takes under a minute. Your photos are deleted as soon as it’s done.' : ''}</p>
	</div>
{:else}
	<h1>New project</h1>
	<ol class="steps" aria-label="Steps">
		{#each steps as s, i (s)}
			<li class:on={i === step} class:done={i < step}>
				<button onclick={() => i < step && (step = i)} disabled={i > step}><span>{i < step ? '✓' : i + 1}</span>{s}</button>
			</li>
		{/each}
	</ol>

	{#if atLimit}
		<p class="card warn">You've used all {plan.includedUnits} projects on your plan. Delete a project to make room{plan.extraUnitOneOffSgd ? `, or add extra projects (S$${plan.extraUnitOneOffSgd} each) once payments open` : ''}.</p>
	{/if}

	{#if step === 0}
		<section>
			<p class="muted lead">Add the <strong>developer's floor plan</strong>, plus anything that helps: site plan or location map (for north), and interior photos (we'll use them to place furniture). Up to {MAX_PHOTOS} photos.</p>
			<div class="grid">
				{#each photos as p (p.id)}
					<figure class:plan={p.id === planId}>
						<img src={p.img.dataUrl} alt="" decoding="async" />
						<button class="x" onclick={() => removePhoto(p.id)} aria-label="Remove photo"><Icon name="close" size={16} /></button>
					</figure>
				{/each}
				{#each Array(adding) as _, i (i)}<figure class="loading"><Spinner size={18} /></figure>{/each}
				{#if photos.length + adding < MAX_PHOTOS}
					<button class="add" onclick={() => fileInput?.click()}><Icon name="camera" size={26} /><span>Add photos</span></button>
				{/if}
			</div>
			<input bind:this={fileInput} type="file" accept="image/*" multiple hidden onchange={addPhotos} />
			<p class="muted count">{photos.length} / {MAX_PHOTOS} · shrunk on your device before anything is sent</p>
			{#if photoError}<p class="error">{photoError}</p>{/if}
		</section>
	{:else if step === 1}
		<section class="form">
			<div class="field">
				<label for="addr">Address or postal code</label>
				<input id="addr" autocomplete="off" maxlength="120" placeholder="e.g. 392088 or 88B Jalan Satu" bind:value={addrQuery} oninput={onAddrInput} />
				{#if searching}<span class="muted small">Searching…</span>{/if}
				{#if results.length}
					<ul class="results">
						{#each results as r (r.label)}
							<li><button type="button" onclick={() => pickPlace(r)}><Icon name="pin" size={16} />{r.label}</button></li>
						{/each}
					</ul>
				{/if}
				{#if place}<span class="ok small">✓ Location found — used for the sun position</span>{/if}
				{#if addrError}<span class="muted small">{addrError}</span>{/if}
				{#if errors.address}<span class="error">{errors.address}</span>{/if}
			</div>
			<div class="field">
				<label for="pname">Project name</label>
				<input id="pname" maxlength="60" placeholder="e.g. Dakota One #10-125" bind:value={name} />
				{#if errors.name}<span class="error">{errors.name}</span>{/if}
			</div>
			<div class="row2">
				<div class="field">
					<label for="unit">Unit number</label>
					<input id="unit" maxlength="10" placeholder="#12-04" bind:value={unitNo} />
					{#if errors.unitNo}<span class="error">{errors.unitNo}</span>{/if}
				</div>
				<div class="field">
					<label for="lvl">Floor level</label>
					<input id="lvl" inputmode="numeric" maxlength="3" placeholder="12" bind:value={level} />
					{#if errors.level}<span class="error">{errors.level}</span>{/if}
				</div>
			</div>
			<div class="field">
				<label for="type">Type</label>
				<select id="type" bind:value={propertyType}>
					{#each PROPERTY_TYPES as t (t.id)}<option value={t.id}>{t.label}</option>{/each}
				</select>
			</div>
			<div class="row2">
				<div class="field">
					<label for="size">Size (sq ft)</label>
					<input id="size" inputmode="numeric" maxlength="6" placeholder="732" bind:value={size} />
					{#if errors.size}<span class="error">{errors.size}</span>{:else}<span class="muted small">Sets the plan's scale</span>{/if}
				</div>
				<div class="field">
					<label for="ceil">Ceiling (m)</label>
					<input id="ceil" inputmode="decimal" maxlength="4" bind:value={ceiling} oninput={() => (ceilingTouched = true)} />
					{#if errors.ceiling}<span class="error">{errors.ceiling}</span>{/if}
				</div>
			</div>
		</section>
	{:else}
		<section>
			<p class="muted lead">Tap the <strong>floor plan</strong>, then turn it so the unit's <strong>north points up</strong>. Tip: use the north arrow on the site plan or location map.</p>
			<div class="pick">
				{#each photos as p (p.id)}
					<button class:on={p.id === planId} onclick={() => ((planId = p.id), (turns = 0), (fine = 0))} aria-label="Use as floor plan">
						<img src={p.img.dataUrl} alt="" decoding="async" />
						{#if p.id === planId}<span class="badge">Floor plan</span>{/if}
					</button>
				{/each}
			</div>
			{#if planPhoto}
				<div class="stage">
					<div class="north" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22"><path d="M12 2l7 19-7-5-7 5z" fill="currentColor" /></svg>N</div>
					<img src={planPhoto.img.dataUrl} alt="Floor plan" style:transform="rotate({angle}deg)" />
				</div>
				<div class="rot">
					<button class="btn" onclick={() => (turns = (turns + 3) % 4)} aria-label="Turn left 90°"><span class="flip"><Icon name="back" size={18} /></span>90°</button>
					<input type="range" min="-45" max="45" step="0.5" bind:value={fine} aria-label="Fine turn" />
					<button class="btn" onclick={() => (turns = (turns + 1) % 4)} aria-label="Turn right 90°">90°<span class="flip r"><Icon name="back" size={18} /></span></button>
				</div>
				<p class="muted small center">{angle === 0 ? 'Not turned' : `Turned ${angle > 0 ? angle : 360 + angle}° clockwise`} · <button class="link" onclick={() => ((turns = 0), (fine = 0))}>Reset</button></p>
			{/if}
			{#if createError}<p class="error">{createError}</p>{/if}
		</section>
	{/if}

	<div class="nav">
		{#if step > 0}<button class="btn" onclick={() => step--}>Back</button>{:else}<span></span>{/if}
		{#if step < steps.length - 1}
			<button class="btn primary" onclick={next} disabled={adding > 0}>Next</button>
		{:else}
			<button class="btn primary" onclick={create} disabled={!planPhoto || atLimit}>Create project</button>
		{/if}
	</div>
{/if}

<style>
	h1 {
		margin: 6px 0 10px;
	}
	.steps {
		list-style: none;
		display: flex;
		gap: 6px;
		padding: 0;
		margin: 0 0 16px;
	}
	.steps li {
		flex: 1;
	}
	.steps button {
		width: 100%;
		min-height: 44px;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		border: 0;
		border-bottom: 3px solid var(--line);
		background: none;
		color: var(--muted);
		font-weight: 600;
		font-size: 14px;
		cursor: pointer;
	}
	.steps button span {
		width: 22px;
		height: 22px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		font-size: 12px;
		background: var(--surface-2);
	}
	.steps .on button {
		color: var(--text);
		border-color: var(--forest);
	}
	.steps .on button span,
	.steps .done button span {
		background: var(--forest);
		color: var(--on-primary);
	}
	.steps .done button {
		border-color: var(--forest);
	}
	.lead {
		margin: 0 0 14px;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
		gap: 8px;
	}
	figure,
	.add {
		position: relative;
		margin: 0;
		aspect-ratio: 1;
		border-radius: var(--radius-sm);
		overflow: hidden;
		background: var(--surface-2);
	}
	figure img,
	.pick img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}
	figure.loading {
		display: grid;
		place-items: center;
	}
	.x {
		position: absolute;
		top: 4px;
		right: 4px;
		width: 32px;
		height: 32px;
		border-radius: 50%;
		border: 0;
		background: rgba(0, 0, 0, 0.55);
		color: #fff;
		display: grid;
		place-items: center;
		cursor: pointer;
	}
	.x::before {
		content: '';
		position: absolute;
		inset: -6px;
	}
	.add {
		border: 2px dashed var(--line);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 4px;
		color: var(--forest);
		font-weight: 600;
		font-size: 13px;
		cursor: pointer;
	}
	.count {
		font-size: 13px;
		margin: 10px 0 0;
	}
	.error {
		color: #b5483a;
		font-size: 13px;
	}
	.ok {
		color: #2a8a50;
	}
	.small {
		font-size: 12px;
	}
	.warn {
		background: var(--ochre-soft);
		color: var(--text);
		margin-bottom: 14px;
	}
	.form select {
		min-height: 44px;
		padding: 0 10px;
		border-radius: var(--radius-sm);
		border: 1px solid var(--line);
		background: var(--surface);
		font-size: 16px;
	}
	.row2 {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 10px;
	}
	.results {
		list-style: none;
		margin: 4px 0 0;
		padding: 4px;
		border: 1px solid var(--line);
		border-radius: var(--radius-sm);
		background: var(--surface);
	}
	.results button {
		width: 100%;
		min-height: 44px;
		display: flex;
		align-items: center;
		gap: 8px;
		text-align: left;
		border: 0;
		background: none;
		border-radius: 8px;
		padding: 6px 8px;
		font-size: 14px;
		cursor: pointer;
	}
	.results button:hover {
		background: var(--surface-2);
	}
	.pick {
		display: flex;
		gap: 8px;
		overflow-x: auto;
		padding-bottom: 6px;
		margin-bottom: 12px;
	}
	.pick button {
		position: relative;
		flex: 0 0 72px;
		height: 72px;
		padding: 0;
		border: 2px solid transparent;
		border-radius: var(--radius-sm);
		overflow: hidden;
		cursor: pointer;
		background: var(--surface-2);
	}
	.pick button.on {
		border-color: var(--forest);
	}
	.badge {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		font-size: 10px;
		font-weight: 700;
		background: var(--forest);
		color: var(--on-primary);
	}
	.stage {
		position: relative;
		height: min(62vh, 460px);
		display: grid;
		place-items: center;
		overflow: hidden;
		background: var(--canvas);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		background-image: linear-gradient(var(--line) 1px, transparent 1px), linear-gradient(90deg, var(--line) 1px, transparent 1px);
		background-size: 40px 40px;
		background-position: center;
	}
	.stage img {
		max-width: 78%;
		max-height: 78%;
		transition: transform 0.15s ease-out;
		box-shadow: 0 2px 10px rgba(0, 0, 0, 0.12);
		background: #fff;
	}
	.north {
		position: absolute;
		top: 8px;
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		flex-direction: column;
		align-items: center;
		font-weight: 700;
		font-size: 12px;
		color: var(--forest);
		z-index: 1;
	}
	.rot {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-top: 12px;
	}
	.rot input {
		flex: 1;
		accent-color: var(--forest);
	}
	.flip {
		display: inline-grid;
		transform: rotate(90deg);
	}
	.flip.r {
		transform: rotate(90deg) scaleY(-1);
	}
	.center {
		text-align: center;
	}
	.link {
		border: 0;
		background: none;
		color: var(--forest);
		font-weight: 600;
		cursor: pointer;
		padding: 0;
		font-size: inherit;
	}
	.nav {
		position: sticky;
		bottom: 0;
		display: flex;
		justify-content: space-between;
		gap: 10px;
		padding: 14px 0 calc(6px + var(--safe-b));
		background: linear-gradient(transparent, var(--paper) 30%);
		margin-top: 16px;
	}
	.busy {
		min-height: 60vh;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		text-align: center;
		gap: 10px;
	}
	.busy h2 {
		font-family: var(--serif);
		font-weight: var(--heading-weight);
		margin: 8px 0 0;
	}
	.busy p {
		max-width: 340px;
	}
</style>
