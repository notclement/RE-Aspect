<script lang="ts">
	import { onMount } from 'svelte';
	import type { Settings, create } from './engine.ts';
	let {
		settings,
		walk = false,
		grid = false,
		zoom,
		exit,
	}: {
		settings: Settings;
		walk?: boolean;
		grid?: boolean;
		zoom: (f: number) => void;
		exit: () => void;
	} = $props();
	let canvas: HTMLCanvasElement,
		stick: HTMLDivElement,
		engine: ReturnType<typeof create> | undefined;
	let error = $state(false);
	export function reset() {
		engine?.reset();
	}
	$effect(() => {
		void [
			settings.unit,
			settings.patches,
			settings.furniture,
			settings.dark,
			settings.sun.azimuth,
			settings.sun.altitude,
			settings.showSun,
			settings.sunColor,
		];
		engine?.lighting();
	});
	$effect(() => {
		void [settings.eye, settings.scale];
		engine?.invalidate();
	});
	onMount(() => {
		let alive = true;
		(async () => {
			try {
				const [, module] = await Promise.all([import('./three.ts'), import('./engine.ts')]);
				if (alive) engine = module.create(canvas, stick, walk, () => settings, zoom, exit);
			} catch (e) {
				if (alive) {
					error = true;
					if (!(e instanceof Error) || !/webgl|context/i.test(e.message)) throw e;
				}
			}
		})();
		return () => {
			alive = false;
			engine?.destroy();
			engine = undefined;
		};
	});
</script>

<div
	class:grid
	class="stage"
	role="application"
	aria-label={walk
		? 'Apartment walkthrough. WASD or arrows move, click for mouse look, Escape exits. On touch, move with the joystick and drag to look.'
		: 'Three-dimensional apartment plan. Drag to orbit, pinch to zoom.'}
>
	<div class="sky" aria-hidden="true" style:opacity={settings.dark * 0.63}></div>
	<canvas
		bind:this={canvas}
		tabindex={walk ? 0 : undefined}
		aria-label={walk ? 'First-person camera' : 'Orbit camera'}
	></canvas>
	<div class="stick" class:walk bind:this={stick} aria-hidden="true"><i></i></div>
	{#if error}<p role="status">This view needs WebGL 2. The top-down plan is available.</p>{/if}
</div>

<style>
	.stage {
		position: relative;
		isolation: isolate;
		width: 100%;
		height: 100%;
		overflow: hidden;
		background-color: var(--surface, #f6f5f0);
	}
	.stage.grid {
		background-image: radial-gradient(
			circle,
			color-mix(in srgb, var(--muted, #788076) 33%, transparent) 1px,
			transparent 1px
		);
		background-size: 18px 18px;
	}
	.sky {
		position: absolute;
		inset: 0;
		background: #23354c;
		pointer-events: none;
	}
	canvas {
		position: relative;
		display: block;
		width: 100%;
		height: 100%;
		touch-action: none;
	}
	.stick {
		display: none;
		position: absolute;
		bottom: 20px;
		left: 20px;
		width: 76px;
		height: 76px;
		border-radius: 50%;
		background: #e6e5da66;
		border: 1px solid #64736570;
		touch-action: none;
		user-select: none;
	}
	i {
		position: absolute;
		inset: 24px;
		border-radius: 50%;
		background: var(--forest, #476551);
		opacity: 0.75;
		transform: translate(var(--jx, 0px), var(--jy, 0px));
		pointer-events: none;
	}
	@media (any-pointer: coarse) {
		.stick.walk {
			display: block;
		}
	}
	p {
		position: absolute;
		inset: 35% 12% auto;
		text-align: center;
		color: var(--text, #333d37);
		font: 14px system-ui;
	}
</style>
