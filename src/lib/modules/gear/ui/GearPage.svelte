<script lang="ts">
	import { onMount } from 'svelte';

	import { page } from '$app/state';
	import { createOfflineResource } from '$lib/client/offline-resource';
	import {
		filterGearItems,
		type GearAvailability,
		type GearCategory,
		type GearItemSort,
		type GearItemView,
		gearPageDataSchema,
		type GearPersonView,
		gearProgress,
		repositionGearCategory,
		sortGearItems
	} from '$lib/modules/gear/domain/gear';

	import {
		archiveGearCategory,
		archiveGearItem,
		markGearItemAvailable,
		reorderGearCategories,
		resetGearPacking,
		retainGearItem,
		saveGearCategory,
		saveGearItem,
		setGearItemPacked,
		setGearItemPlanned
	} from './gear-commands';
	import { emptyGearCategoryDraft, emptyGearItemDraft } from './gear-editor';
	import type { GearItemGroup } from './gear-view';
	import GearBoard from './GearBoard.svelte';
	import GearControls from './GearControls.svelte';
	import GearEditorDialogs from './GearEditorDialogs.svelte';
	import GearFilterDialog from './GearFilterDialog.svelte';

	let {
		people,
		categories,
		items
	}: { people: GearPersonView[]; categories: GearCategory[]; items: GearItemView[] } = $props();

	let mode = $state<'plan' | 'pack' | 'archive'>('plan');
	let query = $state('');
	let ownerFilter = $state('');
	let availabilityFilter = $state<'' | GearAvailability>('');
	let sort = $state<GearItemSort>('name');
	let grouping = $state<'category' | 'person'>('category');
	let archiveQuery = $state('');
	let archiveOwnerFilter = $state('');
	let archiveAvailabilityFilter = $state<'' | GearAvailability>('');
	let archiveCategoryFilter = $state('');
	let archivePlanFilter = $state<'' | 'planned' | 'not-planned'>('');
	let archiveSort = $state<GearItemSort>('name');
	let errorMessage = $state('');
	let saving = $state(false);
	let categoryDialog = $state<HTMLDialogElement>(undefined!);
	let categoryDraft = $state(emptyGearCategoryDraft());

	let itemDialog = $state<HTMLDialogElement>(undefined!);
	let itemDraft = $state(emptyGearItemDraft());

	let filtersDialog = $state<HTMLDialogElement>(undefined!);
	const resource = createOfflineResource({
		moduleId: 'gear',
		snapshotKey: 'gear:snapshot:current',
		endpoint: '/api/gear',
		schema: gearPageDataSchema,
		read: () => ({ people, categories, items }),
		write: (value) => {
			people = value.people;
			categories = value.categories;
			items = value.items;
		}
	});

	const owners = $derived(people.filter((person) => person.activeTripMember));
	const ownerNames = $derived(new Map(people.map((owner) => [owner.id, owner.name])));
	const categoryNames = $derived(
		new Map(categories.map((category) => [category.id, category.name]))
	);
	const plannedItems = $derived(items.filter((item) => item.selected));
	const activeItems = $derived(
		mode === 'archive'
			? filterGearItems(items, {
					query: archiveQuery,
					...(archiveOwnerFilter ? { ownerId: archiveOwnerFilter } : {}),
					...(archiveAvailabilityFilter ? { availability: archiveAvailabilityFilter } : {}),
					...(archiveCategoryFilter ? { categoryId: archiveCategoryFilter } : {}),
					...(archivePlanFilter ? { planned: archivePlanFilter === 'planned' } : {}),
					categoryNames,
					ownerNames
				})
			: filterGearItems(plannedItems, {
					query,
					...(ownerFilter ? { ownerId: ownerFilter } : {}),
					...(availabilityFilter ? { availability: availabilityFilter } : {}),
					categoryNames,
					ownerNames
				})
	);
	const progress = $derived(gearProgress(plannedItems));
	const activeFilterCount = $derived(
		mode === 'archive'
			? Number(Boolean(archiveOwnerFilter)) +
					Number(Boolean(archiveAvailabilityFilter)) +
					Number(Boolean(archiveCategoryFilter)) +
					Number(Boolean(archivePlanFilter)) +
					Number(archiveSort !== 'name')
			: Number(Boolean(ownerFilter)) +
					Number(Boolean(availabilityFilter)) +
					Number(sort !== 'name') +
					Number(grouping !== 'category')
	);
	const selectedOwnerName = $derived(
		mode === 'archive'
			? archiveOwnerFilter
				? (ownerNames.get(archiveOwnerFilter) ?? '')
				: ''
			: ownerFilter
				? (ownerNames.get(ownerFilter) ?? '')
				: ''
	);
	const hasFilters = $derived(
		mode === 'archive'
			? Boolean(
					archiveQuery.trim() ||
					archiveOwnerFilter ||
					archiveAvailabilityFilter ||
					archiveCategoryFilter ||
					archivePlanFilter
				)
			: Boolean(query.trim() || ownerFilter || availabilityFilter)
	);
	const visibleCategories = $derived(
		hasFilters
			? categories.filter((category) => activeItems.some((item) => item.categoryId === category.id))
			: categories
	);
	const itemGroups = $derived.by<GearItemGroup[]>(() => {
		if (grouping === 'category') {
			return visibleCategories.map((category) => ({
				id: `category:${category.id}`,
				kind: 'category' as const,
				name: category.name,
				category,
				items: sortedItems(activeItems.filter((item) => item.categoryId === category.id)),
				allItems: plannedItems.filter((item) => item.categoryId === category.id)
			}));
		}

		const groups = owners
			.filter((owner) => activeItems.some((item) => item.ownerIds.includes(owner.id)))
			.map((owner) => ({
				id: `person:${owner.id}`,
				kind: 'person' as const,
				name: owner.name,
				ownerId: owner.id,
				items: sortedItems(activeItems.filter((item) => item.ownerIds.includes(owner.id))),
				allItems: plannedItems.filter((item) => item.ownerIds.includes(owner.id))
			}));
		const currentOwnerIds = new Set(owners.map((owner) => owner.id));
		const unassignedItems = activeItems.filter(
			(item) => !item.ownerIds.some((ownerId) => currentOwnerIds.has(ownerId))
		);
		if (unassignedItems.length) {
			groups.push({
				id: 'person:unassigned',
				kind: 'person',
				name: 'Uten person',
				ownerId: '',
				items: sortedItems(unassignedItems),
				allItems: plannedItems.filter(
					(item) => !item.ownerIds.some((ownerId) => currentOwnerIds.has(ownerId))
				)
			});
		}
		return groups;
	});
	const sortedArchiveItems = $derived(
		sortGearItems(activeItems, archiveSort, ownerNames, categoryNames)
	);

	function sortedItems(entries: readonly GearItemView[]): GearItemView[] {
		return sortGearItems(entries, sort, ownerNames, categoryNames);
	}

	function openCategory(category?: GearCategory): void {
		categoryDraft = { editing: category, name: category?.name ?? '' };
		errorMessage = '';
		categoryDialog.showModal();
	}

	async function saveCategory(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		if (!categoryDraft.name.trim() || saving) return;
		saving = true;
		try {
			await resource.commitMutation(saveGearCategory(resource.current(), categoryDraft));
			categoryDialog.close();
		} catch (error) {
			errorMessage =
				error instanceof Error && error.message === 'GEAR_CATEGORY_DUPLICATE'
					? 'Det finnes allerede en kategori med dette navnet.'
					: 'Kunne ikke lagre kategorien.';
		} finally {
			saving = false;
		}
	}

	function openItem(categoryId: string, item?: GearItemView, ownerId?: string): void {
		itemDraft = {
			editing: item,
			categoryId: item?.categoryId ?? categoryId,
			name: item?.name ?? '',
			quantity: item?.quantity ?? 1,
			ownerIds:
				item?.ownerIds.filter((id) => owners.some((owner) => owner.id === id)) ??
				(ownerId ? [ownerId] : []),
			availability: item?.availability ?? 'available',
			notes: item?.notes ?? '',
			planned: item?.selected ?? mode !== 'archive'
		};
		errorMessage = '';
		itemDialog.showModal();
	}

	async function saveItem(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		if (!itemDraft.name.trim() || !itemDraft.categoryId || saving) return;
		saving = true;
		try {
			await resource.commitMutation(saveGearItem(resource.current(), itemDraft));
			itemDialog.close();
		} catch (error) {
			errorMessage =
				error instanceof Error && error.message === 'GEAR_OWNER_REQUIRED'
					? 'Velg minst én eier for tilgjengelig utstyr eller utstyr som bare skal ligge i arkivet.'
					: 'Kunne ikke lagre utstyret.';
		} finally {
			saving = false;
		}
	}

	async function deleteItem(item: GearItemView): Promise<void> {
		if (!window.confirm(`Arkivere ${item.name}? Ingen data slettes.`)) return;
		try {
			await resource.commitMutation(archiveGearItem(resource.current(), item.id));
		} catch {
			errorMessage = 'Utstyret er i bruk på en reise og må fjernes fra listen først.';
		}
	}

	async function setPlanned(item: GearItemView, planned: boolean): Promise<void> {
		await resource.commitMutation(setGearItemPlanned(resource.current(), item.id, planned));
	}

	async function removeFromPlan(item: GearItemView): Promise<void> {
		if (!window.confirm(`Fjerne ${item.name} fra denne utstyrslisten? Den blir i arkivet.`)) return;
		await setPlanned(item, false);
	}

	async function deleteCategory(category: GearCategory): Promise<void> {
		const categoryItems = items.filter((item) => item.categoryId === category.id);
		if (categoryItems.length) {
			window.alert(
				`Flytt eller slett de ${categoryItems.length} arkiverte tingene før kategorien slettes.`
			);
			return;
		}
		if (!window.confirm(`Slette ${category.name}?`)) return;
		try {
			await resource.commitMutation(archiveGearCategory(resource.current(), category.id));
		} catch {
			errorMessage = 'Kategorien kan ikke arkiveres før alt utstyret er flyttet eller arkivert.';
		}
	}

	async function setPacked(item: GearItemView, packed: boolean): Promise<void> {
		if (item.availability !== 'available') return;
		try {
			await resource.commitMutation(setGearItemPacked(resource.current(), item.id, packed));
		} catch {
			errorMessage = 'Avklar eieren før utstyret pakkes.';
		}
	}

	async function markAvailable(item: GearItemView): Promise<void> {
		try {
			await resource.commitMutation(markGearItemAvailable(resource.current(), item.id));
		} catch (error) {
			if (!(error instanceof Error) || error.message !== 'GEAR_OWNER_REQUIRED') throw error;
			openItem(item.categoryId, item);
			itemDraft.availability = 'available';
			errorMessage = 'Velg minst én eier for å flytte innkjøpet til det globale arkivet.';
		}
	}

	async function resetPacking(): Promise<void> {
		const packedItems = plannedItems.filter((item) => item.packed);
		if (!packedItems.length || !window.confirm('Nullstille alle avhukinger i pakkelisten?')) return;
		await resource.commitMutation(resetGearPacking(resource.current()));
	}

	async function persistCategoryOrder(reordered: ReturnType<typeof repositionGearCategory>) {
		await resource.commitMutation(reorderGearCategories(resource.current(), reordered));
	}

	async function moveCategory(category: GearCategory, offset: -1 | 1): Promise<void> {
		const currentIndex = categories.findIndex((candidate) => candidate.id === category.id);
		const targetIndex = currentIndex + offset;
		if (targetIndex < 0 || targetIndex >= categories.length) return;
		await persistCategoryOrder(repositionGearCategory(categories, category.id, targetIndex));
	}

	async function dropCategory(sourceId: string, targetCategoryId: string): Promise<void> {
		if (!sourceId || sourceId === targetCategoryId) return;
		const targetIndex = categories.findIndex((category) => category.id === targetCategoryId);
		if (targetIndex < 0) return;
		await persistCategoryOrder(repositionGearCategory(categories, sourceId, targetIndex));
	}

	function toggleItemOwner(ownerId: string): void {
		itemDraft.ownerIds = itemDraft.ownerIds.includes(ownerId)
			? itemDraft.ownerIds.filter((id) => id !== ownerId)
			: [...itemDraft.ownerIds, ownerId];
	}

	async function retainItem(item: GearItemView): Promise<void> {
		try {
			await resource.commitMutation(retainGearItem(resource.current(), item.id));
		} catch {
			errorMessage = 'Kunne ikke beholde utstyret på denne reisen.';
		}
	}

	onMount(resource.start);
</script>

<svelte:head><title>Utstyr · {page.data.tripName} · Gjemmekontor</title></svelte:head>

<section class="mx-auto max-w-4xl px-4 py-5 pb-10 lg:py-7">
	<GearControls
		bind:mode
		{categories}
		{progress}
		bind:query
		bind:archiveQuery
		{activeFilterCount}
		{selectedOwnerName}
		{categoryNames}
		{errorMessage}
		bind:availabilityFilter
		bind:sort
		bind:grouping
		bind:archiveAvailabilityFilter
		bind:archiveCategoryFilter
		bind:archivePlanFilter
		bind:archiveSort
		{openCategory}
		{openItem}
		{resetPacking}
		onopenFilters={() => filtersDialog.showModal()}
		onclearOwner={() => {
			if (mode === 'archive') archiveOwnerFilter = '';
			else ownerFilter = '';
		}}
	/>
	<GearBoard
		{categories}
		{items}
		{plannedItems}
		{sortedArchiveItems}
		{itemGroups}
		{mode}
		{hasFilters}
		{categoryNames}
		{ownerNames}
		{openCategory}
		{openItem}
		{deleteItem}
		{setPlanned}
		{deleteCategory}
		{moveCategory}
		{dropCategory}
		{setPacked}
		{retainItem}
		{removeFromPlan}
		{markAvailable}
	/>
</section>

<GearFilterDialog
	bind:dialog={filtersDialog}
	{mode}
	{categories}
	{owners}
	{activeFilterCount}
	bind:archiveCategoryFilter
	bind:archiveOwnerFilter
	bind:archiveAvailabilityFilter
	bind:archivePlanFilter
	bind:archiveSort
	bind:grouping
	bind:ownerFilter
	bind:availabilityFilter
	bind:sort
/>

<GearEditorDialogs
	bind:categoryDialog
	bind:itemDialog
	{categoryDraft}
	{itemDraft}
	{categories}
	{owners}
	{saving}
	bind:errorMessage
	{saveCategory}
	{saveItem}
	{toggleItemOwner}
/>
