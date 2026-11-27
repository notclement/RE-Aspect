<script lang="ts">
	import SceneView from './SceneView.svelte';
	import { clamp, type PlanProps } from './types.ts';
	let {
		unit,
		sun,
		patches,
		dark,
		furniture,
		sunColor,
		showSun = false,
		grid = $bindable(true),
		onzoom,
	}: PlanProps = $props();
	let scale = $state(1),
		view: SceneView;
	export function zoomBy(f: number) {
		if (f > 0) {
			scale = clamp(scale * f, 0.7, 2.5);
			onzoom?.(scale);
		}
	}
	export function getScale() {
		return scale;
	}
	/** RE:Aspect: centre the unit and make it as big as fits, keeping the current viewing angle. */
	export function fit() {
		const f = view?.fitScale();
		scale = f ?? 1;
		onzoom?.(scale);
	}
	// RE:Aspect: open fitted (centred, as big as fits) once the 3D engine is ready.
	$effect(() => {
		let tries = 0;
		const id = setInterval(() => {
			const f = view?.fitScale();
			if (f || ++tries > 40) {
				clearInterval(id);
				if (f && scale === 1) {
					scale = f;
					onzoom?.(scale);
				}
			}
		}, 150);
		return () => clearInterval(id);
	});
	export function reset() {
		scale = 1;
		view?.reset();
	}
	// Getters preserve fine-grained prop invalidation when only zoom changes.
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
		get showSun() {
			return showSun;
		},
		get scale() {
			return scale;
		},
		eye: 169,
		speed: 1.3,
		sensitivity: 1,
	};
</script>

<SceneView bind:this={view} {settings} {grid} zoom={zoomBy} exit={() => {}} />
