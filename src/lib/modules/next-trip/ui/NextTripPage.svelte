<script lang="ts">
	import { MapPin, Plus } from '@lucide/svelte';
	import { onMount } from 'svelte';

	import { createCachedResource } from '$lib/client/cached-resource';
	import { connectivity } from '$lib/client/connectivity.svelte';
	import SyncStatus from '$lib/ui/SyncStatus.svelte';

	import { nextTripCache } from '../client/cache';
	import {
		type NextTripPageData,
		type NextTripSort,
		type NextTripSuggestion,
		sortNextTripSuggestions
	} from '../domain/next-trip';
	import {
		addNextTripComment,
		deleteNextTripComment,
		deleteNextTripSuggestion,
		rateNextTripSuggestion,
		saveNextTripSuggestion,
		updateNextTripComment,
		updateNextTripSuggestion
	} from './next-trip-commands';
	import NextTripSuggestionCard from './NextTripSuggestionCard.svelte';
	import NextTripSuggestionEditor from './NextTripSuggestionEditor.svelte';

	let { people, suggestions }: Pick<NextTripPageData, 'people' | 'suggestions'> = $props();
	let selectedPersonId = $state('');
	let sort = $state<NextTripSort>('best');
	let editingSuggestion = $state<NextTripSuggestion | null>();
	let editorErrorMessage = $state('');
	let actionErrorMessage = $state('');
	let saving = $state(false);

	const resource = createCachedResource({
		...nextTripCache,
		read: () => ({ people, suggestions }),
		write: (value) => {
			people = value.people;
			suggestions = value.suggestions;
		}
	});

	const selectedPerson = $derived(people.find((person) => person.id === selectedPersonId));
	const visibleSuggestions = $derived(sortNextTripSuggestions(suggestions, sort));

	$effect(() => {
		if (!people.some((person) => person.id === selectedPersonId)) {
			selectedPersonId = people[0]?.id ?? '';
		}
	});

	onMount(() => {
		return resource.start();
	});

	async function saveSuggestion(draft: {
		destination: string;
		note: string;
		url: string;
	}): Promise<void> {
		if (!connectivity.online || saving) return;
		saving = true;
		editorErrorMessage = '';
		try {
			const mutation = editingSuggestion
				? updateNextTripSuggestion(resource.current(), editingSuggestion.id, draft)
				: saveNextTripSuggestion(resource.current(), {
						...draft,
						submittedByPersonId: selectedPersonId
					});
			await resource.commitMutation(mutation);
			editingSuggestion = undefined;
		} catch (error) {
			editorErrorMessage =
				error instanceof Error && error.message === 'NEXT_TRIP_MEMBER_REQUIRED'
					? 'Velg et aktivt medlem.'
					: 'Kunne ikke lagre forslaget.';
		} finally {
			saving = false;
		}
	}

	async function rate(suggestionId: string, score: number): Promise<void> {
		if (!connectivity.online || !selectedPerson) return;
		actionErrorMessage = '';
		try {
			await resource.commitMutation(
				rateNextTripSuggestion(resource.current(), suggestionId, selectedPerson.id, score)
			);
		} catch {
			actionErrorMessage = 'Kunne ikke lagre vurderingen.';
		}
	}

	async function deleteSuggestion(suggestionId: string, destination: string): Promise<void> {
		if (!connectivity.online) return;
		if (!window.confirm(`Slette «${destination}»?`)) return;
		actionErrorMessage = '';
		try {
			await resource.commitMutation(deleteNextTripSuggestion(resource.current(), suggestionId));
		} catch {
			actionErrorMessage = 'Kunne ikke slette forslaget.';
		}
	}

	async function addComment(suggestionId: string, body: string): Promise<void> {
		if (!connectivity.online) return;
		actionErrorMessage = '';
		try {
			await resource.commitMutation(
				addNextTripComment(resource.current(), suggestionId, selectedPersonId, body)
			);
		} catch (error) {
			actionErrorMessage = 'Kunne ikke legge til kommentaren.';
			throw error;
		}
	}

	async function updateComment(
		suggestionId: string,
		commentId: string,
		body: string
	): Promise<void> {
		if (!connectivity.online) return;
		actionErrorMessage = '';
		try {
			await resource.commitMutation(
				updateNextTripComment(resource.current(), suggestionId, commentId, body)
			);
		} catch (error) {
			actionErrorMessage = 'Kunne ikke lagre kommentaren.';
			throw error;
		}
	}

	async function deleteComment(suggestionId: string, commentId: string): Promise<void> {
		if (!connectivity.online) return;
		actionErrorMessage = '';
		try {
			await resource.commitMutation(
				deleteNextTripComment(resource.current(), suggestionId, commentId)
			);
		} catch (error) {
			actionErrorMessage = 'Kunne ikke slette kommentaren.';
			throw error;
		}
	}
</script>

<svelte:head>
	<title>Neste tur</title>
</svelte:head>

<main class="mx-auto w-full max-w-3xl space-y-5 px-4 py-5 pb-10 lg:py-7">
	<header class="mb-4">
		<div class="flex h-7 items-center justify-between gap-3">
			<p class="flex items-center gap-1.5 text-sm font-semibold text-primary">
				<MapPin size={16} aria-hidden="true" /> Neste tur
			</p>
			<SyncStatus moduleId="next-trip" />
		</div>
		<h1 class="font-display mt-1 text-3xl font-bold text-neutral">Hvor drar vi?</h1>
	</header>

	<section class="py-1">
		<div class="flex items-end gap-2">
			<label class="flex min-w-0 flex-1 flex-col gap-1">
				<span class="label-text">Medlem</span>
				<select class="select-bordered select select-sm" bind:value={selectedPersonId}>
					{#each people as person (person.id)}
						<option value={person.id}>{person.name}</option>
					{/each}
				</select>
			</label>
			<button
				class="btn shrink-0 btn-primary btn-sm"
				type="button"
				disabled={!connectivity.online || !selectedPersonId}
				onclick={() => {
					editorErrorMessage = '';
					editingSuggestion = null;
				}}
			>
				<Plus size={18} aria-hidden="true" />
				<span>Nytt forslag</span>
			</button>
		</div>
	</section>

	<section aria-labelledby="list-heading" class="space-y-3">
		<div class="flex flex-wrap items-end justify-between gap-3">
			<div>
				<h2 id="list-heading" class="font-display text-2xl">Forslag</h2>
				<p class="text-sm text-base-content/65">{suggestions.length} forslag</p>
			</div>
			<label class="flex w-full flex-col gap-1 sm:w-44">
				<span class="label-text">Sorter</span>
				<select class="select-bordered select select-sm" bind:value={sort}>
					<option value="best">Best likt</option>
					<option value="newest">Nyeste</option>
					<option value="name">Navn</option>
				</select>
			</label>
		</div>
		{#if actionErrorMessage}<p class="text-sm text-error" role="alert">{actionErrorMessage}</p>{/if}

		{#if visibleSuggestions.length === 0}
			<p class="border border-dashed border-base-300 px-4 py-8 text-center text-base-content/65">
				Ingen forslag ennå.
			</p>
		{:else}
			<div class="space-y-3">
				{#each visibleSuggestions as suggestion (suggestion.id)}
					<NextTripSuggestionCard
						{suggestion}
						{selectedPersonId}
						online={connectivity.online}
						onrate={(score) => rate(suggestion.id, score)}
						onedit={() => {
							editorErrorMessage = '';
							editingSuggestion = suggestion;
						}}
						ondelete={() => deleteSuggestion(suggestion.id, suggestion.destination)}
						onaddcomment={(body) => addComment(suggestion.id, body)}
						onupdatecomment={(commentId, body) => updateComment(suggestion.id, commentId, body)}
						ondeletecomment={(commentId) => deleteComment(suggestion.id, commentId)}
					/>
				{/each}
			</div>
		{/if}
	</section>
</main>

{#if editingSuggestion !== undefined}
	{#key editingSuggestion?.id ?? 'new'}
		<NextTripSuggestionEditor
			suggestion={editingSuggestion ?? undefined}
			online={connectivity.online}
			{saving}
			errorMessage={editorErrorMessage}
			onsave={saveSuggestion}
			onclose={() => (editingSuggestion = undefined)}
		/>
	{/key}
{/if}
