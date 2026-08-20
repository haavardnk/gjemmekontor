<script lang="ts">
	import '../app.css';

	let { children } = $props();
</script>

<svelte:head>
	<meta name="theme-color" content="#153e4b" />
	<meta name="description" content="Felles reiseapp for Gjemmekontor i Kroatia" />
	<title>Gjemmekontor</title>
</svelte:head>

{@render children()}
