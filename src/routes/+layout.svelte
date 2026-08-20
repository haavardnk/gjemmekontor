<script lang="ts">
	import '../app.css';

	import { onMount } from 'svelte';

	import { page } from '$app/state';
	import { themeState } from '$lib/client/theme.svelte';
	import AppShell from '$lib/ui/AppShell.svelte';

	let { children } = $props();
	const showShell = $derived(page.url.pathname !== '/login');

	onMount(() => {
		themeState.start();
		return (): void => themeState.stop();
	});
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
