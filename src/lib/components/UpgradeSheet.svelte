<script lang="ts">
	/** Shown when someone hits a limit (projects or AI re-runs): what Pro adds, with Upgrade / Not now. */
	import { goto } from '$app/navigation';
	import Icon from './Icon.svelte';
	import { PLANS } from '#lib/config/plans.ts';
	import { profile } from '#lib/stores/profile.svelte.ts';

	let { reason, used, limit, onclose }: { reason: 'projects' | 'ai' | 'daily'; used?: number; limit?: number; onclose: () => void } = $props();
	const onPro = $derived(profile.planId !== 'free');
	const title = $derived(
		reason === 'projects'
			? `You've used ${used ?? limit ?? ''} of ${limit ?? ''} project${limit === 1 ? '' : 's'}`
			: reason === 'ai'
				? 'No AI re-runs left for this project'
				: "You've reached today's AI limit"
	);
	const body = $derived(
		reason === 'daily'
			? 'AI tracing is limited per day to keep it fast for everyone. It resets tomorrow — you can still trace by hand with Outline.'
			: onPro
				? 'Need more room? Extra projects are S$5 each, or bring your team onto an Agency plan with one shared pool.'
				: `RE:Aspect Pro gives you ${PLANS.pro.includedUnits} projects and ${PLANS.pro.aiRunsPerFunctionPerUnit} AI re-runs on each, plus import, export and modules.`
	);
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />
<button class="scrim" aria-label="Not now" onclick={onclose}></button>
<div class="dlg" role="dialog" aria-modal="true" aria-labelledby="up-title">
	<span class="ic"><Icon name="sparkle" size={22} /></span>
	<h2 id="up-title">{title}</h2>
	<p class="muted">{body}</p>
	<div class="actions">
		<button class="btn" onclick={onclose}>Not now</button>
		{#if reason !== 'daily'}
			<button class="btn primary" onclick={() => (onclose(), goto('/upgrade'))}>{onPro ? 'See plans' : 'Upgrade to Pro'}</button>
		{/if}
	</div>
</div>

<style>
	.scrim {
		position: fixed;
		inset: 0;
		border: 0;
		background: rgba(20, 26, 22, 0.4);
		z-index: 60;
	}
	.dlg {
		position: fixed;
		z-index: 61;
		left: 50%;
		bottom: 0;
		transform: translateX(-50%);
		width: min(440px, 100%);
		background: var(--surface);
		border-radius: 18px 18px 0 0;
		padding: 22px 20px calc(20px + var(--safe-b, 0px));
		display: flex;
		flex-direction: column;
		gap: 8px;
		box-shadow: 0 -10px 40px rgba(0, 0, 0, 0.2);
	}
	@media (min-width: 700px) {
		.dlg {
			bottom: auto;
			top: 50%;
			transform: translate(-50%, -50%);
			border-radius: 18px;
		}
	}
	.ic {
		width: 44px;
		height: 44px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		background: var(--ochre-soft);
		color: var(--ochre);
	}
	h2 {
		margin: 6px 0 0;
		font-size: 20px;
	}
	p {
		margin: 0 0 8px;
	}
	.actions {
		display: flex;
		gap: 8px;
		justify-content: flex-end;
	}
</style>
