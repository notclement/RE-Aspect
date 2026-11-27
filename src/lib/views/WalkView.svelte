<script lang="ts">
	import SceneView from './SceneView.svelte';
	import type { WalkProps } from './types.ts';
	let {
		unit,
		sun,
		patches,
		dark,
		furniture,
		sunColor,
		eyeLevelCm,
		walkSpeed,
		lookSensitivity,
		onexit,
	}: WalkProps = $props();
	const settings = {
		get unit() {
			return unit;
		},
		get sun() {
			return sun;
		},
		get patches() {
			return patches;
		},
		get dark() {
			return dark;
		},
		get furniture() {
			return furniture;
		},
		get sunColor() {
			return sunColor;
		},
		get eye() {
			return eyeLevelCm;
		},
		get speed() {
			return walkSpeed;
		},
		get sensitivity() {
			return lookSensitivity;
		},
		scale: 1,
		showSun: false,
	};
</script>

<SceneView {settings} walk zoom={() => {}} exit={() => onexit?.()} />
