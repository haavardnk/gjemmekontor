<script lang="ts">
	import {
		Check,
		CircleAlert,
		Ellipsis,
		ListChecks,
		LoaderCircle,
		Plus,
		RefreshCw,
		Search,
		ShoppingBasket,
		Undo2,
		WifiOff,
		X
	} from '@lucide/svelte';
	import { onMount, tick } from 'svelte';

	import { storedShoppingListSnapshot, storeShoppingListSnapshot } from '$lib/client/shoppinglist';
	import {
		sanitizeShoppingListText,
		type ShoppingListItem,
		type ShoppingListSnapshot,
		shoppingListSnapshotSchema
	} from '$lib/trip/shoppinglist';
	import { shoppingListErrorMessage } from '$lib/ui/copy';

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
	let editDialog: HTMLDialogElement;
	let editingItem = $state<ShoppingListItem>();
	let editSpecification = $state('');
	let editing = $state(false);
	const refreshIntervalMs = 5_000;
	let refreshInFlight = false;
	let mutationRevision = 0;

	const itemCount = $derived(snapshot?.items.length ?? 0);
	const recentItems = $derived(snapshot ? [...snapshot.recentItems].reverse() : []);
	const normalizedQuery = $derived(query.trim().toLocaleLowerCase('nb-NO'));
	const filteredItems = $derived(
		snapshot?.items.filter((item) =>
			`${item.name} ${item.specification}`.toLocaleLowerCase('nb-NO').includes(normalizedQuery)
		) ?? []
	);
	const writeAvailable = $derived(online && serviceAvailable);
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

	async function errorCode(response: Response): Promise<string | undefined> {
		try {
			const body = (await response.json()) as { error?: unknown };
			return typeof body.error === 'string' ? body.error : undefined;
		} catch {
			return undefined;
		}
	}

	function request(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
		return fetch(input, { ...init, signal: AbortSignal.timeout(15_000) });
	}

	function safeInputValue(input: HTMLInputElement): string {
		const value = sanitizeShoppingListText(input.value);
		input.value = value;
		return value;
	}

	async function acceptResponse(response: Response): Promise<boolean> {
		if (!response.ok) {
			const code = await errorCode(response);
			serviceAvailable = code === 'INVALID_REQUEST';
			errorMessage = shoppingListErrorMessage(code);
			return false;
		}
		const result = shoppingListSnapshotSchema.safeParse(await response.json());
		if (!result.success) {
			errorMessage = shoppingListErrorMessage(undefined);
			return false;
		}
		snapshot = result.data;
		serviceAvailable = true;
		await storeShoppingListSnapshot(result.data);
		errorMessage = '';
		return true;
	}

	async function refresh(showProgress = true): Promise<void> {
		if (!online || refreshInFlight || adding || busyItem || editing || editingItem) {
			return;
		}
		const revision = mutationRevision;
		refreshInFlight = true;
		refreshing = showProgress;
		try {
			const response = await request('/api/shoppinglist');
			if (revision === mutationRevision) {
				await acceptResponse(response);
			}
		} catch {
			if (revision === mutationRevision) {
				serviceAvailable = false;
				errorMessage = shoppingListErrorMessage('BRING_UNAVAILABLE');
			}
		} finally {
			refreshInFlight = false;
			refreshing = false;
			loading = false;
		}
	}

	async function addItem(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		const itemName = name.trim();
		if (!itemName || !canMutate) {
			return;
		}
		mutationRevision += 1;
		adding = true;
		try {
			const accepted = await acceptResponse(
				await request('/api/shoppinglist/items', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ name: itemName, specification: specification.trim() })
				})
			);
			if (accepted) {
				name = '';
				specification = '';
				await tick();
				nameInput?.focus();
			}
		} catch {
			serviceAvailable = false;
			errorMessage = shoppingListErrorMessage('BRING_UNAVAILABLE');
		} finally {
			adding = false;
		}
	}

	async function completeItem(item: ShoppingListItem): Promise<void> {
		if (!canMutate) {
			return;
		}
		mutationRevision += 1;
		busyItem = item.sourceName;
		try {
			await acceptResponse(
				await request('/api/shoppinglist/items', {
					method: 'PATCH',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ sourceName: item.sourceName })
				})
			);
		} catch {
			serviceAvailable = false;
			errorMessage = shoppingListErrorMessage('BRING_UNAVAILABLE');
		} finally {
			busyItem = '';
		}
	}

	async function restoreItem(item: ShoppingListItem): Promise<void> {
		if (!canMutate) {
			return;
		}
		mutationRevision += 1;
		busyItem = item.sourceName;
		try {
			await acceptResponse(
				await request('/api/shoppinglist/items', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ name: item.name, specification: item.specification })
				})
			);
		} catch {
			serviceAvailable = false;
			errorMessage = shoppingListErrorMessage('BRING_UNAVAILABLE');
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
		mutationRevision += 1;
		editing = true;
		busyItem = item.sourceName;
		try {
			const accepted = await acceptResponse(
				await request('/api/shoppinglist/items', {
					method: 'PUT',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						sourceName: item.sourceName,
						specification: editSpecification.trim()
					})
				})
			);
			if (accepted) {
				editDialog.close();
				editingItem = undefined;
			}
		} catch {
			serviceAvailable = false;
			errorMessage = shoppingListErrorMessage('BRING_UNAVAILABLE');
		} finally {
			editing = false;
			busyItem = '';
		}
	}

	onMount(() => {
		let disposed = false;
		let ready = false;
		online = navigator.onLine;
		serviceAvailable = online;
		const updateOnline = (): void => {
			online = navigator.onLine;
			if (online && ready) {
				void refresh();
			} else {
				serviceAvailable = false;
			}
		};
		const refreshWhenActive = (): void => {
			if (ready && document.visibilityState === 'visible') {
				void refresh(false);
			}
		};
		window.addEventListener('online', updateOnline);
		window.addEventListener('offline', updateOnline);
		window.addEventListener('focus', refreshWhenActive);
		document.addEventListener('visibilitychange', refreshWhenActive);
		const refreshInterval = window.setInterval(refreshWhenActive, refreshIntervalMs);
		void storedShoppingListSnapshot().then((cached) => {
			if (disposed) {
				return;
			}
			snapshot = cached;
			loading = false;
			ready = true;
			if (online) {
				void refresh();
			}
		});
		return (): void => {
			disposed = true;
			window.clearInterval(refreshInterval);
			window.removeEventListener('online', updateOnline);
			window.removeEventListener('offline', updateOnline);
			window.removeEventListener('focus', refreshWhenActive);
			document.removeEventListener('visibilitychange', refreshWhenActive);
		};
	});
</script>

<section
	class="mx-auto min-h-[calc(100dvh-7.5rem)] max-w-3xl px-4 py-5 pb-10 lg:min-h-[calc(100dvh-3.5rem)] lg:py-7"
>
	<header class="mb-5 flex items-start justify-between gap-4">
		<div class="min-w-0">
			<p class="mb-1 flex items-center gap-1.5 text-xs font-bold text-primary">
				<ShoppingBasket size={15} />
				Bring
			</p>
			<h1 class="font-display text-3xl font-bold text-neutral">Handleliste</h1>
			{#if snapshot}
				<p class="mt-1 truncate text-sm text-base-content/60">
					{snapshot.listName} · {itemCount}
					{itemCount === 1 ? 'vare' : 'varer'}
				</p>
			{/if}
		</div>
		<button
			class="btn btn-square btn-ghost btn-sm"
			type="button"
			onclick={() => refresh()}
			disabled={!online || refreshing}
			aria-label="Oppdater handlelisten"
			title="Oppdater handlelisten"
		>
			<RefreshCw class={refreshing ? 'animate-spin' : ''} size={19} />
		</button>
	</header>

	<div
		class="mb-5 flex min-h-6 items-center gap-2 text-xs font-semibold text-base-content/55"
		role="status"
	>
		{#if !online}
			<WifiOff size={15} />
			<span>Uten nett{snapshot ? ` · sist oppdatert ${updatedLabel}` : ''}</span>
		{:else if !serviceAvailable}
			<WifiOff size={15} />
			<span
				>{snapshot
					? `Viser lagret liste · sist oppdatert ${updatedLabel}`
					: 'Kan ikke nå Bring'}</span
			>
		{:else if refreshing}
			<LoaderCircle class="animate-spin" size={15} />
			<span>Oppdaterer …</span>
		{:else if snapshot}
			<ListChecks size={15} />
			<span>Oppdatert {updatedLabel}</span>
		{:else}
			<LoaderCircle class="animate-spin" size={15} />
			<span>Kobler til Bring …</span>
		{/if}
	</div>

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

	{#if loading && !snapshot}
		<div class="space-y-2.5" aria-label="Laster handlelisten">
			{#each [0, 1, 2, 3] as index (`skeleton-${index}`)}
				<div class="h-16 animate-pulse rounded-lg bg-base-300/60"></div>
			{/each}
		</div>
	{:else if snapshot?.items.length}
		<label class="input mb-4 flex w-full items-center gap-2 bg-base-100">
			<Search size={18} />
			<input
				class="min-w-0 grow"
				type="search"
				placeholder="Søk i handlelisten"
				aria-label="Søk i handlelisten"
				bind:value={query}
			/>
			{#if query}
				<button
					class="btn btn-square btn-ghost btn-xs"
					type="button"
					onclick={() => (query = '')}
					aria-label="Tøm søket"
					title="Tøm søket"
				>
					<X size={16} />
				</button>
			{/if}
		</label>
		{#if filteredItems.length}
			<ul class="space-y-2" aria-label="Varer">
				{#each filteredItems as item (item.sourceName)}
					<li class="group relative">
						<button
							class="flex min-h-16 w-full cursor-pointer items-center rounded-lg border border-base-300/80 bg-base-100 py-3 pr-14 pl-4 text-left shadow-sm transition-[background-color,border-color,box-shadow,transform] hover:-translate-y-px hover:border-success/35 hover:bg-success/8 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-success active:translate-y-0 active:bg-success/15 active:shadow-sm disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:translate-y-0 disabled:hover:shadow-sm"
							type="button"
							onclick={() => completeItem(item)}
							disabled={!canMutate}
							aria-label={`Marker ${item.name} som kjøpt`}
						>
							<span class="min-w-0 flex-1">
								<span class="block leading-5 font-semibold">{item.name}</span>
								{#if item.specification}
									<span class="mt-0.5 block text-sm text-base-content/55">{item.specification}</span
									>
								{/if}
							</span>
						</button>
						<button
							class="btn absolute top-1/2 right-2 z-10 btn-circle -translate-y-1/2 cursor-pointer btn-ghost text-base-content/55 btn-sm hover:bg-base-300 hover:text-base-content focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary disabled:cursor-not-allowed"
							type="button"
							onclick={() => openEdit(item)}
							disabled={!canMutate}
							aria-label={`Endre ${item.name}`}
							title={`Endre ${item.name}`}
						>
							{#if busyItem === item.sourceName}
								<LoaderCircle class="animate-spin" size={18} />
							{:else}
								<Ellipsis size={20} />
							{/if}
						</button>
					</li>
				{/each}
			</ul>
		{:else}
			<div
				class="grid min-h-32 place-items-center border-y border-dashed border-base-300 py-8 text-center"
				aria-live="polite"
			>
				<p class="text-sm font-semibold text-base-content/55">Ingen varer matcher søket.</p>
			</div>
		{/if}
	{:else if snapshot}
		<div
			class="grid min-h-52 place-items-center border-y border-dashed border-base-300 py-8 text-center"
		>
			<div>
				<ShoppingBasket class="mx-auto mb-3 text-primary" size={34} />
				<h2 class="font-display text-xl font-bold">Listen er tom</h2>
				<p class="mt-1 text-sm text-base-content/55">Legg til det dere trenger til turen.</p>
			</div>
		</div>
	{:else if !writeAvailable}
		<div
			class="grid min-h-52 place-items-center border-y border-dashed border-base-300 py-8 text-center"
		>
			<div>
				<WifiOff class="mx-auto mb-3 text-base-content/45" size={34} />
				<h2 class="font-display text-xl font-bold">Ingen lagret handleliste</h2>
				<p class="mt-1 text-sm text-base-content/55">Åpne listen én gang når du har nett.</p>
			</div>
		</div>
	{/if}

	{#if recentItems.length}
		<section class="mt-10">
			<div class="mb-3 flex items-center justify-between gap-3 px-1">
				<h2 class="font-display text-xl font-bold">Nylig kjøpt</h2>
				<span
					class="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary tabular-nums"
					>{recentItems.length}</span
				>
			</div>
			<ul class="space-y-2" aria-label="Nylig kjøpt">
				{#each recentItems as item (item.sourceName)}
					<li>
						<button
							class="group flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-lg border border-primary/15 bg-primary/8 px-4 py-2.5 text-left text-base-content/55 shadow-sm transition-[background-color,border-color,box-shadow,transform] hover:-translate-y-px hover:border-primary/30 hover:bg-primary/14 hover:text-base-content/75 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:translate-y-0 active:bg-primary/18 active:shadow-sm disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:translate-y-0 disabled:hover:shadow-sm"
							type="button"
							onclick={() => restoreItem(item)}
							disabled={!canMutate}
							aria-label={`Legg ${item.name} tilbake på listen`}
							title={`Legg ${item.name} tilbake på listen`}
						>
							<Check class="shrink-0 text-success/70" size={17} />
							<span class="min-w-0 flex-1">
								<span class="block truncate text-sm line-through">{item.name}</span>
								{#if item.specification}
									<span class="block truncate text-xs">{item.specification}</span>
								{/if}
							</span>
							<span
								class="flex min-w-6 shrink-0 items-center justify-end gap-1.5 text-xs font-semibold text-base-content/35 transition-colors group-hover:text-primary"
							>
								{#if busyItem === item.sourceName}
									<LoaderCircle class="animate-spin" size={16} />
								{:else}
									<Undo2 size={16} />
									<span class="hidden sm:inline">Legg tilbake</span>
								{/if}
							</span>
						</button>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</section>

<dialog bind:this={editDialog} class="modal" onclose={() => (editingItem = undefined)}>
	<div class="modal-box max-w-md rounded-lg">
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
	</div>
	<form method="dialog" class="modal-backdrop">
		<button type="submit" disabled={editing} aria-label="Lukk dialogen">Lukk</button>
	</form>
</dialog>
