<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- Link tokens are validated external HTTP URLs. */

	import { linkTextParts } from './links';

	let { text, className = '' }: { text: string; className?: string } = $props();
	const parts = $derived(linkTextParts(text));
</script>

<span class={`wrap-break-word whitespace-pre-wrap ${className}`}>
	{#each parts as part, index (index)}
		{#if part.kind === 'link'}<a
				class="link break-all link-primary"
				href={part.href}
				target="_blank"
				rel="noopener noreferrer">{part.text}</a
			>{:else}{part.text}{/if}
	{/each}
</span>
