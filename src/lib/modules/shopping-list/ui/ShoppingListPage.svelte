<script lang="ts">
	import {
		CircleAlert,
		LoaderCircle,
		Plus,
		RefreshCw,
		ShoppingBasket,
		WifiOff
	} from '@lucide/svelte';
	import { onMount, tick } from 'svelte';

	import { page } from '$app/state';
	import { ApiError, apiRequest } from '$lib/client/api';
	import { offlineApi } from '$lib/client/offline-api.svelte';
	import {
		createOfflineResource,
		InvalidOfflineResourceSnapshotError,
		type OfflineResourceRequest
	} from '$lib/client/offline-resource';
	import { watchOnlineStatus } from '$lib/client/online';
	import { shoppingListSnapshotKey } from '$lib/modules/shopping-list/client/cache';
	import {
		sanitizeShoppingListText,
		type ShoppingListItem,
		type ShoppingListSnapshot,
		shoppingListSnapshotSchema
	} from '$lib/modules/shopping-list/domain/shopping-list';
	import ShoppingListItems from '$lib/modules/shopping-list/ui/ShoppingListItems.svelte';
	import { shoppingListErrorMessage } from '$lib/ui/copy';
	import ModalDialog from '$lib/ui/ModalDialog.svelte';
	import SyncStatus from '$lib/ui/SyncStatus.svelte';

	let snapshot = $state<ShoppingListSnapshot>();
	let loading = $state(true);
	let refreshing = $state(false);
	let online = $state(true);
	let serviceAvailable = $state(true);
	let errorMessage = $state('');
	let name = $state('');
	let specification = $state('');
	let query = $state('');
	let adding = $state(false);
	let nameInput: HTMLInputElement | undefined;
	let busyItem = $state('');
	let editDialog = $state<HTMLDialogElement>(undefined!);
	let editingItem = $state<ShoppingListItem>();
	let editSpecification = $state('');
	let editing = $state(false);
	const refreshIntervalMs = 5_000;
	let resourceReady = false;
	const resource = createOfflineResource({
		moduleId: 'shopping-list',
		snapshotKey: shoppingListSnapshotKey,
		load: () => apiRequest('/api/shopping-list', { signal: AbortSignal.timeout(15_000) }),
		schema: shoppingListSnapshotSchema,
		read: () => snapshot,
		write: (value) => (snapshot = value),
		canRefresh: () => online && !adding && !busyItem && !editing && !editingItem,
		onReady: () => {
			loading = false;
			resourceReady = true;
			if (online) void refresh();
		},
		onRefreshSuccess: () => {
			serviceAvailable = true;
			errorMessage = '';
		},
		onRefreshError: (error) => rejectRequest(error),
		autoRefresh: false
	});

	const itemCount = $derived(snapshot?.items.length ?? 0);
	const recentItems = $derived(snapshot ? [...snapshot.recentItems].reverse() : []);
	const normalizedQuery = $derived(query.trim().toLocaleLowerCase('nb-NO'));
	const filteredItems = $derived(
		snapshot?.items.filter((item) =>
			`${item.name} ${item.specification}`.toLocaleLowerCase('nb-NO').includes(normalizedQuery)
		) ?? []
	);
	const writeAvailable = $derived(Boolean(snapshot));
	const canMutate = $derived(writeAvailable && !adding && !busyItem && !refreshing);
	const updatedLabel = $derived(
		snapshot
			? new Intl.DateTimeFormat('nb-NO', {
					hour: '2-digit',
					minute: '2-digit',
					day: 'numeric',
					month: 'short'
				}).format(new Date(snapshot.fetchedAt))
			: ''
	);

	function safeInputValue(input: HTMLInputElement): string {
		const value = sanitizeShoppingListText(input.value);
		input.value = value;
		return value;
	}

	function rejectRequest(error: unknown): void {
		const code =
			error instanceof ApiError
				? error.code
				: error instanceof InvalidOfflineResourceSnapshotError
					? undefined
					: 'BRING_UNAVAILABLE';
		serviceAvailable = code === 'INVALID_REQUEST';
		errorMessage = shoppingListErrorMessage(code);
	}

	async function refresh(showProgress = true): Promise<void> {
		if (showProgress) refreshing = true;
		await resource.refresh();
		refreshing = false;
		loading = false;
	}

	async function commitSnapshot(
		next: ShoppingListSnapshot,
		request: OfflineResourceRequest
	): Promise<void> {
		await resource.commit(next, [request]);
		errorMessage = '';
	}

	async function addItem(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		const itemName = name.trim();
		if (!itemName || !canMutate) {
			return;
		}
		adding = true;
		try {
			if (!snapshot) return;
			const item = { sourceName: itemName, name: itemName, specification: specification.trim() };
			await commitSnapshot(
				{
					...snapshot,
					items: [
						...snapshot.items.filter((candidate) => candidate.sourceName !== item.sourceName),
						item
					],
					recentItems: snapshot.recentItems.filter(
						(candidate) => candidate.sourceName !== item.sourceName
					)
				},
				{
					path: '/api/shopping-list/items',
					method: 'POST',
					body: { name: itemName, specification: specification.trim() }
				}
			);
			name = '';
			specification = '';
			await tick();
			nameInput?.focus();
		} catch (error) {
			rejectRequest(error);
		} finally {
			adding = false;
		}
	}

	async function completeItem(item: ShoppingListItem): Promise<void> {
		if (!canMutate) {
			return;
		}
		busyItem = item.sourceName;
		try {
			if (!snapshot) return;
			await commitSnapshot(
				{
					...snapshot,
					items: snapshot.items.filter((candidate) => candidate.sourceName !== item.sourceName),
					recentItems: [
						...snapshot.recentItems.filter((candidate) => candidate.sourceName !== item.sourceName),
						item
					]
				},
				{
					path: '/api/shopping-list/items',
					method: 'PATCH',
					body: { sourceName: item.sourceName }
				}
			);
		} catch (error) {
			rejectRequest(error);
		} finally {
			busyItem = '';
		}
	}

	async function restoreItem(item: ShoppingListItem): Promise<void> {
		if (!canMutate) {
			return;
		}
		busyItem = item.sourceName;
		try {
			if (!snapshot) return;
			await commitSnapshot(
				{
					...snapshot,
					items: [
						...snapshot.items.filter((candidate) => candidate.sourceName !== item.sourceName),
						item
					],
					recentItems: snapshot.recentItems.filter(
						(candidate) => candidate.sourceName !== item.sourceName
					)
				},
				{
					path: '/api/shopping-list/items',
					method: 'POST',
					body: { name: item.name, specification: item.specification }
				}
			);
		} catch (error) {
			rejectRequest(error);
		} finally {
			busyItem = '';
		}
	}

	function openEdit(item: ShoppingListItem): void {
		if (!canMutate) {
			return;
		}
		editingItem = item;
		editSpecification = item.specification;
		editDialog.showModal();
	}

	function closeEdit(): void {
		if (editing) {
			return;
		}
		editDialog.close();
		editingItem = undefined;
	}

	async function saveEdit(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		if (!editingItem || !canMutate) {
			return;
		}
		const item = editingItem;
		editing = true;
		busyItem = item.sourceName;
		try {
			if (!snapshot) return;
			const specification = editSpecification.trim();
			await commitSnapshot(
				{
					...snapshot,
					items: snapshot.items.map((candidate) =>
						candidate.sourceName === item.sourceName ? { ...candidate, specification } : candidate
					)
				},
				{
					path: '/api/shopping-list/items',
					method: 'PUT',
					body: {
						sourceName: item.sourceName,
						specification
					}
				}
			);
			editDialog.close();
			editingItem = undefined;
		} catch (error) {
			rejectRequest(error);
		} finally {
			editing = false;
			busyItem = '';
		}
	}

	onMount(() => {
		let initialized = false;
		const stopOnline = watchOnlineStatus((value) => {
			online = value;
			if (!initialized) {
				serviceAvailable = online;
			} else if (online && resourceReady) {
				void refresh();
			} else {
				serviceAvailable = false;
			}
			initialized = true;
		});
		const refreshWhenActive = (): void => {
			if (resourceReady && document.visibilityState === 'visible') {
				void refresh(false);
			}
		};
		window.addEventListener('focus', refreshWhenActive);
		document.addEventListener('visibilitychange', refreshWhenActive);
		const refreshInterval = window.setInterval(refreshWhenActive, refreshIntervalMs);
		const stopResource = resource.start();
		return (): void => {
			window.clearInterval(refreshInterval);
			stopResource();
			stopOnline();
			window.removeEventListener('focus', refreshWhenActive);
			document.removeEventListener('visibilitychange', refreshWhenActive);
		};
	});
</script>

<svelte:head><title>Handleliste · {page.data.tripName} · Gjemmekontor</title></svelte:head>

<section
	class="mx-auto min-h-[calc(100dvh-7.5rem)] max-w-3xl px-4 py-5 pb-10 lg:min-h-[calc(100dvh-3.5rem)] lg:py-7"
>
	<header class="mb-4 min-w-0">
		<div class="flex h-7 min-w-0 items-center justify-between gap-2">
			<p class="flex min-w-0 shrink-0 items-center gap-1.5 text-sm font-semibold text-primary">
				<ShoppingBasket size={15} />
				Bring
			</p>
			<div class="flex min-w-0 items-center justify-end gap-1">
				{#if offlineApi.status('shopping-list').pending > 0 || offlineApi.status('shopping-list').conflicts > 0}
					<SyncStatus moduleId="shopping-list" />
				{:else if online && !serviceAvailable}
					<div
						class="flex min-w-0 items-center justify-end gap-1.5 text-[0.68rem] font-semibold text-base-content/55"
						role="status"
					>
						<WifiOff class="shrink-0" size={14} />
						<span class="max-w-44 truncate"
							>{snapshot
								? `Viser lagret liste · sist oppdatert ${updatedLabel}`
								: 'Kan ikke nå Bring'}</span
						>
					</div>
				{:else if refreshing}
					<div
						class="flex min-w-0 items-center justify-end gap-1.5 text-[0.68rem] font-semibold text-base-content/55"
						role="status"
					>
						<LoaderCircle class="shrink-0 animate-spin" size={14} />
						<span class="max-w-44 truncate">Oppdaterer …</span>
					</div>
				{:else}
					<SyncStatus moduleId="shopping-list" />
				{/if}
				<button
					class="btn btn-square h-7 min-h-7 w-7 shrink-0 btn-ghost p-0"
					type="button"
					onclick={() => refresh()}
					disabled={!online || refreshing}
					aria-label="Oppdater handlelisten"
					title="Oppdater handlelisten"
				>
					<RefreshCw class={refreshing ? 'animate-spin' : ''} size={16} />
				</button>
			</div>
		</div>
		<h1 class="font-display mt-1 text-3xl font-bold text-neutral">Handleliste</h1>
		{#if snapshot}
			<p class="mt-1 truncate text-sm text-base-content/60">
				{snapshot.listName} · {itemCount}
				{itemCount === 1 ? 'vare' : 'varer'}
			</p>
		{/if}
	</header>

	<form
		class="mb-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)_auto]"
		onsubmit={addItem}
	>
		<label class="input flex w-full items-center bg-base-100">
			<span class="sr-only">Vare</span>
			<input
				bind:this={nameInput}
				class="min-w-0 grow"
				placeholder="Legg til vare"
				aria-label="Vare"
				maxlength="100"
				value={name}
				oninput={(event) => (name = safeInputValue(event.currentTarget))}
				disabled={!writeAvailable}
			/>
		</label>
		<label class="input flex w-full items-center bg-base-100">
			<span class="sr-only">Detaljer</span>
			<input
				class="min-w-0 grow"
				placeholder="Detaljer (valgfritt)"
				aria-label="Detaljer"
				maxlength="120"
				value={specification}
				oninput={(event) => (specification = safeInputValue(event.currentTarget))}
				disabled={!writeAvailable}
			/>
		</label>
		<button
			class="btn w-full btn-primary sm:w-auto"
			type="submit"
			disabled={!name.trim() || !canMutate}
		>
			{#if adding}<LoaderCircle class="animate-spin" size={17} />{:else}<Plus size={17} />{/if}
			Legg til
		</button>
	</form>

	{#if errorMessage}
		<div
			class="mb-5 flex items-start gap-3 rounded-lg bg-error/12 px-3 py-3 text-sm text-error"
			role="alert"
		>
			<CircleAlert class="mt-0.5 shrink-0" size={18} />
			<div class="min-w-0 flex-1">
				<p class="font-semibold">{errorMessage}</p>
				{#if online}
					<button class="btn mt-2 btn-ghost btn-xs" type="button" onclick={() => refresh()}
						>Prøv igjen</button
					>
				{/if}
			</div>
		</div>
	{/if}

	<ShoppingListItems
		{loading}
		{snapshot}
		bind:query
		{filteredItems}
		{recentItems}
		{writeAvailable}
		{canMutate}
		{busyItem}
		oncomplete={completeItem}
		onedit={openEdit}
		onrestore={restoreItem}
	/>
</section>

<ModalDialog
	bind:dialog={editDialog}
	boxClass="modal-box max-w-md rounded-lg"
	closeLabel="Lukk dialogen"
	closeDisabled={editing}
	onclose={() => (editingItem = undefined)}
>
	{#if editingItem}
		<h2 class="font-display text-2xl font-bold">Endre vare</h2>
		<p class="mt-1 text-sm font-semibold text-base-content/60">{editingItem.name}</p>
		<form class="mt-5" onsubmit={saveEdit}>
			<label class="form-control block">
				<span class="mb-2 block text-sm font-semibold">Detaljer</span>
				<input
					class="input w-full bg-base-100"
					aria-label="Detaljer for vare"
					placeholder="For eksempel mengde eller merke"
					maxlength="120"
					value={editSpecification}
					oninput={(event) => (editSpecification = safeInputValue(event.currentTarget))}
					disabled={editing}
				/>
			</label>
			<div class="mt-6 grid grid-cols-2 gap-2">
				<button class="btn btn-ghost" type="button" onclick={closeEdit} disabled={editing}
					>Avbryt</button
				>
				<button class="btn btn-primary" type="submit" disabled={editing}>
					{#if editing}<LoaderCircle class="animate-spin" size={17} />{/if}
					Lagre
				</button>
			</div>
		</form>
	{/if}
</ModalDialog>
