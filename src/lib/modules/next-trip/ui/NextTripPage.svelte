<script lang="ts">
	import { MapPin, Plus, Star, Trash2 } from '@lucide/svelte';
	import { onMount } from 'svelte';

	import { offlineApi } from '$lib/client/offline-api.svelte';
	import { createOfflineResource } from '$lib/client/offline-resource';
	import ModalDialog from '$lib/ui/ModalDialog.svelte';
	import SyncStatus from '$lib/ui/SyncStatus.svelte';

	import {
		type NextTripPageData,
		nextTripPageDataSchema,
		type NextTripSort,
		sortNextTripSuggestions,
		suggestionRatingSummary
	} from '../domain/next-trip';
	import {
		deleteNextTripSuggestion,
		rateNextTripSuggestion,
		saveNextTripSuggestion
	} from './next-trip-commands';

	let { people, suggestions }: Pick<NextTripPageData, 'people' | 'suggestions'> = $props();
	let selectedPersonId = $state('');
	let sort = $state<NextTripSort>('best');
	let destination = $state('');
	let note = $state('');
	let url = $state('');
	let addErrorMessage = $state('');
	let actionErrorMessage = $state('');
	let saving = $state(false);
	let addDialog = $state<HTMLDialogElement>(undefined!);

	const resource = createOfflineResource({
		moduleId: 'next-trip',
		snapshotKey: 'next-trip:snapshot:current',
		endpoint: '/api/next-trip',
		schema: nextTripPageDataSchema,
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
		const stop = resource.start();
		void offlineApi.retryConflicts('next-trip').catch(() => undefined);
		return stop;
	});

	async function addSuggestion(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		if (saving) return;
		saving = true;
		addErrorMessage = '';
		try {
			await resource.commitMutation(
				saveNextTripSuggestion(resource.current(), {
					destination,
					note,
					url,
					submittedByPersonId: selectedPersonId
				})
			);
			destination = '';
			note = '';
			url = '';
			addDialog.close();
		} catch (error) {
			addErrorMessage =
				error instanceof Error && error.message === 'NEXT_TRIP_MEMBER_REQUIRED'
					? 'Velg et aktivt medlem.'
					: 'Kunne ikke legge til forslaget.';
		} finally {
			saving = false;
		}
	}

	async function rate(suggestionId: string, score: number): Promise<void> {
		if (!selectedPerson) return;
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
		if (!window.confirm(`Slette «${destination}»?`)) return;
		actionErrorMessage = '';
		try {
			await resource.commitMutation(deleteNextTripSuggestion(resource.current(), suggestionId));
		} catch {
			actionErrorMessage = 'Kunne ikke slette forslaget.';
		}
	}

	function currentRating(suggestion: NextTripPageData['suggestions'][number]): number {
		return suggestion.ratings.find((rating) => rating.personId === selectedPersonId)?.score ?? 0;
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
				disabled={!selectedPersonId}
				onclick={() => addDialog.showModal()}
			>
				<Plus size={18} aria-hidden="true" />
				<span>Nytt forslag</span>
			</button>
		</div>
	</section>

	<ModalDialog bind:dialog={addDialog} labelledBy="add-heading">
		<div class="space-y-4">
			<div class="flex items-start justify-between gap-4">
				<h2 id="add-heading" class="font-display text-2xl">Nytt reiseforslag</h2>
				<form method="dialog">
					<button class="btn btn-ghost btn-sm" type="submit">Lukk</button>
				</form>
			</div>
			<form class="space-y-3" onsubmit={addSuggestion}>
				<label class="flex flex-col gap-1">
					<span class="label-text">Hvor?</span>
					<input class="input-bordered input" bind:value={destination} required maxlength="200" />
				</label>
				<label class="flex flex-col gap-1">
					<span class="label-text">Hvorfor?</span>
					<textarea class="textarea-bordered textarea min-h-20" bind:value={note} maxlength="1000"
					></textarea>
				</label>
				<label class="flex flex-col gap-1">
					<span class="label-text">Lenke</span>
					<input class="input-bordered input" type="url" bind:value={url} placeholder="https://" />
				</label>
				<button class="btn w-full btn-primary" type="submit" disabled={saving || !selectedPersonId}
					>Legg til forslag</button
				>
			</form>
			{#if addErrorMessage}<p class="text-sm text-error" role="alert">{addErrorMessage}</p>{/if}
		</div>
	</ModalDialog>

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
					{@const summary = suggestionRatingSummary(suggestion)}
					<article class="space-y-3 rounded-box border border-base-300 p-4">
						<div class="flex items-start justify-between gap-3">
							<div class="min-w-0">
								<h3 class="font-display text-2xl wrap-break-word">{suggestion.destination}</h3>
								<p class="text-sm text-base-content/60">Forslag fra {suggestion.submittedByName}</p>
							</div>
							<div class="shrink-0 text-right">
								<strong class="text-xl">{summary.average ? summary.average.toFixed(1) : '–'}</strong
								>
								<p class="text-xs text-base-content/60">
									{summary.count}
									{summary.count === 1 ? 'vurdering' : 'vurderinger'}
								</p>
							</div>
						</div>
						{#if suggestion.note}<p>{suggestion.note}</p>{/if}
						{#if suggestion.url}<button
								class="link text-sm break-all link-primary"
								type="button"
								onclick={() => window.open(suggestion.url, '_blank', 'noopener,noreferrer')}
								>Les mer</button
							>{/if}
						<div class="flex items-center justify-between gap-2">
							{#if selectedPerson}
								<div
									class="flex items-center gap-1"
									role="group"
									aria-label={`Din vurdering: ${currentRating(suggestion) || 'ikke vurdert'}`}
								>
									{#each [1, 2, 3, 4, 5] as score (score)}
										<button
											class="btn btn-square btn-ghost btn-sm"
											type="button"
											aria-label={`${score} stjerner`}
											aria-pressed={score === currentRating(suggestion)}
											onclick={() => rate(suggestion.id, score)}
										>
											<Star
												size={20}
												fill={score <= currentRating(suggestion) ? 'currentColor' : 'none'}
											/>
										</button>
									{/each}
								</div>
							{/if}
							<button
								class="btn ml-auto btn-square btn-ghost text-error btn-sm"
								type="button"
								aria-label={`Slett ${suggestion.destination}`}
								title="Slett forslag"
								onclick={() => deleteSuggestion(suggestion.id, suggestion.destination)}
							>
								<Trash2 size={17} aria-hidden="true" />
							</button>
						</div>
					</article>
				{/each}
			</div>
		{/if}
	</section>
</main>
