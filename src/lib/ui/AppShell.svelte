<script lang="ts">
	import {
		Backpack,
		BookOpen,
		ChevronsUpDown,
		Ellipsis,
		LogOut,
		Map,
		Route,
		ScrollText,
		Settings,
		ShoppingBasket,
		Utensils,
		Video
	} from '@lucide/svelte';
	import type { Snippet } from 'svelte';
	import { onMount } from 'svelte';

	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { moduleCatalog, type ModuleId, pathMatchesPrefix } from '$lib/app/modules/catalog';
	import { warmAppShell } from '$lib/client/pwa';
	import { sharedState } from '$lib/client/state.svelte';
	import { tripDayState } from '$lib/trip/day.svelte';

	import BrandLogo from './BrandLogo.svelte';
	import ThemeToggle from './ThemeToggle.svelte';

	let { children }: { children: Snippet } = $props();
	let mounted = $state(false);
	let signingOut = $state(false);
	let moreOpen = $state(false);
	let moreDialog: HTMLDialogElement;

	async function signOut(): Promise<void> {
		signingOut = true;
		try {
			await fetch('/api/auth/logout', { method: 'POST' });
			window.location.assign('/trips');
		} finally {
			signingOut = false;
		}
	}

	const icons = {
		backpack: Backpack,
		'book-open': BookOpen,
		map: Map,
		route: Route,
		'scroll-text': ScrollText,
		'shopping-basket': ShoppingBasket,
		utensils: Utensils,
		video: Video
	};
	const enabledModuleIds = $derived((page.data.enabledModuleIds ?? []) as ModuleId[]);
	const enabledModules = $derived(
		enabledModuleIds
			.map((id) => moduleCatalog.find((module) => module.id === id))
			.filter((module) => module !== undefined)
	);
	const links = $derived(
		enabledModules.map((module) => ({
			href: resolve(module.primaryPath),
			path: module.primaryPath,
			label: module.label,
			icon: icons[module.icon]
		}))
	);
	const quickLinks = $derived(links.slice(0, 4));
	const moreLinks = $derived(links.slice(4));
	const moreActive = $derived(
		moreLinks.some((link) => pathMatchesPrefix(page.url.pathname, link.path))
	);
	const homePath = $derived(enabledModules[0]?.primaryPath ?? '/');

	function isCurrent(path: string): boolean {
		return pathMatchesPrefix(page.url.pathname, path);
	}

	function openMore(): void {
		moreOpen = true;
		moreDialog.showModal();
	}

	function closeMore(): void {
		moreOpen = false;
		moreDialog.close();
	}

	onMount(() => {
		mounted = true;
		if (!page.data.tripId) {
			return;
		}
		void sharedState.start(page.data.tripId, enabledModuleIds);
		void tripDayState.start(
			page.data.tripId,
			page.data.tripDays ?? [],
			page.data.tripTimezone ?? 'Europe/Oslo'
		);
		void warmAppShell(
			enabledModules.map((module) => module.primaryPath),
			page.data.tripId
		);
		return (): void => {
			sharedState.stop();
			tripDayState.stop();
		};
	});
</script>

<header
	class="fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between border-b border-base-300 bg-base-100 px-4 lg:pl-24"
>
	<a class="text-primary" href={resolve(homePath)} aria-label="Gjemmekontor" title="Gjemmekontor">
		<BrandLogo class="size-10" label="" />
	</a>
	<div class="flex items-center gap-1">
		<a
			class="btn btn-square btn-ghost btn-sm"
			href={resolve('/trips')}
			aria-label="Velg reise"
			title="Velg reise"
		>
			<ChevronsUpDown size={20} />
		</a>
		{#if page.data.adminAuthenticated && page.data.tripId}
			<a
				class="btn btn-square btn-ghost btn-sm"
				href={resolve('/admin/trips/[tripId]', { tripId: page.data.tripId })}
				aria-label="Trip Settings"
				title="Trip Settings"
			>
				<Settings size={20} />
			</a>
		{/if}
		<ThemeToggle />
		<button
			class="btn btn-square btn-ghost btn-sm"
			type="button"
			onclick={signOut}
			disabled={signingOut}
			aria-label="Logg ut"
			title="Logg ut"
		>
			<LogOut size={20} />
		</button>
	</div>
</header>

<main class="min-h-dvh pt-14 pb-16 lg:pb-0 lg:pl-20">
	{@render children()}
</main>

<nav
	class="module-nav fixed inset-x-0 bottom-0 z-40 grid h-16 border-t border-base-300 bg-base-100 lg:inset-y-0 lg:right-auto lg:h-auto lg:w-20 lg:border-t-0 lg:border-r lg:pt-16"
	style:--mobile-module-count={quickLinks.length + (moreLinks.length ? 1 : 0)}
	style:--desktop-module-count={links.length}
	aria-label="Hovednavigasjon"
>
	{#each links as link (link.href)}
		<a
			class="min-w-0 flex-col items-center justify-center gap-1 px-1 text-xs font-semibold text-base-content/60 aria-[current=page]:bg-primary/10 aria-[current=page]:text-primary lg:flex"
			class:flex={quickLinks.includes(link)}
			class:hidden={moreLinks.includes(link)}
			href={link.href}
			aria-current={isCurrent(link.path) ? 'page' : undefined}
		>
			<link.icon size={21} />
			<span class="max-w-full truncate">{link.label}</span>
		</a>
	{/each}
	{#if moreLinks.length}
		<button
			class="flex min-w-0 flex-col items-center justify-center gap-1 px-1 text-xs font-semibold text-base-content/60 aria-[current=page]:bg-primary/10 aria-[current=page]:text-primary lg:hidden"
			type="button"
			disabled={!mounted}
			onclick={openMore}
			aria-label="Mer"
			aria-haspopup="dialog"
			aria-controls="mobile-more-navigation"
			aria-expanded={moreOpen}
			aria-current={moreActive ? 'page' : undefined}
		>
			<Ellipsis size={21} />
			<span>Mer</span>
		</button>
	{/if}
</nav>

<dialog
	id="mobile-more-navigation"
	bind:this={moreDialog}
	class="modal modal-bottom lg:hidden"
	aria-label="Flere moduler"
	onclose={() => (moreOpen = false)}
>
	<div class="modal-box rounded-t-2xl rounded-b-none p-4 pb-6">
		<nav class="grid grid-cols-2 gap-3" aria-label="Flere moduler">
			{#each moreLinks as link (link.href)}
				<a
					class="flex min-h-24 flex-col items-center justify-center gap-2 rounded-box border border-base-300 bg-base-200/55 p-3 font-semibold text-base-content/70 aria-[current=page]:border-primary/35 aria-[current=page]:bg-primary/10 aria-[current=page]:text-primary"
					href={link.href}
					onclick={closeMore}
					aria-current={isCurrent(link.path) ? 'page' : undefined}
				>
					<link.icon size={25} />
					<span>{link.label}</span>
				</a>
			{/each}
		</nav>
	</div>
	<form method="dialog" class="modal-backdrop">
		<button type="submit" aria-label="Lukk menyen">Lukk</button>
	</form>
</dialog>

<style>
	.module-nav {
		grid-template-columns: repeat(var(--mobile-module-count), minmax(0, 1fr));
	}

	@media (min-width: 64rem) {
		.module-nav {
			grid-template-columns: minmax(0, 1fr);
			grid-template-rows: repeat(var(--desktop-module-count), minmax(0, 1fr));
		}
	}
</style>
