<script lang="ts">
	import ComingSoon from '#lib/components/ComingSoon.svelte';
	import { profile } from '#lib/stores/profile.svelte.ts';
</script>

<svelte:head><title>3D · RE:Aspect</title></svelte:head>
<h1>3D</h1>
<ComingSoon
	icon="cube"
	title="3D view and walkthrough"
	phase="Phase 3"
	points={[
		'Orbit the unit in normal 3D perspective',
		'Walk through: joystick + drag on touch, WASD + mouse on PC',
		`Camera at your eye level (${profile.eyeLevelCm} cm) — change your height in Settings`,
		'Natural gestures — swipe left turns left, no inverted controls'
	]}
/>
