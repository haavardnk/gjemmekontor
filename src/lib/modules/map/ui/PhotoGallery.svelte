<script lang="ts">
	import { ChevronLeft, ChevronRight, X } from '@lucide/svelte';

	type GalleryPhoto = {
		thumbnailUrl: string;
		imageUrl: string;
		caption?: string;
	};

	let {
		photos,
		providerLabel,
		loading = false
	}: {
		photos: readonly GalleryPhoto[];
		providerLabel: string;
		loading?: boolean;
	} = $props();
	let selectedPhotoIndex = $state<number>();
	const previewPhotos = $derived(photos.slice(0, 3));

	function movePhoto(direction: -1 | 1): void {
		if (selectedPhotoIndex === undefined || photos.length === 0) return;
		selectedPhotoIndex = (selectedPhotoIndex + direction + photos.length) % photos.length;
	}

	function handlePhotoKeydown(event: KeyboardEvent): void {
		if (selectedPhotoIndex === undefined) return;
		if (event.key === 'Escape') selectedPhotoIndex = undefined;
		if (event.key === 'ArrowLeft') movePhoto(-1);
		if (event.key === 'ArrowRight') movePhoto(1);
	}
</script>

<svelte:window onkeydown={handlePhotoKeydown} />

{#if loading}
	<div class="grid grid-cols-3 gap-1.5" aria-label={`Laster ${providerLabel}-bilder`}>
		<div class="aspect-[4/3] skeleton"></div>
		<div class="aspect-[4/3] skeleton"></div>
		<div class="aspect-[4/3] skeleton"></div>
	</div>
{:else if photos.length > 0}
	<div class="grid grid-cols-3 gap-1.5">
		{#each previewPhotos as photo, index (photo.imageUrl)}
			<button
				class="overflow-hidden rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
				type="button"
				onclick={() => (selectedPhotoIndex = index)}
				aria-label={`Vis ${providerLabel}-bilde ${index + 1} av ${photos.length}`}
			>
				<img
					class="aspect-[4/3] w-full object-cover transition-transform hover:scale-105"
					src={photo.thumbnailUrl}
					alt={photo.caption ?? `Bilde fra ${providerLabel}`}
				/>
			</button>
		{/each}
	</div>
{/if}

{#if selectedPhotoIndex !== undefined && photos[selectedPhotoIndex]}
	{@const photo = photos[selectedPhotoIndex]}
	<div
		class="fixed inset-0 z-50 grid place-items-center p-3"
		role="dialog"
		aria-modal="true"
		aria-label={`${providerLabel}-bildevisning`}
		data-photo-viewer={providerLabel}
	>
		<button
			class="absolute inset-0 bg-black/85"
			type="button"
			onclick={() => (selectedPhotoIndex = undefined)}
			aria-label="Lukk bildevisning"
		></button>
		<div class="relative z-10 w-full max-w-2xl overflow-hidden rounded-lg bg-neutral shadow-2xl">
			<img
				class="max-h-[78vh] w-full object-contain"
				src={photo.imageUrl}
				alt={photo.caption ?? `Bilde fra ${providerLabel}`}
			/>
			<button
				class="btn absolute top-2 right-2 btn-circle border-white/30 bg-black/65 text-white btn-sm"
				type="button"
				onclick={() => (selectedPhotoIndex = undefined)}
				aria-label="Lukk bildevisning"
			>
				<X size={18} />
			</button>
			{#if photos.length > 1}
				<button
					class="btn absolute top-1/2 left-2 btn-circle -translate-y-1/2 border-white/30 bg-black/65 text-white"
					type="button"
					onclick={() => movePhoto(-1)}
					aria-label="Forrige bilde"
				>
					<ChevronLeft size={22} />
				</button>
				<button
					class="btn absolute top-1/2 right-2 btn-circle -translate-y-1/2 border-white/30 bg-black/65 text-white"
					type="button"
					onclick={() => movePhoto(1)}
					aria-label="Neste bilde"
				>
					<ChevronRight size={22} />
				</button>
			{/if}
			<div class="flex items-start justify-between gap-3 px-3 py-2 text-white">
				<div class="min-w-0">
					<p class="text-sm">{photo.caption ?? `Bilde fra ${providerLabel}`}</p>
				</div>
				<span class="shrink-0 text-xs text-white/65"
					>{selectedPhotoIndex + 1} / {photos.length}</span
				>
			</div>
		</div>
	</div>
{/if}
