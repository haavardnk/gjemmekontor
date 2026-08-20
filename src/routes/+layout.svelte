<script lang="ts">
	import '../app.css';

	import { page } from '$app/state';
	import AppShell from '$lib/ui/AppShell.svelte';

	let { children } = $props();
	const showShell = $derived(page.url.pathname !== '/login');
</script>

<svelte:head>
	<meta name="theme-color" content="#153e4b" />
	<meta name="description" content="Felles reiseapp for Gjemmekontor i Kroatia" />
	<title>Gjemmekontor</title>
</svelte:head>

{#if showShell}
	<AppShell>{@render children()}</AppShell>
{:else}
	{@render children()}
{/if}
