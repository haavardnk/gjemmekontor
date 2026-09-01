<script lang="ts">
	import { ArrowDown, ArrowUp, GripVertical, Plus, Trash2 } from '@lucide/svelte';
	import { tick } from 'svelte';

	import type { MenuInstruction } from '$lib/modules/menu/domain/menu';

	let {
		instructions = $bindable(),
		instructionSections = $bindable()
	}: {
		instructions: MenuInstruction[];
		instructionSections: string[];
	} = $props();
	let draggedInstructionId = $state<string>();
	const visibleInstructionSections = $derived(
		instructions.some((instruction) => !instruction.section) || !instructionSections.length
			? ['', ...instructionSections]
			: instructionSections
	);

	function uniqueLabel(prefix: string, existing: readonly string[]): string {
		let index = 1;
		let candidate = prefix;
		while (existing.includes(candidate)) candidate = `${prefix} ${++index}`;
		return candidate;
	}

	async function addInstruction(section = ''): Promise<void> {
		const id = crypto.randomUUID();
		instructions = [...instructions, { id, section, text: '' }];
		await tick();
		document.getElementById(`instruction-text-${id}`)?.focus();
	}

	function addInstructionSection(): void {
		const section = uniqueLabel('Ny gruppe', instructionSections);
		instructionSections = [...instructionSections, section];
		void addInstruction(section);
	}

	function renameInstructionSection(previous: string, nextValue: string): void {
		const next = nextValue.trim();
		if (!next || next === previous || instructionSections.includes(next)) return;
		instructionSections = instructionSections.map((section) =>
			section === previous ? next : section
		);
		instructions = instructions.map((instruction) =>
			instruction.section === previous ? { ...instruction, section: next } : instruction
		);
	}

	function removeInstructionSection(section: string): void {
		instructionSections = instructionSections.filter((candidate) => candidate !== section);
		instructions = instructions.map((instruction) =>
			instruction.section === section ? { ...instruction, section: '' } : instruction
		);
	}

	function dropInstruction(section: string): void {
		if (!draggedInstructionId) return;
		instructions = instructions.map((instruction) =>
			instruction.id === draggedInstructionId ? { ...instruction, section } : instruction
		);
		draggedInstructionId = undefined;
	}

	function updateInstruction(id: string, field: 'section' | 'text', value: string): void {
		instructions = instructions.map((instruction) =>
			instruction.id === id ? { ...instruction, [field]: value } : instruction
		);
	}

	function moveInstruction(id: string, offset: number): void {
		const index = instructions.findIndex((instruction) => instruction.id === id);
		const instruction = instructions[index];
		if (!instruction) return;
		const sectionIndexes = instructions.flatMap((candidate, candidateIndex) =>
			candidate.section === instruction.section ? [candidateIndex] : []
		);
		const target = sectionIndexes[sectionIndexes.indexOf(index) + offset];
		if (target === undefined) return;
		const next = [...instructions];
		[next[index], next[target]] = [next[target]!, next[index]!];
		instructions = next;
	}
</script>

<section class="mt-8" aria-labelledby="instructions-title">
	<div class="mb-3 flex items-center justify-between gap-3">
		<div>
			<h3 id="instructions-title" class="font-display text-2xl font-bold">Fremgangsmåte</h3>
			<p class="text-sm text-base-content/55">{instructions.length} steg</p>
		</div>
		<button class="btn min-h-10 btn-outline btn-sm" type="button" onclick={addInstructionSection}
			><Plus size={16} /> Gruppe</button
		>
	</div>
	<div class="space-y-3">
		{#each visibleInstructionSections as section (section)}
			{@const sectionInstructions = instructions.filter(
				(instruction) => instruction.section === section
			)}
			<div
				class="rounded-box border border-base-300 bg-base-200/45 p-2.5 sm:p-3"
				role="group"
				aria-label={section ? `Oppskriftsgruppe ${section}` : 'Steg uten gruppe'}
				class:ring-2={draggedInstructionId}
				class:ring-primary={draggedInstructionId}
				ondragover={(event) => event.preventDefault()}
				ondrop={() => dropInstruction(section)}
			>
				<div class="mb-2 flex min-h-10 items-center gap-2 px-1">
					{#if section}<input
							class="input h-10 min-w-0 flex-1 input-ghost px-1 font-bold"
							value={section}
							onchange={(event) => renameInstructionSection(section, event.currentTarget.value)}
							aria-label={`Navn på oppskriftsgruppe ${section}`}
						/>{:else}<p class="min-w-0 flex-1 text-sm font-bold text-base-content/60">
							Uten gruppe
						</p>{/if}
					{#if section}<button
							class="btn btn-square h-10 min-h-10 w-10 min-w-10 btn-ghost text-error btn-sm"
							type="button"
							onclick={() => removeInstructionSection(section)}
							aria-label={`Fjern oppskriftsgruppe ${section}`}><Trash2 size={17} /></button
						>{/if}
				</div>
				<div class="space-y-2">
					{#each sectionInstructions as instruction, index (instruction.id)}
						<div
							class="rounded-box border border-base-300 bg-base-100 p-2.5 shadow-sm sm:p-3"
							data-testid="instruction-row"
						>
							<div class="mb-2 flex items-center gap-1">
								<button
									class="btn hidden btn-square h-10 min-h-10 w-10 min-w-10 cursor-grab btn-ghost btn-sm sm:inline-flex"
									type="button"
									draggable="true"
									ondragstart={() => (draggedInstructionId = instruction.id)}
									ondragend={() => (draggedInstructionId = undefined)}
									aria-label="Dra steg til en annen gruppe"><GripVertical size={17} /></button
								>
								<p class="min-w-0 flex-1 text-sm font-bold text-base-content/55">
									Steg {index + 1}
								</p>
								<button
									class="btn btn-square h-10 min-h-10 w-10 min-w-10 btn-ghost btn-sm"
									type="button"
									disabled={index === 0}
									onclick={() => moveInstruction(instruction.id, -1)}
									aria-label="Flytt steg opp"><ArrowUp size={17} /></button
								>
								<button
									class="btn btn-square h-10 min-h-10 w-10 min-w-10 btn-ghost btn-sm"
									type="button"
									disabled={index === sectionInstructions.length - 1}
									onclick={() => moveInstruction(instruction.id, 1)}
									aria-label="Flytt steg ned"><ArrowDown size={17} /></button
								>
								<button
									class="btn btn-square h-10 min-h-10 w-10 min-w-10 btn-ghost text-error btn-sm"
									type="button"
									onclick={() =>
										(instructions = instructions.filter(
											(candidate) => candidate.id !== instruction.id
										))}
									aria-label="Slett steg"><Trash2 size={17} /></button
								>
							</div>
							<textarea
								id={`instruction-text-${instruction.id}`}
								class="textarea-bordered textarea [field-sizing:content] min-h-28 w-full"
								value={instruction.text}
								oninput={(event) =>
									updateInstruction(instruction.id, 'text', event.currentTarget.value)}
								maxlength="4000"
								placeholder="Beskriv steget"
								aria-label={`Steg ${instruction.id}`}></textarea>
							{#if instructionSections.length}<select
									class="select-bordered select mt-2 w-full"
									value={instruction.section}
									onchange={(event) =>
										updateInstruction(instruction.id, 'section', event.currentTarget.value)}
									aria-label="Flytt steg til gruppe"
									><option value="">Uten gruppe</option
									>{#each instructionSections as candidate (candidate)}<option value={candidate}
											>{candidate}</option
										>{/each}</select
								>{/if}
						</div>
					{/each}
					<button
						class="btn mt-1 min-h-11 w-full border-dashed border-base-300 btn-ghost btn-sm"
						type="button"
						onclick={() => void addInstruction(section)}><Plus size={17} /> Steg</button
					>
				</div>
			</div>
		{/each}
	</div>
</section>
