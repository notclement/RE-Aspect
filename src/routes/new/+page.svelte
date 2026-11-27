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
	import { fnError } from '#lib/fn-error.ts';
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
	const steps = ['Photos', 'Details', 'Floor plan', 'Review'] as const;
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

	let dragging = $state(false);
	function addPhotos(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const files = [...(input.files ?? [])];
		input.value = '';
		void addFiles(files);
	}
	function onDrop(e: DragEvent) {
		e.preventDefault();
		dragging = false;
		void addFiles([...(e.dataTransfer?.files ?? [])]);
	}
	async function addFiles(all: File[]) {
		const files = all.filter((f) => f.type.startsWith('image/'));
		photoError = all.length && !files.length ? 'Only photos and images can be added.' : null;
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
	// Searches when a full 6-digit postal code is typed, on Enter, or with the Search button (not on every key).
	function onAddrInput() {
		place = null;
		address = addrQuery;
		clearTimeout(searchTimer);
		if (/^\d{6}$/.test(addrQuery.trim())) searchTimer = setTimeout(runSearch, 250);
	}
	async function runSearch() {
		if (addrQuery.trim().length < 3) return;
		ctrl?.abort();
		ctrl = new AbortController();
		searching = true;
		addrError = null;
		try {
			results = await searchAddress(addrQuery, ctrl.signal);
			if (!results.length) addrError = 'No matches — check the postal code, or just type the address.';
		} catch (e) {
			if ((e as Error).name !== 'AbortError') addrError = (e as Error).message || 'Address search is unavailable — you can still type the address.';
			results = [];
		}
		searching = false;
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
		// Every field is required.
		const n = validateProjectName(name);
		const l = level.trim() ? validateFloorLevel(level) : ({ ok: false, error: 'Please enter the floor level.' } as const);
		const u = validateUnitNumber(unitNo, l.ok ? l.value : null);
		const a0 = validateFreeText(address, { max: 120, label: 'Address' });
		const a = a0.ok && !a0.value ? ({ ok: false, error: 'Please enter the address or postal code.' } as const) : a0;
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
	const STAGES = ['Reading the floor plan…', 'Tracing the walls…', 'Naming the rooms…', 'Almost done…'];
	let stage = $state(0);
	const plan = $derived(PLANS[profile.planId]);
	const atLimit = $derived(!!plan.includedUnits && myProjects.length >= plan.includedUnits);

	function next() {
		if (step === 0 && !photos.length) return void (photoError = 'Add at least the floor plan photo.');
		if (step === 1 && !validateDetails()) return;
		if (step === 2 && !planPhoto) return;
		step++;
		window.scrollTo({ top: 0 });
		if (step === 2) void detectNorth();
	}

	// ── AI north check: look at all photos for north arrows / site plans, pre-turn the plan ─────────
	type North = { state: 'idle' | 'checking' | 'found' | 'none' | 'failed' | 'off'; angle: number; confidence: string; evidence: string; forPlan: string | null; detail?: string };
	let north = $state<North>({ state: 'idle', angle: 0, confidence: '', evidence: '', forPlan: null });
	let userTurned = $state(false);
	function setAngle(a: number) {
		const n = ((a % 360) + 360) % 360;
		const q = Math.round(n / 90);
		turns = q % 4;
		fine = Math.max(-45, Math.min(45, n - q * 90));
	}
	const suggestionApplied = $derived(north.state === 'found' && ((((angle % 360) + 360) % 360) === north.angle));
	async function detectNorth() {
		const pid = planId;
		if (!pid || !planPhoto || north.forPlan === pid) return;
		if (!supabaseConfigured || auth.status !== 'signed-in') return void (north = { ...north, state: 'off', forPlan: pid });
		north = { state: 'checking', angle: 0, confidence: '', evidence: '', forPlan: pid };
		try {
			const floorPlan = (await shrinkPhoto(planPhoto.img.dataUrl, 1536, 0.8)).dataUrl;
			// Every other photo (up to 14), smaller, so the AI can combine all the clues.
			const others = await Promise.all(
				photos.filter((p) => p.id !== pid).map(async (p) => (await shrinkPhoto(p.img.dataUrl, 900, 0.7)).dataUrl)
			);
			const l = level.trim() ? validateFloorLevel(level) : null;
			const context = {
				address: address.trim().slice(0, 120),
				unitNo: unitNo.trim().slice(0, 12),
				level: l && l.ok ? l.value : null,
				propertyType,
				lat: place?.lat ?? null,
				lon: place?.lon ?? null
			};
			const sb = await getSupabase();
			const { data, error } = await sb.functions.invoke('detect-north', { body: { floorPlan, others, context } });
			if (planId !== pid) return; // user picked another photo meanwhile
			const d = (data ?? {}) as { found?: boolean; angle?: number; confidence?: string; evidence?: string; reason?: string; provider?: string; detail?: string };
			if (error || d.reason === 'error') {
				const detail = error ? await fnError(error) : `${d.provider ?? 'AI'}: ${d.detail ?? 'error'}`;
				console.warn('[detect-north]', detail);
				north = { state: 'failed', angle: 0, confidence: '', evidence: '', forPlan: pid, detail: detail.slice(0, 240) };
				return;
			}
			if (!d.found || !Number.isFinite(d.angle)) {
				north = { state: d.reason === 'no-key' ? 'off' : 'none', angle: 0, confidence: '', evidence: String(d.evidence ?? ''), forPlan: pid };
				return;
			}
			north = { state: 'found', angle: Number(d.angle), confidence: String(d.confidence ?? 'low'), evidence: String(d.evidence ?? '').slice(0, 240), forPlan: pid };
			if (!userTurned) setAngle(north.angle);
		} catch {
			if (planId === pid) north = { ...north, state: 'off', forPlan: pid };
		}
	}
	function pickPlan(id: string) {
		if (planId === id) return;
		planId = id;
		turns = 0;
		fine = 0;
		userTurned = false;
		void detectNorth();
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
			await saveFloorPlan(project.id, { ...rotated, original: planPhoto.img.dataUrl, angle });

			// AI processing (when signed in and an AI key is set up). Photos travel in the request only.
			if (supabaseConfigured && auth.status === 'signed-in') {
				phase = 'processing';
				updateProject(project.id, { status: 'processing' });
				const tick = setInterval(() => (stage = Math.min(STAGES.length - 1, stage + 1)), 6000);
				try {
					// Fast trace: walls only, from a smaller copy of the plan (windows are added in Studio).
					const small = await shrinkPhoto(rotated.dataUrl, 1400, 0.85);
					const sb = await getSupabase();
					const { data, error } = await sb.functions.invoke('process-project', {
						body: { projectId: project.id, floorPlan: small, sizeSqft: d.sizeSqft, propertyType, ceilingCm: d.ceilingCm }
					});
					if (error) throw new Error(await fnError(error));
					const p = sanitizePlan((data as { plan?: unknown })?.plan);
					// The AI saw the smaller copy: convert its scale to the full-size photo kept on this device.
					if (p?.imageScale) p.imageScale = Math.round(p.imageScale * (small.w / rotated.w) * 10000) / 10000;
					if (p && p.outline.length >= 3) {
						updateProject(project.id, { plan: p, status: 'ready' });
						clearInterval(tick);
						return void goto(`/studio?id=${project.id}&ai=ok`, { replaceState: true });
					}
					throw new Error('no plan');
				} catch (e) {
					console.warn('[process-project]', e instanceof Error ? e.message : e);
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
			{#if photos.length + adding < MAX_PHOTOS}
				<button
					class="drop"
					class:over={dragging}
					onclick={() => fileInput?.click()}
					ondragover={(e) => (e.preventDefault(), (dragging = true))}
					ondragleave={() => (dragging = false)}
					ondrop={onDrop}
				>
					<Icon name="camera" size={34} />
					<strong>{dragging ? 'Drop the photos here' : 'Drag & drop photos here'}</strong>
					<span class="muted">or tap to choose · up to {MAX_PHOTOS - photos.length} more</span>
				</button>
			{/if}
			{#if photos.length || adding}
				<div class="grid">
					{#each photos as p (p.id)}
						<figure>
							<img src={p.img.dataUrl} alt="" decoding="async" />
							<button class="x" onclick={() => removePhoto(p.id)} aria-label="Remove photo"><Icon name="close" size={16} /></button>
						</figure>
					{/each}
					{#each Array(adding) as _, i (i)}<figure class="loading"><Spinner size={18} /></figure>{/each}
				</div>
			{/if}
			<input bind:this={fileInput} type="file" accept="image/*" multiple hidden onchange={addPhotos} />
			<p class="muted count">{photos.length} / {MAX_PHOTOS} · shrunk on your device before anything is sent</p>
			{#if photoError}<p class="error">{photoError}</p>{/if}
		</section>
	{:else if step === 1}
		<section class="form">
			<div class="field">
				<label for="addr">Address or postal code</label>
				<div class="searchrow">
					<input
						id="addr"
						autocomplete="off"
						maxlength="120"
						placeholder="Type here…"
						bind:value={addrQuery}
						oninput={onAddrInput}
						onkeydown={(e) => e.key === 'Enter' && (e.preventDefault(), runSearch())}
					/>
					<button type="button" class="btn" onclick={runSearch} disabled={searching || addrQuery.trim().length < 3}>Search</button>
				</div>
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
				<input id="pname" maxlength="60" placeholder="Type here…" bind:value={name} />
				{#if errors.name}<span class="error">{errors.name}</span>{/if}
			</div>
			<div class="row2">
				<div class="field">
					<label for="unit">Unit number</label>
					<input id="unit" maxlength="10" placeholder="Type here…" bind:value={unitNo} />
					{#if errors.unitNo}<span class="error">{errors.unitNo}</span>{/if}
				</div>
				<div class="field">
					<label for="lvl">Floor level</label>
					<input id="lvl" inputmode="numeric" maxlength="3" placeholder="Type here…" bind:value={level} />
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
					<input id="size" inputmode="numeric" maxlength="6" placeholder="Type here…" bind:value={size} />
					{#if errors.size}<span class="error">{errors.size}</span>{:else}<span class="muted small">Sets the plan's scale</span>{/if}
				</div>
				<div class="field">
					<label for="ceil">Ceiling (m)</label>
					<input id="ceil" inputmode="decimal" maxlength="4" placeholder="Type here…" bind:value={ceiling} oninput={() => (ceilingTouched = true)} />
					{#if errors.ceiling}<span class="error">{errors.ceiling}</span>{/if}
				</div>
			</div>
		</section>
	{:else if step === 2}
		<section>
			<p class="muted lead">Tap the <strong>floor plan</strong>, then turn it so the unit's <strong>north points up</strong>.</p>
			<div class="pick">
				{#each photos as p (p.id)}
					<button class:on={p.id === planId} onclick={() => pickPlan(p.id)} aria-label="Use as floor plan">
						<img src={p.img.dataUrl} alt="" decoding="async" />
						{#if p.id === planId}<span class="badge">Floor plan</span>{/if}
					</button>
				{/each}
			</div>
			{#if planPhoto}
				{#if north.state === 'checking'}
					<div class="ai checking"><Spinner size={16} /><span>Looking at all {photos.length} photo{photos.length === 1 ? '' : 's'} to work out where north is…</span></div>
				{:else if north.state === 'found'}
					<div class="ai found">
						<Icon name="check" size={18} />
						<div>
							<strong>{suggestionApplied ? 'Turned for you' : 'Suggested turn'}: {north.angle}° clockwise</strong>
							<span>Based on the {photos.length} image{photos.length === 1 ? '' : 's'} provided{north.evidence ? `: ${north.evidence}` : ''}</span>
							<span class="conf c-{north.confidence}">{north.confidence === 'high' ? 'High confidence' : north.confidence === 'medium' ? 'Medium confidence' : 'Low confidence — please check'} · adjust if needed, or just tap Next.</span>
						</div>
						{#if !suggestionApplied}<button class="btn" onclick={() => setAngle(north.angle)}>Apply</button>{/if}
					</div>
				{:else if north.state === 'failed'}
					<div class="ai none"><Icon name="info" size={18} /><span>The AI couldn't check the photos right now — please turn the plan yourself.{#if profile.data.isAdmin && north.detail}<br /><small class="muted">Admin: {north.detail}</small>{/if}</span></div>
				{:else if north.state === 'none'}
					<div class="ai none"><Icon name="info" size={18} /><span>The photos didn't give enough clues to work out north — please turn the plan yourself. Tip: add a site plan or location map with a north arrow.</span></div>
				{:else}
					<p class="muted small tip">Tip: use the north arrow on the site plan or location map.</p>
				{/if}
				<div class="stage">
					<div class="north" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22"><path d="M12 2l7 19-7-5-7 5z" fill="currentColor" /></svg>N</div>
					<img src={planPhoto.img.dataUrl} alt="Floor plan" style:transform="rotate({angle}deg)" />
				</div>
				<div class="rot">
					<button class="btn" onclick={() => ((turns = (turns + 3) % 4), (userTurned = true))} aria-label="Turn left 90°"><span class="flip"><Icon name="back" size={18} /></span>90°</button>
					<input type="range" min="-45" max="45" step="0.5" bind:value={fine} oninput={() => (userTurned = true)} aria-label="Fine turn" />
					<button class="btn" onclick={() => ((turns = (turns + 1) % 4), (userTurned = true))} aria-label="Turn right 90°">90°<span class="flip r"><Icon name="back" size={18} /></span></button>
				</div>
				<p class="muted small center">{angle === 0 ? 'Not turned' : `Turned ${((angle % 360) + 360) % 360}° clockwise`} · <button class="link" onclick={() => ((turns = 0), (fine = 0), (userTurned = true))}>Reset</button></p>
			{/if}
		</section>
	{:else}
		<section class="review">
			<p class="muted lead">Check everything, then create the project.</p>
			<div class="card rv">
				{#if planPhoto}
					<div class="rvimg"><img src={planPhoto.img.dataUrl} alt="Floor plan" style:transform="rotate({angle}deg)" /><span class="n">N ↑</span></div>
				{/if}
				<dl>
					<dt>Name</dt><dd>{name || '—'}</dd>
					<dt>Address</dt><dd>{address || '—'}{#if place}<span class="ok small"> · location found</span>{/if}</dd>
					<dt>Unit</dt><dd>{[unitNo, level ? `Level ${level}` : ''].filter(Boolean).join(' · ') || '—'}</dd>
					<dt>Type</dt><dd>{PROPERTY_TYPES.find((t) => t.id === propertyType)?.label}</dd>
					<dt>Size</dt><dd>{size ? `${size} sq ft` : '—'} · ceiling {ceiling} m</dd>
					<dt>Photos</dt><dd>{photos.length} (floor plan + {photos.length - 1} more)</dd>
					<dt>North</dt><dd>Plan turned {((angle % 360) + 360) % 360}° clockwise{north.state === 'found' && suggestionApplied ? ' (AI suggestion)' : ''}</dd>
				</dl>
				<div class="rvlinks">
					<button class="link" onclick={() => (step = 1)}>Edit details</button>
					<button class="link" onclick={() => (step = 2)}>Edit floor plan</button>
				</div>
			</div>
			<p class="muted small">Next, the AI traces walls and windows and places furniture, then Studio opens so you can check it. Your photos are deleted as soon as that's done.</p>
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
		white-space: nowrap;
		cursor: pointer;
	}
	@media (max-width: 420px) {
		.steps {
			gap: 3px;
		}
		.steps button {
			font-size: 12.5px;
			gap: 4px;
		}
		.steps button span {
			width: 20px;
			height: 20px;
		}
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
	.drop {
		width: 100%;
		min-height: 220px;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 8px;
		border: 2px dashed var(--line);
		border-radius: var(--radius);
		background: var(--surface);
		color: var(--forest);
		cursor: pointer;
		margin-bottom: 12px;
		transition: border-color 0.15s, background 0.15s;
	}
	.drop strong {
		font-size: 17px;
		color: var(--text);
	}
	.drop .muted {
		font-size: 13px;
	}
	.drop:hover,
	.drop.over {
		border-color: var(--forest);
		background: color-mix(in srgb, var(--forest) 7%, var(--surface));
	}
	figure {
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
	.ai {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		padding: 10px 12px;
		border-radius: var(--radius-sm);
		margin-bottom: 10px;
		font-size: 13px;
		line-height: 1.4;
	}
	.ai > div {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.ai strong {
		font-size: 14px;
	}
	.ai .btn {
		min-height: 40px;
		align-self: center;
	}
	.ai.checking {
		align-items: center;
		background: var(--surface-2);
		color: var(--muted);
	}
	.ai.found {
		background: color-mix(in srgb, var(--forest) 12%, var(--surface));
		color: var(--text);
		border: 1px solid color-mix(in srgb, var(--forest) 35%, transparent);
	}
	.ai.found > :global(svg) {
		color: var(--forest);
		margin-top: 2px;
	}
	.conf {
		font-size: 12px;
		font-weight: 600;
	}
	.c-high {
		color: #2a8a50;
	}
	.c-medium {
		color: var(--ochre);
	}
	.c-low {
		color: #b5483a;
	}
	.ai.none {
		background: var(--ochre-soft);
	}
	.tip {
		margin: 0 0 10px;
	}
	.rv {
		display: grid;
		grid-template-columns: 140px 1fr;
		gap: 16px;
		align-items: start;
	}
	.rvimg {
		position: relative;
		aspect-ratio: 1;
		display: grid;
		place-items: center;
		overflow: hidden;
		border-radius: var(--radius-sm);
		background: var(--canvas);
	}
	.rvimg img {
		max-width: 80%;
		max-height: 80%;
		background: #fff;
	}
	.rvimg .n {
		position: absolute;
		top: 4px;
		left: 50%;
		transform: translateX(-50%);
		font-size: 11px;
		font-weight: 700;
		color: var(--forest);
	}
	.rv dl {
		display: grid;
		grid-template-columns: 80px 1fr;
		gap: 6px 10px;
		margin: 0;
		font-size: 14px;
	}
	.rv dt {
		color: var(--muted);
	}
	.rv dd {
		margin: 0;
		overflow-wrap: anywhere;
	}
	.rvlinks {
		grid-column: 1 / -1;
		display: flex;
		gap: 16px;
	}
	.rvlinks .link {
		min-height: 44px;
	}
	@media (max-width: 520px) {
		.rv {
			grid-template-columns: 1fr;
		}
		.rvimg {
			max-width: 200px;
		}
	}
	.searchrow {
		display: flex;
		gap: 8px;
	}
	.searchrow input {
		flex: 1;
		min-width: 0;
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
