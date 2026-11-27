<script lang="ts">
	import { nav } from '#lib/stores/nav.svelte.ts';
	$effect(() => nav.set({ label: 'Units', href: '/' }, { label: 'New unit' }));
	import ComingSoon from '#lib/components/ComingSoon.svelte';
</script>

<svelte:head><title>New unit · RE:Aspect</title></svelte:head>
<h1>New unit</h1>
<ComingSoon
	icon="anchor"
	title="Anchor — set up a unit"
	phase="Phase 1"
	points={[
		'Upload everything you have: developer floor plan, Google Maps / satellite images, stack plan',
		'Unit number (e.g. #18-04), project name, floor level, ceiling height, size in sq ft',
		'AI traces walls, doors and windows and scales to the stated size — fix anything in Studio',
		'Line the plan up on the map and confirm which way is north',
		'Uploaded images are converted to our own compact format, then deleted'
	]}
/>
