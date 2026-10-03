<script lang="ts">
	import { FolderPlus, Lightbulb, Plus } from '@lucide/svelte';
	import { onMount } from 'svelte';

	import { page } from '$app/state';
	import { createCachedResource } from '$lib/client/cached-resource';
	import { connectivity } from '$lib/client/connectivity.svelte';
	import SyncStatus from '$lib/ui/SyncStatus.svelte';

	import { planningCache } from '../client/cache';
	import { cachePlanningImages, planningImagePaths } from '../client/images';
	import { pastedImages } from '../client/photos';
	import type { PlanningCardDraft, PlanningCategoryInput } from '../domain/inputs';
	import {
		type PlanningCard,
		type PlanningCategory,
		type PlanningPageData,
		planningSections
	} from '../domain/planning';
	import {
		addPlanningComment,
		deletePlanningCard,
		deletePlanningCategory,
		deletePlanningComment,
		placePlanningCard,
		placePlanningCategory,
		type PlanningMutation,
		type PlanningPhotoChanges,
		reactToPlanningCard,
		retryPlanningLinkPreview,
		savePlanningCard,
		savePlanningCategory,
		togglePlanningChecklistItem,
		updatePlanningComment
	} from './planning-commands';
	import PlanningBoard from './PlanningBoard.svelte';
	import PlanningCardDetail from './PlanningCardDetail.svelte';
	import PlanningCardEditor from './PlanningCardEditor.svelte';
	import PlanningCategoryEditor from './PlanningCategoryEditor.svelte';

	let { planning, googlePlacesApiKey }: { planning: PlanningPageData; googlePlacesApiKey: string } =
		$props();
	let selectedPersonId = $state('');
	let openCardId = $state<string>();
	let editingCard = $state<PlanningCard | null>();
	let newCardCategoryId = $state<string | null>(null);
	let newCardPhotos = $state.raw<File[]>([]);
	let editingCategory = $state<PlanningCategory | null>();
	let editorErrorMessage = $state('');
	let actionErrorMessage = $state('');
	let saving = $state(false);

	const resource = createCachedResource({
		...planningCache,
		read: () => planning,
		write: (value) => {
			planning = value;
		}
	});

	const sections = $derived(planningSections(planning));
	const canWrite = $derived(connectivity.online && Boolean(selectedPersonId));
	const openCard = $derived(planning.cards.find(({ id }) => id === openCardId));
	const openSection = $derived(
		sections.find((section) => section.cards.some(({ id }) => id === openCardId))
	);
	const imagePaths = $derived(planningImagePaths(planning).join('\n'));

	$effect(() => {
		const tripId = page.data.tripId;
		const paths = imagePaths ? imagePaths.split('\n') : [];
		if (!tripId || !connectivity.online) return;
		void cachePlanningImages(tripId, paths).catch(() => undefined);
	});

	$effect(() => {
		if (!planning.people.some((person) => person.id === selectedPersonId)) {
			selectedPersonId = planning.people[0]?.id ?? '';
		}
	});

	onMount(() => resource.start());

	async function commit(mutation: () => PlanningMutation, failure: string): Promise<void> {
		if (!connectivity.online) return;
		actionErrorMessage = '';
		try {
			await resource.commitMutation(mutation());
		} catch {
			actionErrorMessage = failure;
		}
	}

	async function commitComment(mutation: () => PlanningMutation, failure: string): Promise<void> {
		if (!connectivity.online) return;
		actionErrorMessage = '';
		try {
			await resource.commitMutation(mutation());
		} catch (error) {
			actionErrorMessage = failure;
			throw error;
		}
	}

	async function save(mutation: () => PlanningMutation, close: () => void): Promise<void> {
		if (!connectivity.online || saving) return;
		saving = true;
		editorErrorMessage = '';
		try {
			await resource.commitMutation(mutation());
			close();
		} catch (error) {
			editorErrorMessage =
				error instanceof Error && error.message === 'PLANNING_MEMBER_REQUIRED'
					? 'Velg et aktivt medlem.'
					: 'Kunne ikke lagre.';
		} finally {
			saving = false;
		}
	}

	function newCard(categoryId: string | null, photos: File[] = []): void {
		editorErrorMessage = '';
		newCardCategoryId = categoryId;
		newCardPhotos = photos;
		editingCard = null;
	}

	function pasteCard(event: ClipboardEvent): void {
		if (event.defaultPrevented || !canWrite) return;
		if (editingCard !== undefined || editingCategory !== undefined || openCard) return;
		const images = pastedImages(event);
		if (!images.length) return;
		event.preventDefault();
		newCard(null, images);
	}

	async function saveCard(
		cardId: string,
		draft: PlanningCardDraft,
		photos: PlanningPhotoChanges
	): Promise<void> {
		await save(
			() => savePlanningCard(resource.current(), cardId, draft, photos),
			() => (editingCard = undefined)
		);
	}

	async function saveCategory(draft: PlanningCategoryInput): Promise<void> {
		await save(
			() => savePlanningCategory(resource.current(), editingCategory?.id ?? null, draft),
			() => (editingCategory = undefined)
		);
	}

	async function deleteCategory(category: PlanningCategory): Promise<void> {
		if (!window.confirm(`Slette kategorien «${category.name}»? Kortene flyttes til Usortert.`)) {
			return;
		}
		await commit(
			() => deletePlanningCategory(resource.current(), category.id),
			'Kunne ikke slette kategorien.'
		);
	}

	async function deleteCard(card: PlanningCard): Promise<void> {
		if (!window.confirm(`Slette «${card.title}»?`)) return;
		await commit(
			() => deletePlanningCard(resource.current(), card.id),
			'Kunne ikke slette kortet.'
		);
		openCardId = undefined;
	}

	async function placeCard(
		cardId: string,
		categoryId: string | null,
		index: number
	): Promise<void> {
		await commit(
			() => placePlanningCard(resource.current(), cardId, categoryId, index),
			'Kunne ikke flytte kortet.'
		);
	}
</script>

<svelte:head>
	<title>Planlegging</title>
</svelte:head>

<svelte:window onpaste={pasteCard} />

<main class="mx-auto w-full max-w-5xl space-y-5 px-4 py-5 pb-10 lg:py-7">
	<header>
		<div class="flex h-7 items-center justify-between gap-3">
			<p class="flex items-center gap-1.5 text-sm font-semibold text-primary">
				<Lightbulb size={16} aria-hidden="true" /> Planlegging
			</p>
			<SyncStatus moduleId="planning" />
		</div>
		<h1 class="font-display mt-1 text-3xl font-bold text-neutral">Idéer for turen</h1>
	</header>

	<section class="flex flex-wrap items-end gap-2">
		<label class="flex min-w-40 flex-1 flex-col gap-1">
			<span class="label-text">Medlem</span>
			<select class="select-bordered select select-sm" bind:value={selectedPersonId}>
				{#each planning.people as person (person.id)}
					<option value={person.id}>{person.name}</option>
				{/each}
			</select>
		</label>
		<button
			class="btn btn-ghost btn-sm"
			type="button"
			disabled={!canWrite}
			onclick={() => {
				editorErrorMessage = '';
				editingCategory = null;
			}}
		>
			<FolderPlus size={18} aria-hidden="true" />
			<span>Ny kategori</span>
		</button>
		<button
			class="btn btn-primary btn-sm"
			type="button"
			disabled={!canWrite}
			onclick={() => newCard(null)}
		>
			<Plus size={18} aria-hidden="true" />
			<span>Nytt kort</span>
		</button>
	</section>

	{#if actionErrorMessage && !openCard}
		<p class="text-sm text-error" role="alert">{actionErrorMessage}</p>
	{/if}

	{#if sections.length === 0}
		<p class="border border-dashed border-base-300 px-4 py-8 text-center text-base-content/65">
			Ingen idéer ennå. Legg til et kort eller lag kategorier først.
		</p>
	{:else}
		<PlanningBoard
			{sections}
			categories={planning.categories}
			{canWrite}
			onopen={(cardId) => {
				actionErrorMessage = '';
				openCardId = cardId;
			}}
			onnewcard={(categoryId) => newCard(categoryId)}
			oneditcategory={(category) => {
				editorErrorMessage = '';
				editingCategory = category;
			}}
			ondeletecategory={deleteCategory}
			onplacecard={placeCard}
			onplacecategory={(categoryId, index) =>
				commit(
					() => placePlanningCategory(resource.current(), categoryId, index),
					'Kunne ikke flytte kategorien.'
				)}
		/>
	{/if}
</main>

{#if openCard && openSection}
	<PlanningCardDetail
		card={openCard}
		categories={planning.categories}
		people={planning.people}
		personId={selectedPersonId}
		sectionIndex={openSection.cards.findIndex(({ id }) => id === openCard.id)}
		sectionLength={openSection.cards.length}
		{canWrite}
		online={connectivity.online}
		errorMessage={actionErrorMessage}
		ontoggle={(itemId, checked) =>
			commit(
				() =>
					togglePlanningChecklistItem(
						resource.current(),
						openCard.id,
						itemId,
						selectedPersonId,
						checked
					),
				'Kunne ikke oppdatere sjekklisten.'
			)}
		oncategory={(categoryId) =>
			placeCard(
				openCard.id,
				categoryId,
				sections.find((section) => (section.category?.id ?? null) === categoryId)?.cards.length ?? 0
			)}
		onmove={(index) => placeCard(openCard.id, openCard.categoryId, index)}
		onretry={(linkId) =>
			commit(
				() => retryPlanningLinkPreview(resource.current(), linkId),
				'Kunne ikke hente forhåndsvisningen på nytt.'
			)}
		onreact={(reaction) =>
			commit(
				() => reactToPlanningCard(resource.current(), openCard.id, selectedPersonId, reaction),
				'Kunne ikke lagre reaksjonen.'
			)}
		onaddcomment={(body) =>
			commitComment(
				() => addPlanningComment(resource.current(), openCard.id, selectedPersonId, body),
				'Kunne ikke legge til kommentaren.'
			)}
		onupdatecomment={(commentId, body) =>
			commitComment(
				() => updatePlanningComment(resource.current(), openCard.id, commentId, body),
				'Kunne ikke lagre kommentaren.'
			)}
		ondeletecomment={(commentId) =>
			commitComment(
				() => deletePlanningComment(resource.current(), openCard.id, commentId),
				'Kunne ikke slette kommentaren.'
			)}
		onedit={() => {
			editorErrorMessage = '';
			editingCard = openCard;
		}}
		ondelete={() => deleteCard(openCard)}
		onclose={() => {
			actionErrorMessage = '';
			openCardId = undefined;
		}}
	/>
{/if}

{#if editingCard !== undefined}
	{#key editingCard?.id ?? 'new'}
		<PlanningCardEditor
			card={editingCard ?? undefined}
			categories={planning.categories}
			defaultCategoryId={newCardCategoryId}
			initialPhotos={editingCard ? [] : newCardPhotos}
			personId={selectedPersonId}
			{googlePlacesApiKey}
			online={connectivity.online}
			{saving}
			errorMessage={editorErrorMessage}
			onsave={saveCard}
			onclose={() => (editingCard = undefined)}
		/>
	{/key}
{/if}

{#if editingCategory !== undefined}
	{#key editingCategory?.id ?? 'new'}
		<PlanningCategoryEditor
			category={editingCategory ?? undefined}
			online={connectivity.online}
			{saving}
			errorMessage={editorErrorMessage}
			onsave={saveCategory}
			onclose={() => (editingCategory = undefined)}
		/>
	{/key}
{/if}
