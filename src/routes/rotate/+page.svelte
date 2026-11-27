<script lang="ts">
	/**
	 * Re-rotate a project's floor plan (back from Studio). Uses the original photo kept on this device,
	 * so turning it again never loses quality. If an outline was traced on the old rotation, the
	 * outline, walls and windows are cleared (furniture is kept) because they no longer line up.
	 */
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import Icon from '#lib/components/Icon.svelte';
	import Spinner from '#lib/components/Spinner.svelte';
	import { nav } from '#lib/stores/nav.svelte.ts';
	import { getProject, updateProject } from '#lib/stores/projects.svelte.ts';
	import { loadFloorPlan, saveFloorPlan, type FloorPlanImage } from '#lib/floorplan-store.ts';
	import { rotateImage } from '#lib/image.ts';
	import { sanitizePlan, emptyPlan } from '#lib/plan.ts';

	const id = page.url.searchParams.get('id');
	const project = getProject(id);
	$effect(() => nav.set({ label: 'Projects', href: '/' }, { label: project?.name ?? 'Project' }, { label: 'Rotate plan' }));

	let img = $state<FloorPlanImage | null>(null);
	let loading = $state(true);
	let turns = $state(0);
	let fine = $state(0);
	let saving = $state(false);
	const angle = $derived(turns * 90 + fine);
	const traced = $derived((project?.plan?.outline.length ?? 0) >= 3 || (project?.plan?.walls.length ?? 0) > 0);

	onMount(async () => {
		if (project) {
			img = await loadFloorPlan(project.id);
			const a = img?.angle ?? 0;
			turns = Math.round(a / 90);
			fine = Math.max(-45, Math.min(45, a - turns * 90));
		}
		loading = false;
	});

	async function save() {
		if (!project || !img) return;
		saving = true;
		const src = img.original ?? img.dataUrl;
		const base = img.original ? 0 : (img.angle ?? 0);
		const rotated = await rotateImage(src, img.original ? angle : angle - base, 2048);
		await saveFloorPlan(project.id, { ...rotated, original: img.original ?? img.dataUrl, angle: img.original ? angle : angle - base });
		const changed = angle !== (img.angle ?? 0);
		if (changed && traced) {
			const p = sanitizePlan(project.plan) ?? emptyPlan();
			updateProject(project.id, { plan: { ...emptyPlan(), items: p.items }, status: 'draft' });
		}
		goto(`/studio?id=${project.id}`, { replaceState: true });
	}
</script>

<svelte:head><title>Rotate plan · RE:Aspect</title></svelte:head>

{#if loading}
	<div class="center"><Spinner /></div>
{:else if !project || !img}
	<div class="card">
		<p class="muted">The floor plan photo is only kept on the device you created the project on, so it can't be rotated here.</p>
		<a class="btn" href={project ? `/studio?id=${project.id}` : '/'}>Back</a>
	</div>
{:else}
	<h1>Rotate the floor plan</h1>
	<p class="muted lead">Turn it so the unit's <strong>north points up</strong>.</p>
	<div class="stage">
		<div class="north" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22"><path d="M12 2l7 19-7-5-7 5z" fill="currentColor" /></svg>N</div>
		<img src={img.original ?? img.dataUrl} alt="Floor plan" style:transform="rotate({img.original ? angle : angle - (img.angle ?? 0)}deg)" />
	</div>
	<div class="rot">
		<button class="btn" onclick={() => (turns = (turns + 3) % 4)} aria-label="Turn left 90°">⟲ 90°</button>
		<input type="range" min="-45" max="45" step="0.5" bind:value={fine} aria-label="Fine turn" />
		<button class="btn" onclick={() => (turns = (turns + 1) % 4)} aria-label="Turn right 90°">90° ⟳</button>
	</div>
	{#if traced && angle !== (img.angle ?? 0)}
		<p class="warn">Saving a new rotation clears the outline, walls and windows you traced (furniture stays), because they won't line up any more.</p>
	{/if}
	<div class="nav">
		<a class="btn" href="/studio?id={project.id}"><Icon name="back" size={18} />Back to Studio</a>
		<button class="btn primary" onclick={save} disabled={saving}>{saving ? 'Saving…' : 'Use this rotation'}</button>
	</div>
{/if}

<style>
	h1 {
		margin: 6px 0 4px;
	}
	.lead {
		margin: 0 0 12px;
	}
	.center {
		display: grid;
		place-items: center;
		min-height: 50vh;
	}
	.stage {
		position: relative;
		height: min(62vh, 460px);
		display: grid;
		place-items: center;
		overflow: hidden;
		border: 1px solid var(--line);
		border-radius: var(--radius);
		background-color: var(--canvas);
		background-image: linear-gradient(var(--line) 1px, transparent 1px), linear-gradient(90deg, var(--line) 1px, transparent 1px);
		background-size: 40px 40px;
		background-position: center;
	}
	.stage img {
		max-width: 78%;
		max-height: 78%;
		background: #fff;
		transition: transform 0.15s ease-out;
		box-shadow: 0 2px 10px rgba(0, 0, 0, 0.12);
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
	.warn {
		background: var(--ochre-soft);
		border-radius: var(--radius-sm);
		padding: 10px 12px;
		font-size: 13px;
	}
	.nav {
		display: flex;
		justify-content: space-between;
		gap: 10px;
		margin-top: 16px;
	}
</style>
