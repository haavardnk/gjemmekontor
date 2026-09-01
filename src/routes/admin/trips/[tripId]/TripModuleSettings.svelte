<script lang="ts">
	import { ArrowDown, ArrowUp, GripVertical, Save } from '@lucide/svelte';
	import { untrack } from 'svelte';

	import type { PageData } from './$types';

	let { configuredModules }: { configuredModules: PageData['settings']['modules'] } = $props();
	let modules = $state(untrack(() => configuredModules.map((module) => ({ ...module }))));
	let loadedModules = $state(untrack(() => JSON.stringify(configuredModules)));
	let draggedIndex = $state<number>();

	$effect(() => {
		const fingerprint = JSON.stringify(configuredModules);
		if (fingerprint === loadedModules) return;
		modules = configuredModules.map((module) => ({ ...module }));
		loadedModules = fingerprint;
	});

	function move(index: number, direction: -1 | 1): void {
		const target = index + direction;
		if (target < 0 || target >= modules.length) return;
		const [module] = modules.splice(index, 1);
		if (module) modules.splice(target, 0, module);
	}

	function drop(target: number): void {
		if (draggedIndex === undefined || draggedIndex === target) return;
		const [module] = modules.splice(draggedIndex, 1);
		if (module) modules.splice(target, 0, module);
		draggedIndex = undefined;
	}
</script>

<form method="post" action="?/modules" class="card border border-base-300 bg-base-100 p-5">
	<h2 class="mb-2 text-xl font-bold">Moduler og rekkefølge</h2>
	<p class="mb-4 text-sm text-base-content/65">
		Dra modulene eller bruk pilene. Rekkefølgen brukes i hele navigasjonen.
	</p>
	<input
		type="hidden"
		name="moduleOrder"
		value={JSON.stringify(modules.map((module) => module.id))}
	/>
	<div class="space-y-2">
		{#each modules as module, index (module.id)}
			<div
				class="flex items-center gap-2 rounded-box border border-base-300 p-3"
				role="listitem"
				draggable={true}
				ondragstart={() => (draggedIndex = index)}
				ondragover={(event) => event.preventDefault()}
				ondrop={() => drop(index)}
			>
				<GripVertical class="cursor-grab text-base-content/40" size={19} />
				<input
					class="checkbox checkbox-primary"
					type="checkbox"
					name="enabledModuleId"
					value={module.id}
					bind:checked={module.enabled}
					aria-label={`Aktiver ${module.label}`}
				/>
				<span class="grow font-semibold">{module.label}</span>
				<button
					class="btn btn-square btn-ghost btn-sm"
					type="button"
					onclick={() => move(index, -1)}
					disabled={index === 0}
					aria-label={`Flytt ${module.label} opp`}><ArrowUp size={17} /></button
				>
				<button
					class="btn btn-square btn-ghost btn-sm"
					type="button"
					onclick={() => move(index, 1)}
					disabled={index === modules.length - 1}
					aria-label={`Flytt ${module.label} ned`}><ArrowDown size={17} /></button
				>
			</div>
		{/each}
	</div>
	<button class="btn mt-4 self-end btn-primary" type="submit"
		><Save size={18} /> Lagre moduler</button
	>
</form>
