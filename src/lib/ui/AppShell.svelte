<script lang="ts">
	import { BookOpen, LogOut, Map, ShoppingBasket, Video } from '@lucide/svelte';
	import type { Snippet } from 'svelte';
	import { onMount } from 'svelte';

	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { warmAppShell } from '$lib/client/pwa';
	import { sharedState } from '$lib/client/state.svelte';
	import { tripDayState } from '$lib/trip/day.svelte';

	import BrandLogo from './BrandLogo.svelte';
	import ThemeToggle from './ThemeToggle.svelte';

	let { children }: { children: Snippet } = $props();
	let signingOut = $state(false);

	async function signOut(): Promise<void> {
		signingOut = true;
		try {
			await fetch('/api/auth/logout', { method: 'POST' });
			window.location.assign('/login');
		} finally {
			signingOut = false;
		}
	}

	const links = [
		{ href: resolve('/map'), path: '/map', label: 'Kart', icon: Map },
		{ href: resolve('/shots'), path: '/shots', label: 'Opptak', icon: Video },
		{ href: resolve('/logbook'), path: '/logbook', label: 'Loggbok', icon: BookOpen },
		{
			href: resolve('/shoppinglist'),
			path: '/shoppinglist',
			label: 'Handleliste',
			icon: ShoppingBasket
		}
	];

	onMount(() => {
		void sharedState.start();
		void tripDayState.start();
		void warmAppShell();
		return (): void => {
			sharedState.stop();
			tripDayState.stop();
		};
	});
</script>

<header
	class="fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between border-b border-base-300 bg-base-100 px-4 lg:pl-24"
>
	<a class="text-primary" href={resolve('/map')} aria-label="Gjemmekontor" title="Gjemmekontor">
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
	class="fixed inset-x-0 bottom-0 z-40 grid h-16 grid-cols-4 border-t border-base-300 bg-base-100 lg:inset-y-0 lg:right-auto lg:h-auto lg:w-20 lg:grid-cols-1 lg:grid-rows-4 lg:border-t-0 lg:border-r lg:pt-16"
>
	{#each links as link (link.href)}
		<a
			class="flex min-w-0 flex-col items-center justify-center gap-1 px-1 text-xs font-semibold text-base-content/60 aria-[current=page]:bg-primary/10 aria-[current=page]:text-primary"
			href={link.href}
			aria-current={page.url.pathname === link.path ? 'page' : undefined}
		>
			<link.icon size={21} />
			<span>{link.label}</span>
		</a>
	{/each}
</nav>
