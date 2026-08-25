<script lang="ts">
	import { CircleAlert, LoaderCircle, RefreshCw, ShoppingBasket, X } from '@lucide/svelte';
	import { onMount } from 'svelte';

	import { sharedState } from '$lib/client/state.svelte';
	import {
		type CurrentDish,
		menuActiveKey,
		serializeMenuActive
	} from '$lib/modules/menu/domain/menu';
	import type {
		MenuShoppingPreview,
		MenuShoppingPreviewRow,
		MenuShoppingScope
	} from '$lib/modules/menu/domain/shopping';
	import {
		shoppingListSnapshotSchema,
		storeShoppingListSnapshot
	} from '$lib/modules/shopping-list/public';

	let {
		scope,
		dishes,
		onClose
	}: { scope: MenuShoppingScope; dishes: readonly CurrentDish[]; onClose: () => void } = $props();

	let preview = $state<MenuShoppingPreview>();
	let rows = $state<MenuShoppingPreviewRow[]>([]);
	let includeAlreadyAdded = $state(false);
	let loading = $state(true);
	let applying = $state(false);
	let matchingRowId = $state<string>();
	let matchErrorRowId = $state<string>();
	let nameOverrides = $state<Record<string, string>>({});
	let replaceDescriptionBySourceRowId = $state<Record<string, boolean>>({});
	let error = $state('');

	const title = $derived(
		scope === 'dish' ? `Legg til ${dishes[0]?.archive.name ?? 'rett'}` : 'Legg hele menyen til'
	);
	const selectedRows = $derived(rows.filter((row) => row.include));
	const canApply = $derived(
		!matchingRowId &&
			selectedRows.length > 0 &&
			selectedRows.every((row) => row.sourceName.trim() && row.proposedSpecification.length <= 120)
	);

	function requestBody(overrides: Record<string, string> = nameOverrides): {
		scope: MenuShoppingScope;
		cycles: Array<{ archiveId: string; cycleId: string }>;
		includeAlreadyAdded: boolean;
		nameOverrides?: Record<string, string>;
	} {
		return {
			scope,
			cycles: dishes.map((dish) => ({
				archiveId: dish.archive.id,
				cycleId: dish.active.cycleId
			})),
			includeAlreadyAdded,
			...(Object.keys(overrides).length ? { nameOverrides: overrides } : {})
		};
	}

	async function errorCode(response: Response): Promise<string> {
		try {
			const body = (await response.json()) as { error?: unknown };
			return typeof body.error === 'string' ? body.error : 'BRING_UNAVAILABLE';
		} catch {
			return 'BRING_UNAVAILABLE';
		}
	}

	async function loadPreview(): Promise<void> {
		loading = true;
		error = '';
		try {
			await sharedState.sync();
			const response = await fetch('/api/menu/shopping/preview', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(requestBody()),
				signal: AbortSignal.timeout(20_000)
			});
			if (!response.ok) throw new Error(await errorCode(response));
			preview = (await response.json()) as MenuShoppingPreview;
			replaceDescriptionBySourceRowId = {};
			rows = preview.rows.map((row) => ({ ...row }));
		} catch (cause) {
			error =
				cause instanceof Error && cause.message === 'MENU_SCOPE_STALE'
					? 'Menyen er endret. Lukk forhåndsvisningen og prøv igjen.'
					: 'Kunne ikke hente Handleliste. Prøv igjen når du har nett.';
		} finally {
			loading = false;
		}
	}

	function updateRow(
		id: string,
		field: 'include' | 'sourceName' | 'proposedSpecification',
		value: boolean | string
	): void {
		rows = rows.map((row) => (row.id === id ? { ...row, [field]: value } : row));
	}

	function replacesDescription(row: MenuShoppingPreviewRow): boolean {
		return row.sourceRowIds.some((sourceRowId) => replaceDescriptionBySourceRowId[sourceRowId]);
	}

	function applyDescriptionChoice(row: MenuShoppingPreviewRow): MenuShoppingPreviewRow {
		return {
			...row,
			proposedSpecification: replacesDescription(row)
				? row.replacementSpecification
				: row.preservedSpecification
		};
	}

	function setReplaceDescription(row: MenuShoppingPreviewRow, replace: boolean): void {
		const next = { ...replaceDescriptionBySourceRowId };
		for (const sourceRowId of row.sourceRowIds) next[sourceRowId] = replace;
		replaceDescriptionBySourceRowId = next;
		rows = rows.map((candidate) =>
			candidate.id === row.id ? applyDescriptionChoice(candidate) : candidate
		);
	}

	function replaceAllDescriptions(): void {
		const next = { ...replaceDescriptionBySourceRowId };
		for (const row of rows) {
			if (!row.alreadyInList || !row.currentSpecification) continue;
			for (const sourceRowId of row.sourceRowIds) next[sourceRowId] = true;
		}
		replaceDescriptionBySourceRowId = next;
		rows = rows.map(applyDescriptionChoice);
	}

	async function rematchRow(id: string, sourceName: string): Promise<void> {
		if (!preview || matchingRowId) return;
		const editedRow = rows.find((row) => row.id === id);
		if (!editedRow) return;
		matchingRowId = id;
		matchErrorRowId = undefined;
		try {
			const nextOverrides = { ...nameOverrides };
			for (const sourceRowId of editedRow.sourceRowIds) {
				nextOverrides[sourceRowId] = sourceName;
			}
			const response = await fetch('/api/menu/shopping/preview', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(requestBody(nextOverrides)),
				signal: AbortSignal.timeout(20_000)
			});
			if (!response.ok) throw new Error(await errorCode(response));
			const refreshed = (await response.json()) as MenuShoppingPreview;
			const previousInclude = new Map(
				rows.flatMap((row) => row.sourceRowIds.map((sourceRowId) => [sourceRowId, row.include]))
			);
			const nextRows = refreshed.rows.map((row) => {
				const previous = row.sourceRowIds.flatMap((sourceRowId) => {
					const include = previousInclude.get(sourceRowId);
					return include === undefined ? [] : [include];
				});
				return applyDescriptionChoice({
					...row,
					include: previous.length ? previous.some(Boolean) : row.include
				});
			});
			nameOverrides = nextOverrides;
			rows = nextRows;
			preview = { ...refreshed, rows: nextRows };
		} catch {
			matchErrorRowId = id;
		} finally {
			matchingRowId = undefined;
		}
	}

	async function apply(): Promise<void> {
		if (!preview || !canApply || applying) return;
		applying = true;
		error = '';
		try {
			const response = await fetch('/api/menu/shopping/apply', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					...requestBody(),
					fingerprint: preview.fingerprint,
					rows: rows.map((row) => ({
						id: row.id,
						include: row.include,
						sourceName: row.sourceName,
						specification: row.proposedSpecification
					}))
				}),
				signal: AbortSignal.timeout(30_000)
			});
			if (!response.ok) throw new Error(await errorCode(response));
			const result = (await response.json()) as {
				snapshot: unknown;
				batchId: string;
				appliedAt: string;
				appliedCycles: Array<{ archiveId: string; cycleId: string }>;
			};
			const snapshot = shoppingListSnapshotSchema.safeParse(result.snapshot);
			if (snapshot.success) await storeShoppingListSnapshot(snapshot.data);
			const applied = new Map(
				result.appliedCycles.map((cycle) => [cycle.archiveId, cycle.cycleId])
			);
			await sharedState.setMany(
				dishes.flatMap((dish) =>
					applied.get(dish.archive.id) === dish.active.cycleId
						? [
								{
									key: menuActiveKey(dish.archive.id),
									value: serializeMenuActive({
										...dish.active,
										shoppingStatus: {
											appliedAt: result.appliedAt,
											batchId: result.batchId,
											scope
										}
									})
								}
							]
						: []
				)
			);
			onClose();
		} catch (cause) {
			error =
				cause instanceof Error && cause.message === 'MENU_PREVIEW_STALE'
					? 'Menyen ble endret. Hent en ny forhåndsvisning.'
					: 'Kunne ikke bekrefte alle endringene i Bring. Et nytt forsøk fullfører samme absolutte verdier.';
		} finally {
			applying = false;
		}
	}

	onMount(() => {
		void loadPreview();
	});
</script>

<div
	class="modal modal-open"
	role="dialog"
	aria-modal="true"
	aria-labelledby="shopping-preview-title"
>
	<div class="modal-box flex max-h-[94dvh] max-w-3xl flex-col p-0">
		<header class="flex items-start justify-between gap-4 border-b border-base-300 p-4 sm:p-5">
			<div>
				<p class="text-xs font-bold text-primary">Handleliste</p>
				<h2 id="shopping-preview-title" class="font-display text-2xl font-bold">{title}</h2>
			</div>
			<button
				class="btn btn-square btn-ghost btn-sm"
				type="button"
				onclick={onClose}
				aria-label="Lukk forhåndsvisningen"><X size={20} /></button
			>
		</header>
		{#if scope === 'menu'}<label
				class="label cursor-pointer justify-start gap-3 border-b border-base-300 px-5 py-3"
				><input
					class="checkbox checkbox-sm checkbox-primary"
					type="checkbox"
					bind:checked={includeAlreadyAdded}
					onchange={loadPreview}
				/><span>Ta med retter som allerede er lagt til</span></label
			>{/if}
		<div class="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
			{#if loading}<div class="flex justify-center py-12">
					<LoaderCircle class="animate-spin" size={28} />
				</div>
			{:else if error}<div class="alert alert-error" role="alert">
					<CircleAlert size={20} /><span>{error}</span>
				</div>
			{:else if preview}
				{#if preview.skippedDishes.length}<p class="mb-3 text-sm text-base-content/60">
						Ikke tatt med fordi de allerede er lagt til: {preview.skippedDishes.join(', ')}.
					</p>{/if}
				{#if scope === 'menu' && rows.some((row) => row.alreadyInList && row.currentSpecification)}<div
						class="mb-3 flex justify-end"
					>
						<button class="btn btn-outline btn-sm" type="button" onclick={replaceAllDescriptions}
							><RefreshCw size={15} /> Lag alle beskrivelser på nytt</button
						>
					</div>{/if}
				{#if !rows.length}<p
						class="rounded-box border border-dashed border-base-300 p-6 text-center text-base-content/60"
					>
						Ingen ingredienser å legge til.
					</p>{/if}
				<div class="space-y-3">
					{#each rows as row (row.id)}<article
							class="rounded-box border border-base-300 bg-base-100 p-4"
						>
							<label class="flex cursor-pointer items-start gap-3" class:mb-3={row.include}
								><input
									class="checkbox mt-0.5 checkbox-primary"
									type="checkbox"
									checked={row.include}
									onchange={(event) => updateRow(row.id, 'include', event.currentTarget.checked)}
								/><span
									><strong>{row.name}</strong><span class="block text-xs text-base-content/60"
										>Fra {row.dishNames.join(', ')}</span
									></span
								></label
							>
							{#if row.include}<div class="grid gap-3 sm:grid-cols-2">
									<label class="form-control"
										><span class="label-text mb-1 flex items-center gap-1 text-xs font-bold"
											>Vare i Bring
											{#if matchingRowId === row.id}<LoaderCircle
													class="animate-spin"
													size={13}
												/>{/if}</span
										><input
											class="input-bordered input input-sm"
											value={row.sourceName}
											oninput={(event) =>
												updateRow(row.id, 'sourceName', event.currentTarget.value)}
											onchange={(event) => void rematchRow(row.id, event.currentTarget.value)}
											disabled={Boolean(matchingRowId)}
											maxlength="100"
										/>{#if matchErrorRowId === row.id}<span class="mt-1 text-xs text-error"
												>Kunne ikke kontrollere varen akkurat nå.</span
											>{/if}</label
									><label class="form-control"
										><span class="label-text mb-1 text-xs font-bold">Allerede i listen</span><input
											class="input-bordered input input-sm"
											value={row.alreadyInList
												? row.currentSpecification || 'Ingen beskrivelse'
												: 'Ikke i listen'}
											readonly
										/></label
									>{#if row.alreadyInList && row.currentSpecification}<label
											class="flex cursor-pointer items-start gap-3 rounded-box border border-base-300 px-3 py-2 sm:col-span-2"
											><input
												class="checkbox checkbox-sm checkbox-primary"
												type="checkbox"
												checked={replacesDescription(row)}
												onchange={(event) =>
													setReplaceDescription(row, event.currentTarget.checked)}
											/><span class="text-xs"
												><strong class="block">Lag beskrivelsen på nytt</strong><span
													class="text-base-content/60"
													>Forkaster den eksisterende beskrivelsen.</span
												></span
											></label
										>{/if}<label class="grid gap-1 sm:col-span-2"
										><span class="label-text block text-xs font-bold">Beskrivelse</span><input
											class="input-bordered input w-full input-sm"
											class:input-error={row.proposedSpecification.length > 120}
											value={row.proposedSpecification}
											oninput={(event) =>
												updateRow(row.id, 'proposedSpecification', event.currentTarget.value)}
											maxlength="120"
										/></label
									>
								</div>
								{#if row.warnings.length}<ul class="mt-2 text-xs text-warning">
										{#each row.warnings as warning (warning)}<li>{warning}</li>{/each}
									</ul>{/if}{/if}
						</article>{/each}
				</div>
			{/if}
		</div>
		<footer class="flex items-center justify-end gap-2 border-t border-base-300 p-4">
			<button class="btn btn-ghost" type="button" onclick={onClose}>Avbryt</button><button
				class="btn btn-primary"
				type="button"
				disabled={!canApply || applying || loading}
				onclick={apply}
				>{#if applying}<LoaderCircle class="animate-spin" size={18} />{/if}<ShoppingBasket
					size={18}
				/> Legg til valgte</button
			>
		</footer>
	</div>
	<button class="modal-backdrop" type="button" onclick={onClose}>Lukk</button>
</div>
