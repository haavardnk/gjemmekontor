<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- Recipe sources are validated external HTTPS URLs. */
	import {
		ArrowDown,
		ArrowUp,
		Check,
		CookingPot,
		ExternalLink,
		ListChecks,
		MoveHorizontal,
		X
	} from '@lucide/svelte';
	import { onMount } from 'svelte';

	import {
		ingredientMeasurement,
		type IngredientMeasurementMode
	} from '$lib/modules/menu/domain/densities';
	import type { MenuArchive } from '$lib/modules/menu/domain/menu';
	import { scaledIngredientQuantityText } from '$lib/modules/menu/domain/quantities';

	import { CookingBrowserSession, cookingGesture, type PointerPosition } from './cooking-session';

	let {
		archive,
		plannedServings,
		onClose
	}: { archive: MenuArchive; plannedServings: number; onClose: () => void } = $props();
	let cooking = $state(false);
	let showCookingIngredients = $state(false);
	let currentStep = $state(0);
	let checkedIngredientIds = $state<string[]>([]);
	let measurementMode = $state<IngredientMeasurementMode>('original');
	let gestureStart = $state<PointerPosition>();
	let wakeLockActive = $state(false);
	let wakeLockSupported = $state(true);
	let imageFailed = $state(false);
	const cookingSession = new CookingBrowserSession((state) => {
		wakeLockActive = state.active;
		wakeLockSupported = state.supported;
	});
	const measurementOptions: Array<{ value: IngredientMeasurementMode; label: string }> = [
		{ value: 'original', label: 'Original' },
		{ value: 'mass', label: 'Vekt' },
		{ value: 'volume', label: 'Volum' }
	];

	const steps = $derived(archive.instructions);
	const activeStep = $derived(steps[currentStep]);
	const checkedIngredientCount = $derived(checkedIngredientIds.length);

	function previousStep(): void {
		if (currentStep > 0) currentStep -= 1;
	}

	function nextStep(): void {
		if (currentStep < steps.length - 1) currentStep += 1;
	}

	function toggleIngredient(id: string): void {
		checkedIngredientIds = checkedIngredientIds.includes(id)
			? checkedIngredientIds.filter((candidate) => candidate !== id)
			: [...checkedIngredientIds, id];
	}

	function beginGesture(event: PointerEvent): void {
		gestureStart = { x: event.clientX, y: event.clientY };
	}

	function endGesture(event: PointerEvent): void {
		if (!gestureStart) return;
		const action = cookingGesture(
			gestureStart,
			{ x: event.clientX, y: event.clientY },
			showCookingIngredients
		);
		gestureStart = undefined;
		if (action === 'ingredients') showCookingIngredients = !showCookingIngredients;
		else if (action === 'next') nextStep();
		else if (action === 'previous') previousStep();
	}

	function handleCookingKeydown(event: KeyboardEvent): void {
		if (!cooking) return;
		if (event.key === 'Escape') void stopCooking();
		else if (event.key === 'ArrowDown') nextStep();
		else if (event.key === 'ArrowUp') previousStep();
		else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
			showCookingIngredients = !showCookingIngredients;
		} else return;
		event.preventDefault();
	}

	async function startCooking(): Promise<void> {
		cooking = true;
		currentStep = 0;
		showCookingIngredients = false;
		checkedIngredientIds = [];
		measurementMode = 'original';
		await cookingSession.start();
	}

	async function stopCooking(): Promise<void> {
		cooking = false;
		showCookingIngredients = false;
		await cookingSession.stop();
	}

	onMount(() => cookingSession.mount());
</script>

<svelte:window onkeydown={handleCookingKeydown} />

{#if !cooking}<div
		class="modal modal-open"
		role="dialog"
		aria-modal="true"
		aria-labelledby="recipe-title"
	>
		<div class="modal-box flex max-h-[94dvh] max-w-3xl flex-col p-0">
			<header class="flex items-start justify-between gap-4 border-b border-base-300 p-4 sm:p-5">
				<div class="min-w-0">
					<p class="text-xs font-bold text-primary">Oppskrift</p>
					<h2 id="recipe-title" class="font-display truncate text-2xl font-bold text-neutral">
						{archive.name}
					</h2>
				</div>
				<button
					class="btn btn-square btn-ghost btn-sm"
					type="button"
					onclick={onClose}
					aria-label="Lukk oppskriften"
				>
					<X size={20} />
				</button>
			</header>

			<div class="min-h-0 overflow-y-auto p-4 sm:p-6">
				{#if archive.imageUrl && !imageFailed}
					<img
						class="mb-5 h-52 w-full rounded-box object-cover"
						src={`/api/menu/image?url=${encodeURIComponent(archive.imageUrl)}`}
						alt=""
						loading="lazy"
						onerror={() => (imageFailed = true)}
					/>
				{/if}
				<div class="mb-5 flex flex-wrap items-center gap-2 text-sm">
					<span class="badge badge-outline">{plannedServings} porsjoner</span>
					{#if archive.sourceUrl}
						<a
							class="btn btn-link px-1 btn-sm"
							href={archive.sourceUrl}
							target="_blank"
							rel="noreferrer"
						>
							Original oppskrift <ExternalLink size={15} />
						</a>
					{/if}
				</div>

				<h3 class="font-display mb-3 text-xl font-bold">Ingredienser</h3>
				{#if archive.ingredients.length}
					<ul class="mb-7 divide-y divide-base-300 rounded-box border border-base-300 bg-base-100">
						{#each archive.ingredients as ingredient, index (ingredient.id)}
							<li class="px-4 py-3">
								{#if ingredient.group && ingredient.group !== archive.ingredients[index - 1]?.group}<p
										class="mb-1 text-xs font-bold text-primary"
									>
										{ingredient.group}
									</p>{/if}
								<span class="font-semibold"
									>{scaledIngredientQuantityText(ingredient, plannedServings, archive.baseServings)}
									{ingredient.unit}</span
								>
								<span> {ingredient.name}</span>
								{#if ingredient.note}<span class="text-base-content/60">
										· {ingredient.note}</span
									>{/if}
							</li>
						{/each}
					</ul>
				{:else}<p class="mb-7 text-base-content/60">Ingen ingredienser er lagret.</p>{/if}

				<h3 class="font-display mb-3 text-xl font-bold">Fremgangsmåte</h3>
				{#if steps.length}
					<ol class="space-y-3">
						{#each steps as step, index (step.id)}
							<li class="rounded-box border border-base-300 bg-base-100 p-4">
								{#if step.section && step.section !== steps[index - 1]?.section}<p
										class="mb-1 text-xs font-bold text-primary"
									>
										{step.section}
									</p>{/if}
								<p><span class="mr-2 font-bold">{index + 1}.</span>{step.text}</p>
							</li>
						{/each}
					</ol>
				{:else}<p class="text-base-content/60">Ingen fremgangsmåte er lagret.</p>{/if}
			</div>
			<footer class="border-t border-base-300 p-4">
				<button
					class="btn w-full btn-primary"
					type="button"
					disabled={!steps.length}
					onclick={startCooking}
				>
					<CookingPot size={19} /> Start matlaging
				</button>
				{#if !wakeLockSupported}<p class="mt-2 text-center text-xs text-warning">
						Nettleseren kan ikke holde skjermen på.
					</p>{/if}
			</footer>
		</div>
		<button class="modal-backdrop" type="button" onclick={onClose} aria-label="Lukk oppskriften"
			>Lukk</button
		>
	</div>{/if}

{#if cooking && activeStep}
	<div
		class="fixed inset-0 z-[100] max-w-[100dvw] overflow-hidden overscroll-none bg-base-100 text-base-content select-none"
		class:touch-none={!showCookingIngredients}
		class:touch-pan-y={showCookingIngredients}
		data-testid="cooking-mode"
		role="dialog"
		tabindex="-1"
		aria-modal="true"
		aria-labelledby="cooking-title"
		onpointerdowncapture={beginGesture}
		onpointerupcapture={endGesture}
		onpointercancelcapture={() => (gestureStart = undefined)}
	>
		<div
			class="pointer-events-none absolute inset-0 opacity-70"
			style="background: radial-gradient(circle at 8% 12%, color-mix(in oklab, var(--color-primary) 18%, transparent), transparent 34%), radial-gradient(circle at 90% 88%, color-mix(in oklab, var(--color-secondary) 14%, transparent), transparent 38%);"
		></div>
		<div
			class="relative grid h-full w-full min-w-0 grid-rows-[auto_1fr_auto] overflow-hidden"
			style="padding-top: max(0.75rem, env(safe-area-inset-top)); padding-right: max(1rem, env(safe-area-inset-right)); padding-bottom: max(0.75rem, env(safe-area-inset-bottom)); padding-left: max(1rem, env(safe-area-inset-left));"
		>
			<header class="flex w-full min-w-0 items-center gap-3 overflow-hidden py-2 sm:px-3">
				<div class="min-w-0 flex-1">
					<p class="text-[0.68rem] font-bold tracking-[0.18em] text-primary uppercase">
						Matlagingsmodus
					</p>
					<h2 id="cooking-title" class="truncate font-semibold">{archive.name}</h2>
				</div>
				<div class="flex shrink-0 items-center gap-2">
					<span
						class="hidden items-center gap-1.5 rounded-full border border-base-300 bg-base-100/80 px-3 py-1.5 text-xs font-semibold backdrop-blur sm:flex"
					>
						<span
							class="size-2 rounded-full"
							class:bg-success={wakeLockActive}
							class:bg-warning={!wakeLockActive}
						></span>
						{wakeLockActive ? 'Skjermen holdes på' : 'Skjermlås utilgjengelig'}
					</span>
					<button
						class="btn btn-square shrink-0 rounded-full border-base-300 bg-base-100/80 backdrop-blur btn-sm"
						type="button"
						onclick={stopCooking}
						aria-label="Avslutt matlaging"
					>
						<X size={19} />
					</button>
				</div>
			</header>

			<div
				class="relative min-h-0 w-full max-w-full min-w-0 overflow-hidden sm:mx-auto sm:max-w-5xl"
			>
				<div
					class="flex h-full w-full min-w-0 touch-none flex-col justify-center overflow-y-auto px-1 py-5 transition duration-300 ease-out sm:px-10 lg:px-20"
					data-testid="cooking-step"
					style:transform={showCookingIngredients ? 'translateX(-25%)' : 'translateX(0)'}
					class:opacity-0={showCookingIngredients}
					aria-hidden={showCookingIngredients}
					inert={showCookingIngredients}
				>
					<div class="mb-6 flex w-full min-w-0 items-end gap-4">
						<div class="min-w-0 flex-1">
							<p class="font-display text-6xl leading-none font-bold text-primary/20 sm:text-8xl">
								{String(currentStep + 1).padStart(2, '0')}
							</p>
							<p class="mt-1 text-sm font-bold text-base-content/55">
								Steg {currentStep + 1} av {steps.length}
							</p>
						</div>
						<button
							class="btn shrink-0 rounded-full border-base-300 bg-base-100/75 btn-outline backdrop-blur btn-sm"
							type="button"
							onclick={() => (showCookingIngredients = true)}
						>
							<ListChecks size={17} /> Ingredienser
						</button>
					</div>
					<div class="min-w-0" aria-live="polite">
						{#if activeStep.section}<p
								class="mb-3 w-fit rounded-full bg-primary/10 px-3 py-1 text-sm font-bold text-primary"
							>
								{activeStep.section}
							</p>{/if}
						<p
							class="max-w-4xl text-[clamp(1.65rem,5.2vw,3.5rem)] leading-[1.28] font-semibold tracking-[-0.025em] text-balance [overflow-wrap:anywhere]"
						>
							{activeStep.text}
						</p>
					</div>
				</div>

				<div
					class="absolute inset-0 z-10 flex max-w-full min-w-0 flex-col overflow-hidden bg-base-100/95 backdrop-blur-xl transition duration-300 ease-out"
					data-testid="cooking-ingredients"
					style:transform={showCookingIngredients ? 'translateX(0)' : 'translateX(100%)'}
					aria-hidden={!showCookingIngredients}
					inert={!showCookingIngredients}
				>
					<div class="border-b border-base-300 px-1 py-3 sm:px-8">
						<div class="flex items-end justify-between gap-3">
							<div>
								<p class="text-xs font-bold tracking-[0.16em] text-primary uppercase">
									{plannedServings} porsjoner
								</p>
								<h3 class="font-display text-3xl font-bold sm:text-4xl">Ingredienser</h3>
							</div>
							<p class="text-sm font-semibold text-base-content/55">
								{checkedIngredientCount}/{archive.ingredients.length} klare
							</p>
						</div>
						<div
							class="join mt-3 grid w-full grid-cols-3"
							role="group"
							aria-label="Vis mengder som"
						>
							{#each measurementOptions as option (option.value)}
								<button
									class="btn join-item h-8 min-h-8 btn-sm"
									class:btn-primary={measurementMode === option.value}
									class:btn-ghost={measurementMode !== option.value}
									type="button"
									onclick={() => (measurementMode = option.value)}
									aria-pressed={measurementMode === option.value}>{option.label}</button
								>
							{/each}
						</div>
						{#if measurementMode !== 'original'}<p
								class="mt-1.5 text-center text-[0.68rem] text-base-content/50"
							>
								≈ bruker kjøkkenomregning. Ukjente ingredienser beholder original enhet.
							</p>{/if}
					</div>
					<div class="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain py-2 sm:px-8">
						{#if archive.ingredients.length}<ul>
								{#each archive.ingredients as ingredient, index (ingredient.id)}
									{@const measurement = ingredientMeasurement(
										ingredient,
										plannedServings,
										archive.baseServings,
										measurementMode
									)}
									{#if ingredient.group && ingredient.group !== archive.ingredients[index - 1]?.group}<li
											class="sticky top-0 z-10 bg-base-100/90 px-1 pt-5 pb-2 text-xs font-bold tracking-[0.14em] text-primary uppercase backdrop-blur"
										>
											{ingredient.group}
										</li>{/if}
									<li class="border-b border-base-300/70 last:border-0">
										<button
											class="flex w-full items-start gap-3 px-1 py-4 text-left transition hover:bg-base-200/70 sm:px-3"
											class:opacity-45={checkedIngredientIds.includes(ingredient.id)}
											type="button"
											onclick={() => toggleIngredient(ingredient.id)}
										>
											<span
												class="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border-2 border-base-300"
												class:border-primary={checkedIngredientIds.includes(ingredient.id)}
												class:bg-primary={checkedIngredientIds.includes(ingredient.id)}
											>
												{#if checkedIngredientIds.includes(ingredient.id)}<Check
														size={16}
														class="text-primary-content"
													/>{/if}
											</span>
											<span class:line-through={checkedIngredientIds.includes(ingredient.id)}>
												<strong class="mr-1"
													>{measurement.approximate ? '≈ ' : ''}{measurement.text}</strong
												>{ingredient.name}
												{#if ingredient.note}<span class="block text-sm text-base-content/55"
														>{ingredient.note}</span
													>{/if}
											</span>
										</button>
									</li>
								{/each}
							</ul>{:else}<p class="py-12 text-center text-base-content/55">
								Ingen ingredienser er lagret.
							</p>{/if}
					</div>
				</div>
			</div>

			<footer class="w-full min-w-0 overflow-hidden pt-3 sm:px-3">
				<div class="mb-2 h-1 overflow-hidden rounded-full bg-base-300">
					<div
						class="h-full rounded-full bg-primary transition-[width] duration-300"
						style:width={`${((currentStep + 1) / steps.length) * 100}%`}
					></div>
				</div>
				{#if showCookingIngredients}
					<button
						class="btn min-h-12 w-full rounded-full btn-primary"
						type="button"
						onclick={() => (showCookingIngredients = false)}
						aria-label="Tilbake til gjeldende steg"
					>
						<MoveHorizontal size={18} /> Tilbake til steg {currentStep + 1}
					</button>
				{:else}
					<div class="grid w-full min-w-0 grid-cols-2 items-center gap-2">
						<button
							class="btn min-h-12 min-w-0 rounded-full btn-outline"
							type="button"
							disabled={currentStep === 0}
							onclick={previousStep}
							aria-label="Forrige steg"
						>
							<ArrowUp size={18} /> <span class="hidden sm:inline">Forrige</span>
						</button>
						<button
							class="btn min-h-12 min-w-0 rounded-full btn-primary"
							type="button"
							disabled={currentStep === steps.length - 1}
							onclick={nextStep}
							aria-label="Neste steg"
						>
							<span class="hidden sm:inline">Neste</span>
							<ArrowDown size={18} />
						</button>
					</div>
				{/if}
			</footer>
		</div>
	</div>
{/if}
