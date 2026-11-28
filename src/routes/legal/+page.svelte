<script lang="ts">
	/**
	 * /legal — Terms of use, accuracy disclaimer and PDPA privacy notice in one page (anchors #terms, #accuracy,
	 * #privacy). Public: works signed out. DRAFT wording — to be reviewed by a Singapore lawyer before paid launch.
	 */
	import { nav } from '#lib/stores/nav.svelte.ts';
	import { BRAND } from '#lib/config/brand.ts';

	$effect(() => nav.set({ label: 'Terms & privacy' }));
	const updated = '28 November 2026';
	const contact = BRAND.contactEmail;
</script>

<svelte:head><title>Terms & privacy · {BRAND.name}</title></svelte:head>

<article class="card legal">
	<h1>Terms &amp; privacy</h1>
	<p class="muted small">Last updated {updated}</p>
	<nav class="toc" aria-label="Sections"><a href="#terms">Terms of use</a><a href="#accuracy">Accuracy</a><a href="#privacy">Privacy (PDPA)</a></nav>

	<h2 id="terms">Terms of use</h2>
	<ol>
		<li>{BRAND.name} shows how sunlight may fall inside a home, from a floor plan and the sun's path. By signing in or opening a shared link you agree to these terms.</li>
		<li>You may only upload floor plans, site plans and photos that you have the right to use (for example from a sales brochure for a listing you handle, or your own home). You are responsible for what you upload and share.</li>
		<li>Don't misuse the service: no attempts to break in, overload it, copy it in bulk or use it to mislead buyers.</li>
		<li>Plans, prices and limits are shown on the Plans page. Paid plans renew until you cancel. We may change features or prices with notice in the app.</li>
		<li>We may suspend accounts that break these terms. You can stop using {BRAND.name} at any time.</li>
		<li>The service is provided "as is". To the extent the law allows, we are not liable for losses from relying on it, including decisions to buy, sell, rent or renovate.</li>
		<li>These terms are governed by the laws of Singapore.</li>
	</ol>

	<h2 id="accuracy">Accuracy</h2>
	<p>Sun results are <strong>estimates for guidance</strong>, not a survey or professional advice.</p>
	<ul>
		<li>They depend on the floor plan, the unit's level and direction, and the AI's reading of the plan, which can be wrong. Check the plan and the north direction before you rely on it.</li>
		<li>Neighbouring buildings, trees, balconies above and weather are not included unless shown, so real sunlight can be less.</li>
		<li>Always visit the home at the times that matter to you before deciding.</li>
	</ul>

	<h2 id="privacy">Privacy notice (PDPA)</h2>
	<p>This explains what personal data {BRAND.name} collects and how it is used, under Singapore's Personal Data Protection Act 2012.</p>
	<h3>What we collect</h3>
	<ul>
		<li><strong>Account:</strong> your name, email and Google profile photo when you sign in with Google, plus any photo, settings and agency details you add.</li>
		<li><strong>Projects:</strong> the unit details you enter (address, unit number, level, size), the traced plan, furniture and notes.</li>
		<li><strong>Photos you upload</strong> for tracing are sent to our server only to read the plan. They are processed by our AI provider (Anthropic) and <strong>not stored</strong>; only the traced plan is kept.</li>
		<li><strong>In your browser only:</strong> your settings and sign-in session, kept in local storage. No advertising or tracking cookies.</li>
	</ul>
	<h3>How we use it</h3>
	<ul>
		<li>To run the service: sign-in, saving your projects, tracing plans, showing sunlight, plan limits and support.</li>
		<li>Shared links: anyone with a link you share can view that project read-only, including the details you entered, until you turn sharing off.</li>
		<li>We don't sell personal data or use it for advertising.</li>
	</ul>
	<h3>Who processes it</h3>
	<p>Supabase (database and sign-in), Cloudflare (website hosting), Google (sign-in) and Anthropic (AI plan reading). Some of these may store or process data outside Singapore, with protection comparable to the PDPA.</p>
	<h3>Keeping and deleting</h3>
	<p>We keep your account and projects while your account is open. Deleted projects are removed from our database. You can ask us to access, correct or delete your personal data, or withdraw consent, at any time.</p>
	<h3>Contact</h3>
	<p>
		Data protection contact:
		{#if contact}<a href="mailto:{contact}">{contact}</a>{:else}<a href={BRAND.developer.linkedin} rel="noopener noreferrer" target="_blank">{BRAND.developer.name} (LinkedIn)</a>{/if}.
		We reply within 30 days.
	</p>
</article>

<style>
	.legal {
		max-width: 760px;
		margin: 0 auto;
		line-height: 1.6;
	}
	h1 {
		margin: 0;
		font-size: 26px;
	}
	h2 {
		margin: 28px 0 8px;
		font-size: 20px;
		scroll-margin-top: 80px;
	}
	h3 {
		margin: 16px 0 4px;
		font-size: 16px;
	}
	li {
		margin: 4px 0;
	}
	.toc {
		display: flex;
		flex-wrap: wrap;
		gap: 8px 16px;
		margin: 10px 0 0;
	}
	.toc a {
		min-height: 44px;
		display: inline-flex;
		align-items: center;
	}
	.small {
		font-size: 13px;
		margin: 2px 0 0;
	}
</style>
