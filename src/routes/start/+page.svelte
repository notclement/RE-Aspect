<script lang="ts">
	/**
	 * Public landing page for agents & interior designers (our customers). Signed-out visitors to / land here.
	 * The room illustration is generic mood art — fine here, never on a real unit's page.
	 */
	import Logo from '#lib/components/Logo.svelte';
	import RoomArt from '#lib/components/RoomArt.svelte';
	import { BRAND } from '#lib/config/brand.ts';
	import { signupProOpen } from '#lib/config/plans.ts';

	const promo = signupProOpen();
	const steps = [
		{ n: '1 · Upload', t: 'Floor plan and a few photos' },
		{ n: '2 · Check', t: 'Fix windows and furniture in Studio' },
		{ n: '3 · Share', t: 'Send the sun view to buyers' }
	];
</script>

<svelte:head>
	<title>{BRAND.name} · Sunlight studies for Singapore listings</title>
</svelte:head>

<div class="wrap">
	<header class="top">
		<a href="/start" aria-label="{BRAND.name} home" class="home"><Logo height={28} label="{BRAND.name} home" /></a>
		<a class="signin" href="/login">Sign in</a>
	</header>

	<main class="hero">
		<div class="art phone"><RoomArt height={240} align="gentle" eager /></div>
		<div class="art desk"><RoomArt height={420} scale={0.74} /></div>
		<div class="copy">
			<h1>{BRAND.tagline}</h1>
			<p class="lead">{BRAND.sunFeature} turns a floor plan into a live sunlight study. Share it with buyers on WhatsApp in one tap.</p>
			<div class="ctas">
				<a class="btn primary" href="/login">{promo ? 'Get 3 months of Pro' : 'Get started'}</a>
				<a class="btn" href="/s?demo=tampines-4rm">See a demo</a>
			</div>
			{#if promo}<p class="fine muted">Free for new sign-ups until 31 Jan 2027. No card needed.</p>{/if}
		</div>
	</main>

	<ol class="how" aria-label="How it works">
		{#each steps as s (s.n)}
			<li><span class="lbl">{s.n}</span><span>{s.t}</span></li>
		{/each}
	</ol>

	<footer class="foot muted">
		{BRAND.name} · featuring {BRAND.sunFeature} · <a href="/legal">Terms &amp; privacy</a> · <a href={BRAND.developer.linkedin} target="_blank" rel="noopener noreferrer">Built by {BRAND.developer.name}</a>
	</footer>
</div>

<style>
	.wrap {
		max-width: 1120px;
		margin: 0 auto;
		padding: calc(6px + var(--safe-t)) 20px calc(28px + var(--safe-b));
	}
	.top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		min-height: 56px;
	}
	.home {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
	}
	.signin {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		padding: 0 6px;
		font-weight: 600;
		color: var(--forest);
		text-decoration: none;
	}
	.art {
		margin-top: 8px;
	}
	.art.desk {
		display: none;
	}
	.copy {
		display: flex;
		flex-direction: column;
		gap: 12px;
		margin-top: 18px;
	}
	h1 {
		margin: 0;
		font-size: clamp(28px, 7.6vw, 44px);
		line-height: 1.15;
	}
	.lead {
		margin: 0;
		font-size: 16px;
		color: var(--muted);
		max-width: 46ch;
	}
	.ctas {
		display: flex;
		gap: 10px;
		margin-top: 4px;
	}
	.ctas .btn {
		flex: 1;
		min-height: 48px;
	}
	.fine {
		margin: 0;
		font-size: 13px;
	}
	.how {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 12px;
		margin: 24px 0 0;
		padding: 16px 0 0;
		border-top: 1px solid var(--line);
		list-style: none;
	}
	.how li {
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-size: 14px;
		line-height: 1.4;
	}
	.lbl {
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--muted);
	}
	.foot {
		margin-top: 28px;
		font-size: 12px;
	}
	.foot a {
		color: var(--forest);
	}
	@media (min-width: 900px) {
		.hero {
			display: grid;
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
			align-items: center;
			gap: 48px;
			margin-top: 32px;
		}
		.art {
			order: 2;
			margin: 0;
		}
		.art.phone {
			display: none;
		}
		.art.desk {
			display: block;
		}
		.copy {
			margin-top: 0;
		}
		.ctas .btn {
			flex: 0 0 auto;
		}
		.how {
			margin-top: 48px;
		}
	}
</style>
