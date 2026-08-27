<script lang="ts">
	import { LoaderCircle, ScrollText, Shuffle, Users } from '@lucide/svelte';

	import { sharedState } from '$lib/client/state.svelte';
	import {
		nextSectionNumber,
		participantForDay,
		ruleBookGame,
		type RuleBookMember,
		ruleBookRuleKey,
		ruleBookRules,
		ruleBookRuleSchema,
		ruleForDay,
		serializeRuleBookRule
	} from '$lib/modules/rule-book/domain/rule-book';
	import { tripDayState } from '$lib/trip/day.svelte';
	import { dateKeyAt, tripDays } from '$lib/trip/itinerary';
	import SyncStatus from '$lib/ui/SyncStatus.svelte';

	let { members }: { members: RuleBookMember[] } = $props();
	let localMembers = $derived(members.map((member) => ({ ...member })));
	let errorMessage = $state('');
	let saving = $state(false);

	const game = $derived(ruleBookGame(sharedState.values));
	const activeGame = $derived(game?.status === 'active' ? game : undefined);
	const participants = $derived(
		localMembers
			.filter((member) => !member.optedOut)
			.map((member) => ({ id: member.id, name: member.name }))
	);
	const rules = $derived(ruleBookRules(sharedState.values));
	const todayIndex = $derived(tripDayState.todayIndex);
	let selectedRuleDayIndex = $derived(todayIndex);
	const selectedRule = $derived(
		selectedRuleDayIndex === undefined ? undefined : ruleForDay(rules, selectedRuleDayIndex)
	);
	const selectedParticipant = $derived(
		activeGame && selectedRuleDayIndex !== undefined
			? participantForDay(activeGame, selectedRuleDayIndex)
			: undefined
	);
	const todayParticipant = $derived(
		activeGame && todayIndex !== undefined ? participantForDay(activeGame, todayIndex) : undefined
	);
	let ruleText = $derived(selectedRule?.text ?? '');
	const tripPhase = $derived.by((): 'before' | 'during' | 'after' => {
		if (todayIndex !== undefined) return 'during';
		const currentDate = dateKeyAt(new Date());
		return currentDate < (tripDays[0]?.date ?? '') ? 'before' : 'after';
	});

	async function setParticipation(member: RuleBookMember, participating: boolean): Promise<void> {
		const previous = member.optedOut;
		member.optedOut = !participating;
		errorMessage = '';
		try {
			const response = await fetch('/api/rule-book/preferences', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ personId: member.id, optedOut: !participating })
			});
			if (!response.ok) throw new Error('PREFERENCE_FAILED');
		} catch {
			member.optedOut = previous;
			errorMessage = 'Kunne ikke lagre deltakervalget. Prøv igjen.';
		}
	}

	async function startGame(): Promise<void> {
		if (activeGame || participants.length < 2 || saving) return;
		saving = true;
		try {
			const response = await fetch('/api/rule-book/game', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ clientId: await sharedState.clientId() })
			});
			if (!response.ok) throw new Error('START_FAILED');
			await sharedState.sync();
			errorMessage = '';
		} catch {
			errorMessage = 'Kunne ikke starte spillet. Oppdater siden og prøv igjen.';
		} finally {
			saving = false;
		}
	}

	async function returnToSetup(): Promise<void> {
		if (!activeGame || rules.length > 0) return;
		if (!window.confirm('Vil du endre deltakerne? Det trekkes en ny rekkefølge.')) return;
		saving = true;
		try {
			const response = await fetch('/api/rule-book/game', {
				method: 'DELETE',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ clientId: await sharedState.clientId() })
			});
			if (!response.ok) throw new Error('RESET_FAILED');
			await sharedState.sync();
			errorMessage = '';
		} catch {
			errorMessage = 'Kunne ikke åpne deltakervalget igjen.';
		} finally {
			saving = false;
		}
	}

	async function saveRule(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		const text = ruleText.trim();
		if (!text || !activeGame || selectedRuleDayIndex === undefined || saving) return;
		saving = true;
		try {
			const timestamp = new Date().toISOString();
			const rule = ruleBookRuleSchema.parse({
				version: 1,
				dayIndex: selectedRuleDayIndex,
				sectionNumber: selectedRule?.sectionNumber ?? nextSectionNumber(rules),
				text,
				createdAt: selectedRule?.createdAt ?? timestamp,
				createdBy: selectedRule?.createdBy ?? (await sharedState.clientId()),
				updatedAt: timestamp
			});
			await sharedState.set(ruleBookRuleKey(selectedRuleDayIndex), serializeRuleBookRule(rule));
			errorMessage = '';
		} finally {
			saving = false;
		}
	}
</script>

<svelte:head><title>Regelbok · Gjemmekontor</title></svelte:head>

<section class="mx-auto max-w-3xl px-4 py-5 pb-10 lg:py-7">
	<header class="mb-5">
		<div class="flex h-7 items-center justify-between gap-3">
			<p class="flex items-center gap-1.5 text-sm font-semibold text-primary">
				<ScrollText size={16} /> Turens regler
			</p>
			<SyncStatus />
		</div>
		<div class="mt-1 flex items-center justify-between gap-3">
			<h1 class="font-display text-3xl font-bold text-neutral">Regelboka</h1>
			{#if activeGame && rules.length === 0}
				<button
					class="btn shrink-0 btn-outline btn-sm"
					type="button"
					onclick={returnToSetup}
					aria-label="Endre deltakere"
					title="Endre deltakere"
				>
					<Users size={16} />
					<span class="sm:hidden">Deltakere</span>
					<span class="hidden sm:inline">Endre deltakere</span>
				</button>
			{/if}
		</div>
	</header>

	{#if !sharedState.ready}
		<div class="flex min-h-48 items-center justify-center text-base-content/60">
			<LoaderCircle class="animate-spin" size={24} aria-hidden="true" />
			<span class="ml-2">Laster regelboka …</span>
		</div>
	{:else if !activeGame}
		<div class="rounded-box border border-base-300 bg-base-100 p-4 sm:p-5">
			<div class="mb-4 flex items-start gap-3">
				<div class="rounded-full bg-primary/10 p-2 text-primary"><Users size={22} /></div>
				<div>
					<h2 class="font-display text-xl font-bold text-neutral">Hvem er med?</h2>
					<p class="mt-1 text-sm text-base-content/65">
						Alle på reisen er med som standard. Fjern haken for dem som ikke vil delta.
					</p>
				</div>
			</div>

			{#if localMembers.length}
				<ul class="mt-4 space-y-2" aria-label="Deltakere">
					{#each localMembers as member (member.id)}
						<li class="rounded-box border border-base-300 bg-base-200/50 px-3 py-2">
							<label
								class="flex cursor-pointer items-center gap-3"
								for={`rule-book-member-${member.id}`}
							>
								<input
									id={`rule-book-member-${member.id}`}
									class="checkbox checkbox-sm checkbox-primary"
									type="checkbox"
									checked={!member.optedOut}
									onchange={(event) => setParticipation(member, event.currentTarget.checked)}
								/>
								<span class="font-medium text-neutral">{member.name}</span>
							</label>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="mt-4 text-sm text-base-content/55">
					Legg personer til reisen i Trip Settings før spillet kan startes.
				</p>
			{/if}

			{#if errorMessage}
				<p class="mt-3 text-sm text-error" role="alert">{errorMessage}</p>
			{/if}

			<button
				class="btn mt-5 w-full btn-primary"
				type="button"
				onclick={startGame}
				disabled={participants.length < 2 || saving}
			>
				{#if saving}<LoaderCircle class="animate-spin" size={18} />{:else}<Shuffle size={18} />{/if}
				Start spillet
			</button>
			{#if participants.length < 2}
				<p class="mt-2 text-center text-xs text-base-content/55">Minst to personer må være med.</p>
			{/if}
		</div>
	{:else}
		<div class="mb-5 rounded-box border border-primary/25 bg-primary/8 p-4">
			{#if tripPhase === 'before'}
				<p class="text-sm font-semibold text-primary">Spillet er klart</p>
				<p class="font-display mt-1 text-xl font-bold text-neutral">
					{participantForDay(activeGame, 0).name} lager den første regelen
				</p>
				<p class="mt-1 text-sm text-base-content/65">{tripDays[0]?.dateLabel}</p>
			{:else if tripPhase === 'during' && todayParticipant && todayIndex !== undefined}
				{#if !ruleForDay(rules, todayIndex)}
					<p class="text-sm font-semibold text-primary">{tripDays[todayIndex]?.dateLabel}</p>
					<p class="font-display mt-1 text-xl font-bold text-neutral">
						{todayParticipant.name} lager dagens regel
					</p>
				{:else if tripDays[todayIndex + 1]}
					<p class="text-sm font-semibold text-primary">{tripDays[todayIndex + 1]?.dateLabel}</p>
					<p class="font-display mt-1 text-xl font-bold text-neutral">
						{participantForDay(activeGame, todayIndex + 1).name} lager den neste regelen
					</p>
				{:else}
					<p class="text-sm font-semibold text-primary">Turen er over</p>
					<p class="font-display mt-1 text-xl font-bold text-neutral">Regelboka er komplett</p>
				{/if}
			{:else}
				<p class="text-sm font-semibold text-primary">Turen er over</p>
				<p class="font-display mt-1 text-xl font-bold text-neutral">Regelboka er komplett</p>
			{/if}
		</div>

		{#if tripPhase === 'during' && todayParticipant && todayIndex !== undefined}
			<form class="mb-5 rounded-box border border-base-300 bg-base-100 p-4" onsubmit={saveRule}>
				<div class="flex flex-wrap items-center justify-between gap-2">
					<label class="font-semibold text-neutral" for="daily-rule">
						{selectedRule
							? `Rediger § ${selectedRule.sectionNumber}`
							: `§ ${nextSectionNumber(rules)}`}
					</label>
					<div>
						<label class="sr-only" for="rule-book-day">Velg dag</label>
						<select id="rule-book-day" class="select select-sm" bind:value={selectedRuleDayIndex}>
							{#each tripDays.slice(0, todayIndex + 1) as day (day.date)}
								<option value={day.index}>{day.dateLabel}</option>
							{/each}
						</select>
					</div>
				</div>
				{#if selectedParticipant}
					<p class="mt-1 text-xs text-base-content/55">{selectedParticipant.name} sin regel</p>
				{/if}
				<textarea
					id="daily-rule"
					class="textarea mt-2 min-h-24 w-full"
					bind:value={ruleText}
					maxlength="500"
					placeholder="Skriv dagens regel …"></textarea>
				<div class="mt-2 flex justify-end">
					<button
						class="btn btn-primary btn-sm"
						type="submit"
						disabled={!ruleText.trim() || saving}
					>
						{#if saving}<LoaderCircle class="animate-spin" size={17} />{/if}
						{selectedRule ? 'Lagre endring' : 'Legg til regel'}
					</button>
				</div>
			</form>
		{/if}

		<details class="mb-5 rounded-box border border-base-300 bg-base-100">
			<summary class="cursor-pointer px-4 py-3 font-semibold text-neutral">Rekkefølge</summary>
			<ol class="grid gap-2 px-4 pb-4 sm:grid-cols-2">
				{#each activeGame.participantOrder as participant, index (participant.id)}
					<li class="flex items-center gap-2 rounded-box bg-base-200 px-3 py-2 text-sm">
						<span
							class="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary"
						>
							{index + 1}
						</span>
						{participant.name}
					</li>
				{/each}
			</ol>
		</details>

		<div class="rounded-box border border-base-300 bg-base-100 p-4 sm:p-5">
			<h2 class="font-display text-2xl font-bold text-neutral">Regelboka</h2>
			{#if rules.length}
				<ol class="mt-4 space-y-5">
					{#each rules as rule (rule.dayIndex)}
						<li class="grid grid-cols-[auto_1fr] gap-3">
							<span class="font-display text-lg font-bold whitespace-nowrap text-primary">
								§ {rule.sectionNumber}
							</span>
							<p class="whitespace-pre-wrap text-base-content">{rule.text}</p>
						</li>
					{/each}
				</ol>
			{:else}
				<p class="mt-3 text-sm text-base-content/55">Ingen regler ennå.</p>
			{/if}
		</div>
	{/if}
</section>
