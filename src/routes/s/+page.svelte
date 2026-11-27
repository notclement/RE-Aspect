<script lang="ts">
	/**
	 * Public, read-only share page — no account needed.
	 *   /s?k=<32-hex token>   a shared project (anyone with the link)
	 *   /s?demo=<demo id>     a built-in demo
	 * The view, date and time come from the hash (#v=top&d=2026-06-21&t=660), validated and clamped.
	 */
	import { page } from '$app/state';
	import Icon from '#lib/components/Icon.svelte';
	import Spinner from '#lib/components/Spinner.svelte';
	import SunStudy, { type StudyInfo } from '#lib/components/SunStudy.svelte';
	import { SAMPLE_UNITS, type Unit } from '#lib/sample-unit.ts';
	import { sanitizePlan, planReady, planToUnit } from '#lib/plan.ts';
	import { projectDetails } from '#lib/stores/projects.svelte.ts';
	import { propertyTypeLabel } from '#lib/config/property-types.ts';
	import { getSupabase, supabaseConfigured } from '#lib/supabase.ts';
	import { todaySG, nowMinutesSG } from '#lib/sun.ts';
	import { BRAND } from '#lib/config/brand.ts';
	import type { View } from '#lib/stores/unit-view.svelte.ts';

	let state_ = $state<'loading' | 'ready' | 'missing'>('loading');
	let unit = $state<Unit | null>(null);
	let title = $state('');
	let description = $state('');
	let info = $state<StudyInfo | null>(null);
	const vs = $state<{ view: View; date: string; minutes: number }>({
		view: 'top',
		date: todaySG(),
		minutes: Math.max(7 * 60, Math.min(18 * 60, nowMinutesSG()))
	});

	const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
	const num = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : null);

	$effect(() => {
		const k = page.url.searchParams.get('k') ?? '';
		const demo = page.url.searchParams.get('demo') ?? '';
		void load(k, demo);
	});

	async function load(k: string, demo: string) {
		state_ = 'loading';
		const sample = SAMPLE_UNITS.find((u) => u.id === demo);
		if (sample) {
			const d = projectDetails(sample.id);
			unit = sample;
			title = d.name;
			description = d.description;
			info = { address: d.address, unitNo: d.unitNo, level: sample.level, sizeSqft: sample.sizeSqft, ceilingCm: sample.ceiling, typeLabel: propertyTypeLabel(d.propertyType), plan: null, northAngle: null, demo: true };
			state_ = 'ready';
			return;
		}
		if (!/^[0-9a-f]{32}$/.test(k) || !supabaseConfigured) {
			state_ = 'missing';
			return;
		}
		try {
			const sb = await getSupabase();
			const { data, error } = await sb.rpc('shared_project', { p_token: k });
			if (error || !data || typeof data !== 'object') throw new Error('missing');
			const r = data as Record<string, unknown>;
			const plan = sanitizePlan(r.plan);
			if (!planReady(plan)) throw new Error('missing');
			const id = str(r.id, 40);
			const level = num(r.level, -5, 200);
			const sizeSqft = num(r.size_sqft, 50, 100000);
			const ceilingCm = num(r.ceiling_cm, 200, 800) ?? 260;
			title = str(r.name, 60) || 'Shared unit';
			description = str(r.description, 280);
			unit = planToUnit(plan, { id, name: title, unitNo: str(r.unit_no, 12), level, sizeSqft, ceilingCm, lat: num(r.lat, -90, 90), lon: num(r.lon, -180, 180) });
			info = { address: str(r.address, 120), unitNo: str(r.unit_no, 12), level, sizeSqft, ceilingCm, typeLabel: propertyTypeLabel(str(r.property_type, 20)), plan, northAngle: null, demo: false };
			state_ = 'ready';
		} catch {
			state_ = 'missing';
		}
	}
</script>

<svelte:head>
	<title>{title ? `${title} · ` : ''}{BRAND.name}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="wrap">
	<a class="logo" href="/" aria-label="{BRAND.name} home"><span class="dot"></span>{BRAND.name}</a>

	{#if state_ === 'loading'}
		<div class="center"><Spinner size={22} /></div>
	{:else if state_ === 'missing' || !unit || !info}
		<div class="center card msg">
			<h1>Link not available</h1>
			<p class="muted">This share link has been turned off or doesn't exist. Ask the person who sent it for a new one.</p>
		</div>
	{:else}
		<h1>{title}</h1>
		{#if info.address || info.level !== null}
			<p class="loc"><Icon name="pin" size={15} />{[info.address, info.level !== null ? `Level ${info.level}` : ''].filter(Boolean).join(' · ')}</p>
		{/if}
		{#if description}<p class="desc muted">{description}</p>{/if}
		<SunStudy {unit} {vs} {info} views={['top', '3d']} />
		<p class="foot muted">Read-only view · made with {BRAND.name}. Sun positions are calculated estimates; neighbouring buildings aren't included.</p>
	{/if}
</div>

<style>
	.wrap {
		max-width: 1180px;
		margin: 0 auto;
		padding: 14px 16px calc(32px + var(--safe-b));
	}
	.logo {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		min-height: 44px;
		opacity: 0.55;
		color: var(--text);
		font-weight: 700;
		text-decoration: none;
	}
	.logo:hover {
		opacity: 0.9;
	}
	.dot {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: var(--ochre);
	}
	h1 {
		margin: 6px 0 2px;
	}
	.loc {
		display: flex;
		align-items: center;
		gap: 6px;
		margin: 2px 0 4px;
		font-size: 14px;
		color: var(--muted);
	}
	.desc {
		margin: 0 0 14px;
		font-size: 14px;
	}
	.center {
		display: grid;
		place-items: center;
		min-height: 50dvh;
	}
	.msg {
		max-width: 420px;
		margin: 10dvh auto 0;
		min-height: 0;
		padding: 24px;
		text-align: center;
	}
	.foot {
		margin-top: 18px;
		font-size: 12px;
	}
</style>
