<script lang="ts">
	import ComingSoon from '#lib/components/ComingSoon.svelte';
	import TimeSlider from '#lib/components/TimeSlider.svelte';

	let minutes = $state(16 * 60 + 30);
</script>

<svelte:head><title>Sun View · RE:Aspect</title></svelte:head>
<h1>Sun View</h1>
<ComingSoon
	icon="sun"
	title="DayTrace — sun through every room"
	phase="Phase 1"
	points={[
		'Top-down plan with live sun patches for any date and time',
		'Auto-play runs through the whole day in about 25 seconds',
		'Hidden “Sun Info” tab for the technical details',
		'Which walls get sun, and how it falls on your furniture'
	]}
/>
<div class="dock">
	<p class="muted">Try the time slider — it stays on screen in every view.</p>
	<TimeSlider bind:minutes />
</div>

<style>
	.dock {
		margin-top: 18px;
	}
</style>
