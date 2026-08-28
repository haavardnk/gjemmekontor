<script lang="ts">
	import '../app.css';

	import { onMount } from 'svelte';

	import { page } from '$app/state';
	import { themeState } from '$lib/client/theme.svelte';
	import AppShell from '$lib/ui/AppShell.svelte';

	let { children } = $props();
	const showShell = $derived(
		!page.url.pathname.startsWith('/trips') &&
			!page.url.pathname.startsWith('/admin') &&
			!/^\/t\/[^/]+\/unlock$/.test(page.url.pathname)
	);

	onMount(() => {
		themeState.start();
		return (): void => themeState.stop();
	});
</script>

<svelte:head>
	<meta name="theme-color" content="#153e4b" />
	<meta name="description" content="Felles reiseapp for Gjemmekontor" />
	<meta name="apple-mobile-web-app-capable" content="yes" />
	<meta name="apple-mobile-web-app-status-bar-style" content="default" />
	<meta name="apple-mobile-web-app-title" content="Gjemmekontor" />
	<link rel="manifest" href="/manifest.webmanifest" />
	<link rel="icon" href="/favicon.png" type="image/png" />
	<link rel="apple-touch-icon" href="/monsieur-bintang-apple-touch-icon.png" />
	<title>Gjemmekontor</title>
</svelte:head>

{#if showShell}
	<AppShell>{@render children()}</AppShell>
{:else}
	{@render children()}
{/if}
