<script lang="ts">
	import { ChevronLeft, ChevronRight, X } from '@lucide/svelte';

	import { type PlanningPhoto, planningPhotoPath } from '../domain/planning';
	import PlanningImage from './PlanningImage.svelte';

	let {
		photos,
		index,
		onselect,
		onclose
	}: {
		photos: PlanningPhoto[];
		index: number;
		onselect: (photoId: string) => void;
		onclose: () => void;
	} = $props();

	const photo = $derived(photos[index]);
	const label = $derived(`Bilde ${index + 1} av ${photos.length}`);

	function step(offset: number): void {
		const next = photos[(index + offset + photos.length) % photos.length];
		if (next) onselect(next.id);
	}
</script>

<svelte:window
	onkeydown={(event) => {
		if (event.key === 'Escape') {
			event.preventDefault();
			onclose();
		} else if (event.key === 'ArrowLeft') step(-1);
		else if (event.key === 'ArrowRight') step(1);
	}}
/>

<div
	class="fixed inset-0 z-110 flex items-center justify-center bg-black/90 p-4"
	role="dialog"
	aria-modal="true"
	aria-label={label}
>
	{#if photo}
		{#key photo.id}
			<PlanningImage
				src={planningPhotoPath(photo.id, 'full')}
				cachedSrc={planningPhotoPath(photo.id, 'thumb')}
				alt={label}
				class="max-h-full max-w-full object-contain"
			/>
		{/key}
	{/if}
	<button
		class="btn absolute btn-circle btn-ghost text-white"
		style="top: max(0.75rem, env(safe-area-inset-top)); right: 0.75rem;"
		type="button"
		onclick={onclose}
		aria-label="Lukk bildet"><X size={22} /></button
	>
	{#if photos.length > 1}
		<button
			class="btn absolute top-1/2 left-3 btn-circle -translate-y-1/2 btn-ghost text-white"
			type="button"
			onclick={() => step(-1)}
			aria-label="Forrige bilde"><ChevronLeft size={24} /></button
		>
		<button
			class="btn absolute top-1/2 right-3 btn-circle -translate-y-1/2 btn-ghost text-white"
			type="button"
			onclick={() => step(1)}
			aria-label="Neste bilde"><ChevronRight size={24} /></button
		>
	{/if}
</div>
