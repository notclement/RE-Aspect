<script lang="ts">
	/** "Delete this project?" — bottom sheet on phones, dialog on desktop. Owner-only (the server checks too). */
	import Icon from './Icon.svelte';
	import { deleteProject } from '#lib/stores/projects.svelte.ts';

	let { id, name, onclose, ondeleted }: { id: string; name: string; onclose: () => void; ondeleted?: () => void } = $props();
	let busy = $state(false);
	let error = $state<string | null>(null);

	async function confirm() {
		busy = true;
		error = null;
		try {
			await deleteProject(id);
			ondeleted?.();
			onclose();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Could not delete the project.';
		}
		busy = false;
	}
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && !busy && onclose()} />
<button class="scrim" aria-label="Cancel" onclick={() => !busy && onclose()}></button>
<div class="dlg" role="alertdialog" aria-modal="true" aria-labelledby="del-title">
	<span class="ic"><Icon name="trash" size={22} /></span>
	<h2 id="del-title">Delete “{name}”?</h2>
	<p class="muted">The project, its traced plan and furniture are deleted for good. This can't be undone.</p>
	{#if error}<p class="error">{error}</p>{/if}
	<div class="actions">
		<button class="btn" onclick={onclose} disabled={busy}>Cancel</button>
		<button class="btn del" onclick={confirm} disabled={busy}>{busy ? 'Deleting…' : 'Delete project'}</button>
	</div>
</div>

<style>
	.scrim {
		position: fixed;
		inset: 0;
		border: 0;
		background: rgba(10, 14, 12, 0.45);
		z-index: 60;
	}
	.dlg {
		position: fixed;
		z-index: 61;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		width: min(400px, calc(100vw - 32px));
		background: var(--surface);
		border-radius: var(--radius);
		padding: 20px;
		text-align: center;
		box-shadow: 0 20px 50px rgba(0, 0, 0, 0.25);
	}
	.ic {
		display: inline-grid;
		place-items: center;
		width: 48px;
		height: 48px;
		border-radius: 50%;
		background: color-mix(in srgb, #b5483a 14%, transparent);
		color: #b5483a;
		margin-bottom: 8px;
	}
	h2 {
		font-size: 19px;
		margin: 0 0 6px;
		overflow-wrap: anywhere;
	}
	p {
		margin: 0 0 14px;
		font-size: 14px;
	}
	.error {
		color: #b5483a;
	}
	.actions {
		display: flex;
		gap: 8px;
	}
	.actions .btn {
		flex: 1;
	}
	.del {
		background: #b5483a;
		border-color: #b5483a;
		color: #fff;
	}
	@media (max-width: 560px) {
		.dlg {
			top: auto;
			bottom: 0;
			transform: translateX(-50%);
			width: 100vw;
			border-radius: var(--radius) var(--radius) 0 0;
			padding-bottom: calc(20px + var(--safe-b));
		}
	}
</style>
