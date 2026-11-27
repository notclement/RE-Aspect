<script lang="ts">
	/**
	 * Plans: Free · RE:Aspect Pro (S$50/month) · Agency (contact us for rates).
	 * "Contact us" saves an enquiry (agency_enquire) that admins see in the admin panel.
	 */
	import { nav } from '#lib/stores/nav.svelte.ts';
	import { profile } from '#lib/stores/profile.svelte.ts';
	import { auth } from '#lib/stores/auth.svelte.ts';
	import { agency } from '#lib/stores/agency.svelte.ts';
	import { PLANS, FREE_LAUNCH } from '#lib/config/plans.ts';
	import { validateCompanyName, validateNumber, validatePhone, validateFreeText } from '#lib/validate.ts';
	import Icon from '#lib/components/Icon.svelte';

	$effect(() => nav.set({ label: 'Plans' }));

	const current = $derived(profile.planId);

	let showForm = $state(false);
	let company = $state('');
	let teamSize = $state('');
	let phone = $state('');
	let message = $state('');
	let errors = $state<Record<string, string>>({});
	let busy = $state(false);
	let sent = $state(false);
	let sendError = $state<string | null>(null);

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		const c = validateCompanyName(company);
		const t = validateNumber(teamSize, { min: 1, max: 1000, label: 'Team size', decimals: 0 });
		const p = validatePhone(phone);
		const m = validateFreeText(message, { max: 1000, label: 'Message', multiline: true });
		errors = {
			...(c.ok ? {} : { company: c.error }),
			...(t.ok ? {} : { teamSize: t.error }),
			...(p.ok ? {} : { phone: p.error }),
			...(m.ok ? {} : { message: m.error })
		};
		if (!c.ok || !t.ok || !p.ok || !m.ok) return;
		if (auth.status !== 'signed-in') return void (sendError = 'Please sign in to send an enquiry.');
		busy = true;
		sendError = null;
		try {
			await agency.enquire({ company: c.value, teamSize: t.value, phone: p.value, message: m.value });
			sent = true;
		} catch (err) {
			sendError = err instanceof Error ? err.message : 'Could not send — please try again.';
		}
		busy = false;
	}
</script>

<svelte:head><title>Plans · RE:Aspect</title></svelte:head>

<h1 class="title">Plans</h1>
{#if FREE_LAUNCH}<p class="muted lead">Launch period: everyone gets Pro features free while we test.</p>{/if}

<div class="plans">
	<section class="card plan" class:on={current === 'free'}>
		<h2>Free</h2>
		<p class="price"><b>S$0</b></p>
		<ul>
			<li><Icon name="check" size={16} />{PLANS.free.includedUnits} project</li>
			<li><Icon name="check" size={16} />Sun view, 3D and walkthrough</li>
			<li><Icon name="check" size={16} />Share links</li>
		</ul>
		{#if current === 'free'}<span class="tag">Your plan</span>{/if}
	</section>

	<section class="card plan" class:on={current === 'pro'}>
		<h2>RE:Aspect Pro</h2>
		<p class="price"><b>S${PLANS.pro.priceSgdMonthly}</b> / month</p>
		<ul>
			<li><Icon name="check" size={16} />{PLANS.pro.includedUnits} projects, then S${PLANS.pro.extraUnitOneOffSgd} per extra project</li>
			<li><Icon name="check" size={16} />{PLANS.pro.aiRunsPerFunctionPerUnit}× AI re-runs per project</li>
			<li><Icon name="check" size={16} />Import, export and modules</li>
		</ul>
		{#if current === 'pro'}
			<span class="tag pro">{FREE_LAUNCH && profile.data.plan === 'free' ? 'Free during launch' : 'Your plan'}</span>
		{:else if current === 'free'}
			<button class="btn primary" disabled>Coming soon</button>
		{/if}
	</section>

	<section class="card plan agency" class:on={current === 'agency'}>
		<h2>Agency</h2>
		<p class="price"><b>Contact us</b> for agency rates</p>
		<ul>
			<li><Icon name="check" size={16} />One shared project pool for the whole team</li>
			<li><Icon name="check" size={16} />{PLANS.agency.aiRunsPerFunctionPerUnit}× AI re-runs per project</li>
			<li><Icon name="check" size={16} />Invite agents with a QR code; you approve who joins</li>
			<li><Icon name="check" size={16} />Projects stay with the agency when someone leaves</li>
		</ul>
		{#if current === 'agency' || agency.info}
			<a class="btn" href="/agency">My agency</a>
		{:else if sent}
			<p class="ok"><Icon name="check" size={18} />Thanks — we'll get in touch at {auth.email ?? 'your email'} soon.</p>
		{:else if !showForm}
			<button class="btn primary" onclick={() => (showForm = true)}>Contact us</button>
		{:else}
			<form onsubmit={submit} novalidate>
				<div class="field">
					<label for="co">Company / agency</label>
					<input id="co" maxlength="60" autocomplete="organization" bind:value={company} />
					{#if errors.company}<span class="error">{errors.company}</span>{/if}
				</div>
				<div class="two">
					<div class="field">
						<label for="ts">Team size</label>
						<input id="ts" inputmode="numeric" maxlength="4" bind:value={teamSize} placeholder="10" />
						{#if errors.teamSize}<span class="error">{errors.teamSize}</span>{/if}
					</div>
					<div class="field">
						<label for="ph">Phone (optional)</label>
						<input id="ph" type="tel" inputmode="tel" maxlength="20" autocomplete="tel" bind:value={phone} />
						{#if errors.phone}<span class="error">{errors.phone}</span>{/if}
					</div>
				</div>
				<div class="field">
					<label for="msg">Anything else? (optional)</label>
					<textarea id="msg" rows="3" maxlength="1000" bind:value={message}></textarea>
					{#if errors.message}<span class="error">{errors.message}</span>{/if}
				</div>
				{#if sendError}<p class="error">{sendError}</p>{/if}
				<div class="row">
					<button type="button" class="btn" onclick={() => (showForm = false)}>Cancel</button>
					<button class="btn primary" disabled={busy}>{busy ? 'Sending…' : 'Send'}</button>
				</div>
				<p class="muted small">We'll reply to {auth.email ?? 'your account email'}.</p>
			</form>
		{/if}
	</section>
</div>

<style>
	.title {
		margin: 0 0 4px;
	}
	.lead {
		margin: 0 0 16px;
	}
	.plans {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
		gap: 14px;
		align-items: start;
	}
	.plan {
		display: flex;
		flex-direction: column;
		gap: 10px;
		align-items: flex-start;
	}
	.plan.on {
		outline: 2px solid var(--forest);
	}
	h2 {
		margin: 0;
		font-size: 20px;
	}
	.price {
		margin: 0;
		color: var(--muted);
	}
	.price b {
		font-size: 24px;
		color: var(--text);
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
		font-size: 14px;
	}
	li {
		display: flex;
		gap: 8px;
		align-items: flex-start;
	}
	li :global(svg) {
		color: var(--forest);
		flex-shrink: 0;
		margin-top: 2px;
	}
	form {
		width: 100%;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.two {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 10px;
	}
	textarea {
		width: 100%;
		min-height: 88px;
		padding: 10px 12px;
		border-radius: var(--radius-sm);
		border: 1px solid var(--line);
		background: var(--surface);
		font: inherit;
		font-size: 16px;
		color: inherit;
		resize: vertical;
	}
	.row {
		display: flex;
		gap: 8px;
		justify-content: flex-end;
	}
	.ok {
		display: flex;
		gap: 8px;
		align-items: center;
		margin: 0;
		color: var(--forest);
		font-weight: 600;
	}
	.error {
		color: #b5483a;
		font-size: 13px;
		margin: 0;
	}
	.small {
		font-size: 12px;
		margin: 0;
	}
</style>
