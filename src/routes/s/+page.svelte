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
	import Logo from '#lib/components/Logo.svelte';
	import SunStudy, { type StudyInfo } from '#lib/components/SunStudy.svelte';
	import { SAMPLE_UNITS, type Unit } from '#lib/sample-unit.ts';
	import { sanitizePlan, planReady, planToUnit } from '#lib/plan.ts';
	import { projectDetails } from '#lib/stores/projects.svelte.ts';
	import { propertyTypeLabel } from '#lib/config/property-types.ts';
	import { getSupabase, supabaseConfigured } from '#lib/supabase.ts';
	import { todaySG, nowMinutesSG } from '#lib/sun.ts';
	import { BRAND } from '#lib/config/brand.ts';
	import type { View } from '#lib/stores/unit-view.svelte.ts';
	import { onMount } from 'svelte';
	import { sunScore } from '#lib/sun-score.ts';
	import { indoorExposure } from '#lib/light.ts';
	import { sunPosition, localDate, sunTimes } from '#lib/sun.ts';
	import { profile } from '#lib/stores/profile.svelte.ts';

	let state_ = $state<'loading' | 'ready' | 'missing'>('loading');
	let unit = $state<Unit | null>(null);
	let title = $state('');
	let description = $state('');
	let info = $state<StudyInfo | null>(null);
	let agent = $state<{ name: string; avatar: string; agency: string } | null>(null);

	// Always the warm light look for clients, whatever theme the sender or the viewer's device uses:
	// a bright, daylit page makes the home feel airy and makes the sunlight (the point of the page) pop.
	onMount(() => {
		const el = document.documentElement;
		const prev = { theme: el.dataset.theme, mode: el.dataset.mode };
		const apply = () => {
			el.dataset.theme = 'light';
			el.dataset.mode = 'light';
		};
		const t = setTimeout(apply, 0);
		apply();
		return () => {
			clearTimeout(t);
			if (prev.theme) el.dataset.theme = prev.theme;
			if (prev.mode) el.dataset.mode = prev.mode;
		};
	});

	/** No time in the link: open on the 3D plan at today's sunniest moment inside (the first impression). */
	function openOnBestMoment(u: Unit) {
		if (location.hash.includes('t=')) return;
		vs.view = '3d';
		const t = sunTimes(vs.date, u.lat, u.lon);
		if (t.sunrise === null || t.sunset === null) return;
		const ex = indoorExposure(u, (m) => sunPosition(localDate(vs.date, m), u.lat, u.lon), t.sunrise, t.sunset, 36);
		if (ex.peak !== null) vs.minutes = Math.round(ex.peak);
	}
	const score = $derived(unit ? sunScore(unit) : null);
	const sqm = $derived(info?.sizeSqft ? Math.round(info.sizeSqft / 10.764) : null);
	const waText = (kind: 'interested' | 'viewing' | 'question') => {
		const what = `${title}${info?.unitNo ? ` (${info.unitNo})` : ''}`;
		const msg = kind === 'viewing' ? `Hi! I'd like to arrange a viewing for ${what}. When are you available?` : kind === 'interested' ? `Hi! I'm interested in ${what}. Could you share more details?` : `Hi! I have a question about ${what}: `;
		return `https://wa.me/?text=${encodeURIComponent(`${msg}\n${location.href}`)}`;
	};
	const AVATAR = /^data:image\/(webp|jpeg);base64,[A-Za-z0-9+/=]+$/;
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
			agent = null;
			openOnBestMoment(sample);
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
			const an = str(r.agent_name, 40);
			const av = str(r.agent_avatar, 16000);
			agent = an ? { name: an, avatar: AVATAR.test(av) ? av : '', agency: str(r.agency, 60) } : null;
			openOnBestMoment(unit);
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
	<a class="logo" href="/" title="{BRAND.name} home" aria-label="{BRAND.name} home"><Logo height={30} label="{BRAND.name} home" /></a>

	{#if state_ === 'loading'}
		<div class="center"><Spinner size={22} /></div>
	{:else if state_ === 'missing' || !unit || !info}
		<div class="center card msg">
			<h1>Link not available</h1>
			<p class="muted">This share link has been turned off or doesn't exist. Ask the person who sent it for a new one.</p>
		</div>
	{:else}
		<header class="hero">
			<h1>{title}</h1>
			{#if info.address || info.level !== null}
				<p class="loc"><Icon name="pin" size={15} />{[info.address, info.level !== null ? `Level ${info.level}` : '', info.unitNo].filter(Boolean).join(' · ')}</p>
			{/if}
			<ul class="facts">
				<li>{info.typeLabel}</li>
				{#if info.sizeSqft}<li>{info.sizeSqft.toLocaleString()} sq ft{sqm ? ` · ${sqm} m²` : ''}</li>{/if}
				{#if score}<li>Living room faces {score.facingWords}</li>{/if}
			</ul>
			{#if score}
				<p class="verdict" title="Sun score: how much harsh afternoon sun the living-room windows get over a year (10 = none, 1 = the hottest facing in Singapore).">
					<Icon name="sun" size={18} /><strong>{score.verdict}</strong><span class="sc">Sun score {score.score.toFixed(1)}/10</span>
				</p>
			{/if}
			{#if description}<p class="desc">{description}</p>{/if}
		</header>

		<SunStudy {unit} {vs} {info} views={['3d', 'top']} />

		<section class="contact card" aria-label="Contact">
			<div class="who">
				{#if agent?.avatar}<img src={agent.avatar} alt="" width="48" height="48" />{:else}<span class="ph"><Icon name="user" size={22} /></span>{/if}
				<div>
					<small>{agent ? 'Shared by' : 'Like what you see?'}</small>
					<strong>{agent ? agent.name : 'Talk to the person who sent you this'}</strong>
					{#if agent?.agency}<span class="muted">{agent.agency}</span>{/if}
				</div>
			</div>
			<p class="muted">Like the light in this home? Reply in one tap — your message opens in WhatsApp with this page attached.</p>
			<div class="ctas">
				<a class="btn primary" href={waText('viewing')} target="_blank" rel="noopener noreferrer">Book a viewing</a>
				<a class="btn" href={waText('interested')} target="_blank" rel="noopener noreferrer">I'm interested</a>
				<a class="btn" href={waText('question')} target="_blank" rel="noopener noreferrer">Ask a question</a>
			</div>
		</section>

		<p class="foot muted">Sunlight for this exact unit, worked out from its floor plan and Singapore's sun path through the year. Estimates for guidance; neighbouring buildings aren't included. </p>
		<p class="sign muted"><Logo kind="mark" height={20} label="" /><span><strong>{BRAND.name}</strong> · {BRAND.buyerLine}</span> <a href="/login">Agents &amp; designers: show your listings in sunlight</a></p>
		<nav class="sticky" data-bottom-bar aria-label="Quick reply">
			<a class="btn primary" href={waText('viewing')} target="_blank" rel="noopener noreferrer">Book a viewing</a>
			<a class="btn" href={waText('interested')} target="_blank" rel="noopener noreferrer" aria-label="I'm interested" title="I'm interested">♥ Interested</a>
		</nav>
	{/if}
</div>

<style>
	.wrap {
		max-width: 1180px;
		margin: 0 auto;
		padding: 14px 16px calc(32px + var(--safe-b));
	}
	/* Brand stays visible (so buyers learn the name) but quiet, so the unit title leads. */
	.logo {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		opacity: 0.85;
		text-decoration: none;
	}
	.logo:hover {
		opacity: 1;
	}
	.sign {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px 8px;
		margin-top: 8px;
		font-size: 12px;
	}
	.sign a {
		color: var(--forest);
	}
	h1 {
		margin: 6px 0 2px;
	}
	.hero {
		margin-bottom: 14px;
	}
	.facts {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin: 10px 0 0;
		padding: 0;
		list-style: none;
	}
	.facts li {
		padding: 5px 10px;
		border-radius: 999px;
		background: var(--surface-2);
		font-size: 13px;
		color: var(--text);
	}
	.verdict {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px 10px;
		margin: 12px 0 0;
		padding: 10px 14px;
		border-radius: var(--radius-sm);
		background: var(--ochre-soft);
		color: var(--text);
		font-size: 15px;
	}
	.verdict :global(svg) {
		color: var(--ochre);
	}
	.verdict .sc {
		margin-left: auto;
		font-size: 13px;
		color: var(--muted);
	}
	@media (max-width: 720px) {
		.desc {
			display: none; /* keeps the plan and the time slider on screen; the facts + verdict say it */
		}
	}
	.desc {
		margin: 10px 0 0;
		font-size: 14px;
		color: var(--muted);
	}
	.contact {
		margin-top: 16px;
		padding: 16px;
	}
	.who {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.who img,
	.who .ph {
		width: 48px;
		height: 48px;
		border-radius: 50%;
		object-fit: cover;
		flex-shrink: 0;
	}
	.who .ph {
		display: grid;
		place-items: center;
		background: var(--surface-2);
		color: var(--muted);
	}
	.who div {
		display: grid;
	}
	.who small {
		color: var(--muted);
		font-size: 12px;
	}
	.contact > p {
		margin: 10px 0 12px;
		font-size: 14px;
	}
	.ctas {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	/* Thumb-reach reply bar on phones (desktop has the contact card). */
	.sticky {
		display: none;
	}
	@media (max-width: 720px) {
		.sticky {
			position: fixed;
			left: 0;
			right: 0;
			bottom: 0;
			z-index: 30;
			display: flex;
			gap: 8px;
			padding: 10px 14px calc(10px + var(--safe-b));
			background: color-mix(in srgb, var(--surface) 94%, transparent);
			border-top: 1px solid var(--line);
			backdrop-filter: blur(8px);
		}
		.sticky .btn {
			flex: 1;
		}
		.wrap {
			padding-bottom: calc(90px + var(--safe-b));
		}
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
