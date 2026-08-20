<script lang="ts">
	import { Moon, Sun } from '@lucide/svelte';

	import { themeState } from '$lib/client/theme.svelte';

	let { class: className = '' }: { class?: string } = $props();
	const dark = $derived(themeState.theme === 'dark');
</script>

<button
	class="btn btn-square btn-ghost btn-sm {className}"
	type="button"
	onclick={() => themeState.toggle()}
	aria-label={dark ? 'Bruk lyst tema' : 'Bruk mørkt tema'}
	aria-pressed={dark}
	title={dark ? 'Lyst tema' : 'Mørkt tema'}
>
	{#if dark}
		<Sun size={20} />
	{:else}
		<Moon size={20} />
	{/if}
</button>
