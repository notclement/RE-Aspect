<script lang="ts">
	/**
	 * Small static top-down drawing of a project's actual plan, for the projects list.
	 * Shows today's sunlight at the hour when the most sun comes in (so every card shows some light).
	 */
	import { itemTransform, type Unit } from '#lib/sample-unit.ts';
	import { sunPosition, localDate, todaySG } from '#lib/sun.ts';
	import { sunPatches, type Patch } from '#lib/light.ts';

	let { unit }: { unit: Unit } = $props();

	const pts = (p: [number, number][]) => p.map((q) => q.join(',')).join(' ');
	const area = (p: [number, number][]) =>
		Math.abs(p.reduce((s, [x, y], i) => {
			const [x2, y2] = p[(i + 1) % p.length];
			return s + x * y2 - x2 * y;
		}, 0)) / 2;

	const xs = $derived(unit.outline.map((p) => p[0]));
	const ys = $derived([...unit.outline.map((p) => p[1]), ...(unit.balcony ? [unit.balcony.y + unit.balcony.d] : [])]);
	const pad = 30;
	const viewBox = $derived(
		`${Math.min(...xs) - pad} ${Math.min(...ys) - pad} ${Math.max(...xs) - Math.min(...xs) + pad * 2} ${Math.max(...ys) - Math.min(...ys) + pad * 2}`
	);

	// Pick the sunniest hour today (8 AM–5 PM) — cheap: ~10 sun calculations per card.
	const patches = $derived.by((): Patch[] => {
		const day = todaySG();
		let best: Patch[] = [];
		let bestScore = -1;
		for (let h = 8; h <= 17; h++) {
			const s = sunPosition(localDate(day, h * 60), unit.lat, unit.lon);
			const ps = sunPatches(unit, s.azimuth, s.altitude);
			const score = ps.reduce((t, p) => t + area(p.points) * p.intensity, 0);
			if (score > bestScore) {
				bestScore = score;
				best = ps;
			}
		}
		return best;
	});
	const uid = $derived(`th-${unit.id}`);
</script>

<svg {viewBox} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
	<defs>
		{#each patches as p, i (i)}
			<clipPath id="{uid}-r{i}"><polygon points={pts(p.clip)} /></clipPath>
		{/each}
	</defs>
	{#if unit.balcony}
	<rect
		x={unit.balcony.x}
		y={unit.balcony.y}
		width={unit.balcony.w}
		height={unit.balcony.d}
		fill="var(--balcony)"
		stroke="var(--wall)"
		stroke-width="8"
		stroke-dasharray="18 12"
	/>
	{/if}
	<polygon points={pts(unit.outline)} fill="var(--floor)" />
	{#each patches as p, i (i)}
		<polygon points={pts(p.points)} fill="#F4C252" opacity={p.intensity * 0.85} clip-path="url(#{uid}-r{i})" />
	{/each}
	{#each unit.items as i, k (k)}
		{#if i.kind === 'plant'}
			<circle cx={i.x + i.w / 2} cy={i.y + i.d / 2} r={i.w / 2} fill={i.color} />
		{:else if i.kind !== 'rug'}
			<rect x={i.x} y={i.y} width={i.w} height={i.d} rx={i.r} fill={i.color} transform={itemTransform(i)} />
		{/if}
	{/each}
	{#each unit.walls as w, k (k)}
		<line x1={w.a[0]} y1={w.a[1]} x2={w.b[0]} y2={w.b[1]} stroke="var(--wall-top)" stroke-width={w.t * 1.3} stroke-linecap="square" />
	{/each}
	{#each unit.windows as o, k (k)}
		<line x1={o.a[0]} y1={o.a[1]} x2={o.b[0]} y2={o.b[1]} stroke="var(--glass)" stroke-width="18" />
	{/each}
	{#each unit.doors ?? [] as d, k (k)}
		{#if !d.glass}<line x1={d.a[0]} y1={d.a[1]} x2={d.b[0]} y2={d.b[1]} stroke="var(--floor)" stroke-width="22" />{/if}
	{/each}
</svg>

<style>
	svg {
		--floor: #e9dfcb;
		--wall: #3a4139;
		--wall-top: #59625a;
		--glass: #9fb8b9;
		--balcony: #e4e2d8;
		display: block;
		width: 100%;
		height: 100%;
	}
	:global([data-mode='dark']) svg {
		--floor: #cbbfa6;
		--balcony: #4a4a44;
	}
</style>
