<script lang="ts">
	// Old link: the Anchor placeholder became the New project wizard.
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	onMount(() => goto('/new', { replaceState: true }));
</script>
