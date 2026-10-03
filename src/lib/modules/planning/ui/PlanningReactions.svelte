<script lang="ts">
	import {
		type PlanningCard,
		type PlanningPerson,
		type PlanningReactionKind,
		reactionSummary
	} from '../domain/planning';
	import { planningReactionStyles } from './planning-reactions';

	let {
		card,
		people,
		personId,
		canWrite,
		onreact
	}: {
		card: PlanningCard;
		people: PlanningPerson[];
		personId: string;
		canWrite: boolean;
		onreact: (reaction: PlanningReactionKind) => Promise<void>;
	} = $props();

	const summary = $derived(reactionSummary(card));
	const names = (personIds: readonly string[]): string =>
		personIds
			.map((id) => people.find((person) => person.id === id)?.name)
			.filter(Boolean)
			.join(', ');
</script>

<section aria-labelledby="planning-card-reactions" class="space-y-2">
	<h3 id="planning-card-reactions" class="font-bold">Hva synes dere?</h3>
	<div class="flex flex-wrap gap-2">
		{#each summary as { reaction, personIds } (reaction)}
			<button
				class="btn h-10 min-h-10 gap-1.5 rounded-full px-3 btn-sm"
				class:btn-primary={personIds.includes(personId)}
				class:btn-ghost={!personIds.includes(personId)}
				type="button"
				disabled={!canWrite}
				aria-pressed={personIds.includes(personId)}
				aria-label={planningReactionStyles[reaction].label}
				onclick={() => onreact(reaction)}
			>
				<span aria-hidden="true">{planningReactionStyles[reaction].emoji}</span>
				<span aria-hidden="true">{personIds.length}</span>
			</button>
		{/each}
	</div>
	{#if card.reactions.length}
		<ul class="space-y-0.5 text-sm text-base-content/70">
			{#each summary.filter(({ personIds }) => personIds.length) as { reaction, personIds } (reaction)}
				<li>
					<span aria-hidden="true">{planningReactionStyles[reaction].emoji}</span>
					<span class="sr-only">{planningReactionStyles[reaction].label}:</span>
					{names(personIds)}
				</li>
			{/each}
		</ul>
	{/if}
</section>
