<script lang="ts">
	import {
		Backpack,
		BookOpen,
		Ellipsis,
		LogOut,
		Map,
		ScrollText,
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
	let signingOut = $state(false);
	let moreOpen = $state(false);
	let moreDialog: HTMLDialogElement;

	async function signOut(): Promise<void> {
		signingOut = true;
		try {
			await fetch('/api/auth/logout', { method: 'POST' });
			window.location.assign('/login');
		} finally {
			signingOut = false;
		}
	}

	const icons = {
		backpack: Backpack,
		'book-open': BookOpen,
		map: Map,
		'scroll-text': ScrollText,
		'shopping-basket': ShoppingBasket,
		utensils: Utensils,
		video: Video
	};
	const enabledModuleIds = $derived(
		new Set((page.data.enabledModuleIds ?? moduleCatalog.map((module) => module.id)) as ModuleId[])
	);
	const enabledModules = $derived(
		moduleCatalog.filter((module) => enabledModuleIds.has(module.id))
	);
	const links = $derived(
		enabledModules.map((module) => ({
			href: resolve(module.primaryPath),
			path: module.primaryPath,
			label: module.label,
			icon: icons[module.icon],
			mobileNavigation: module.mobileNavigation
		}))
	);
	const quickLinks = $derived(links.filter((link) => link.mobileNavigation === 'quick'));
	const moreLinks = $derived(links.filter((link) => link.mobileNavigation === 'more'));
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

	onMount(() => {
		void sharedState.start([...enabledModuleIds]);
		void tripDayState.start();
		void warmAppShell(enabledModules.flatMap((module) => module.appShellPaths));
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
			class:flex={link.mobileNavigation === 'quick'}
			class:hidden={link.mobileNavigation === 'more'}
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
					onclick={() => moreDialog.close()}
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
