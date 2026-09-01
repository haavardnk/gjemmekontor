<script lang="ts">
	import { ChevronDown, CirclePlus, Search, X } from '@lucide/svelte';

	import { sharedState } from '$lib/client/state.svelte';
	import type { TripDay } from '$lib/trip/itinerary';

	import type { ShotModule } from '../domain/pack';

	let {
		day,
		modules,
		activityModuleIds,
		scenarioGroups
	}: {
		day: TripDay & { modules: string[] };
		modules: Record<string, ShotModule>;
		activityModuleIds: string[];
		scenarioGroups: Array<{ title: string; ids: string[] }>;
	} = $props();
	let scenarioQuery = $state('');
	let expandedGroups = $state<Record<string, boolean>>({});

	const selectedModuleIds = $derived(
		activityModuleIds.filter((id) => checked(fieldKey(`scenario:${id}`)))
	);
	const dayModules = $derived([
		...day.modules.map((id) => ({ id, module: modules[id], optional: false })),
		...selectedModuleIds
			.filter((id) => !day.modules.includes(id))
			.map((id) => ({ id, module: modules[id], optional: true }))
	]);
	const normalizedScenarioQuery = $derived(scenarioQuery.trim().toLocaleLowerCase('nb-NO'));
	const availableModuleIds = $derived(
		activityModuleIds
			.filter((id) => !day.modules.includes(id) && !selectedModuleIds.includes(id))
			.filter((id) =>
				[modules[id].title, ...modules[id].shots.map((shot) => shot.text)]
					.join(' ')
					.toLocaleLowerCase('nb-NO')
					.includes(normalizedScenarioQuery)
			)
	);
	const availableGroups = $derived(
		scenarioGroups
			.map((group) => ({
				title: group.title,
				ids: group.ids.filter((id) => availableModuleIds.includes(id))
			}))
			.filter((group) => group.ids.length > 0)
	);

	function fieldKey(field: string): string {
		return `shots:d${day.index}:${field}`;
	}

	function checked(key: string): boolean {
		return sharedState.values[key] === true;
	}

	function toggle(key: string): void {
		void sharedState.set(key, !checked(key));
	}

	function addScenario(id: string): void {
		void sharedState.set(fieldKey(`scenario:${id}`), true);
	}

	function removeScenario(id: string): void {
		void sharedState.set(fieldKey(`scenario:${id}`), false);
	}

	function groupOpen(title: string): boolean {
		return Boolean(normalizedScenarioQuery) || expandedGroups[title] === true;
	}

	function toggleGroup(title: string, event: MouseEvent): void {
		event.preventDefault();
		if (normalizedScenarioQuery) {
			return;
		}
		expandedGroups[title] = expandedGroups[title] !== true;
	}

	function roll(moduleId: string, index: number): 'A-roll' | 'B-roll' {
		return modules[moduleId].aRoll.includes(index) ? 'A-roll' : 'B-roll';
	}

	function camera(moduleId: string, index: number): string | undefined {
		return modules[moduleId].shots[index]?.camera;
	}
</script>

<div class="space-y-5">
	{#if dayModules.length > 0}
		<section>
			<div class="mb-2">
				<h2 class="font-display text-lg font-bold">Dagens scener</h2>
				<p class="text-xs text-base-content/50">
					A-roll: handling og reaksjoner · B-roll: detaljer og overganger
				</p>
			</div>
			<div class="space-y-2">
				{#each dayModules as item (item.id)}
					<details
						class="group rounded-lg border border-base-300 bg-base-100"
						data-selected-scenario-id={item.optional ? item.id : undefined}
					>
						<summary class="flex cursor-pointer list-none items-center gap-3 px-3 py-2.5">
							<span class="min-w-0 flex-1">
								<span class="block font-semibold">{item.module.title}</span>
								<span class="block text-xs text-base-content/50"
									>{item.module.shots.length} klipp</span
								>
							</span>
							<ChevronDown class="shrink-0 transition-transform group-open:rotate-180" size={18} />
						</summary>
						<div class="space-y-1 border-t border-base-300 p-2">
							{#each item.module.shots as shot, index (`${item.id}-${index}`)}
								<button
									class={`flex w-full items-start gap-2 rounded p-2 text-left text-sm hover:bg-base-200 ${checked(fieldKey(`${item.optional ? 'activity' : 'module'}:${item.id}:${index}`)) ? 'bg-primary/10' : ''}`}
									type="button"
									disabled={!sharedState.ready}
									onclick={() =>
										toggle(
											fieldKey(`${item.optional ? 'activity' : 'module'}:${item.id}:${index}`)
										)}
									aria-pressed={checked(
										fieldKey(`${item.optional ? 'activity' : 'module'}:${item.id}:${index}`)
									)}
								>
									<span class="mt-0.5 font-bold">
										{checked(
											fieldKey(`${item.optional ? 'activity' : 'module'}:${item.id}:${index}`)
										)
											? '✓'
											: '○'}
									</span>
									<span class="min-w-0 flex-1">
										<span class="block leading-5">{shot.text}</span>
										<small class="mt-1 flex flex-wrap gap-1.5 text-base-content/55">
											<span class="rounded bg-base-300 px-1.5 py-0.5 font-semibold">
												{roll(item.id, index)}
											</span>
											{#if camera(item.id, index)}
												<span class="py-0.5">Forslag: {camera(item.id, index)}</span>
											{/if}
										</small>
									</span>
								</button>
							{/each}
							{#if item.optional}
								<button
									class="btn mt-2 btn-ghost btn-sm"
									type="button"
									onclick={() => removeScenario(item.id)}
								>
									<X size={16} />
									Fjern fra dagen
								</button>
							{/if}
						</div>
					</details>
				{/each}
			</div>
		</section>
	{/if}

	{#if availableGroups.length > 0}
		<section>
			<div class="mb-2 flex flex-wrap items-end justify-between gap-3">
				<div>
					<h2 class="font-display text-lg font-bold">Scenebank</h2>
					<p class="text-xs text-base-content/55">Åpne en scene før du legger den til.</p>
				</div>
				<label class="input flex w-full items-center gap-2 bg-base-100 input-sm sm:w-64">
					<Search size={16} />
					<input
						class="min-w-0 grow"
						type="search"
						placeholder="Finn scene"
						aria-label="Finn scene"
						bind:value={scenarioQuery}
					/>
				</label>
			</div>
			<div class="space-y-4">
				{#each availableGroups as group (group.title)}
					<details
						class="group rounded-lg border border-base-300 bg-base-200/40"
						open={groupOpen(group.title)}
						data-scene-group={group.title}
					>
						<summary
							class="flex cursor-pointer list-none items-center justify-between px-3 py-2.5"
							onclick={(event) => toggleGroup(group.title, event)}
						>
							<h3 class="text-xs font-bold tracking-wide text-base-content/65 uppercase">
								{group.title}
							</h3>
							<span class="text-xs text-base-content/45">{group.ids.length}</span>
						</summary>
						<div class="grid items-start gap-2 border-t border-base-300 p-2 sm:grid-cols-2">
							{#each group.ids as moduleId (moduleId)}
								{@const module = modules[moduleId]}
								<details
									class="group rounded-lg border border-base-300 bg-base-100"
									data-scenario-id={moduleId}
								>
									<summary class="flex cursor-pointer list-none items-center gap-3 px-3 py-2.5">
										<span class="min-w-0 flex-1">
											<span class="block font-semibold">{module.title}</span>
											<span class="block text-xs text-base-content/50">
												{module.shots.length} klipp
											</span>
										</span>
										<ChevronDown
											class="shrink-0 transition-transform group-open:rotate-180"
											size={18}
										/>
									</summary>
									<div class="space-y-2 border-t border-base-300 p-3">
										<ul class="space-y-2">
											{#each module.shots as shot, index (`preview-${moduleId}-${index}`)}
												<li class="text-sm leading-5">
													<span
														class="mr-1.5 rounded bg-base-300 px-1.5 py-0.5 text-xs font-semibold"
													>
														{roll(moduleId, index)}
													</span>
													{shot.text}
													{#if camera(moduleId, index)}
														<small class="block pl-1 text-base-content/50">
															Forslag: {camera(moduleId, index)}
														</small>
													{/if}
												</li>
											{/each}
										</ul>
										<button
											class="btn w-full btn-primary btn-sm"
											type="button"
											disabled={!sharedState.ready}
											onclick={() => addScenario(moduleId)}
										>
											<CirclePlus size={16} />
											Legg til dagens scener
										</button>
									</div>
								</details>
							{/each}
						</div>
					</details>
				{/each}
			</div>
		</section>
	{:else if normalizedScenarioQuery}
		<section>
			<h2 class="font-display mb-3 text-xl font-bold">Scenebank</h2>
			<label class="input flex w-full items-center gap-2 bg-base-100 input-sm sm:w-64">
				<Search size={16} />
				<input
					class="min-w-0 grow"
					type="search"
					placeholder="Finn scene"
					aria-label="Finn scene"
					bind:value={scenarioQuery}
				/>
			</label>
			<p class="mt-3 text-sm text-base-content/55">Ingen scener passer med søket.</p>
		</section>
	{/if}
</div>
