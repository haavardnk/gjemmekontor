<script lang="ts">
	import { ArrowLeft, Eye, EyeOff, LogIn, Settings } from '@lucide/svelte';

	import { resolve } from '$app/paths';
	import BrandLogo from '$lib/ui/BrandLogo.svelte';
	import ThemeToggle from '$lib/ui/ThemeToggle.svelte';

	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let passwordVisible = $state(false);
</script>

<svelte:head>
	<title>Logg inn · {data.trip.name} · Gjemmekontor</title>
</svelte:head>

<main class="grid min-h-dvh place-items-center px-5 py-10">
	<ThemeToggle class="fixed top-4 right-4" />
	<section class="w-full max-w-sm">
		<div class="mb-8 text-center">
			<BrandLogo class="mx-auto mb-6 size-32 text-primary" />
			<p class="mb-2 text-xs font-semibold tracking-wide text-primary uppercase">
				Gjemmekontor · {data.trip.name}
			</p>
			<h1 class="font-display text-4xl leading-tight font-bold text-neutral">
				{data.trip.welcomeText}
			</h1>
			<p class="mt-3 text-sm text-base-content/70">Skriv inn det delte reisepassordet.</p>
		</div>

		{#if data.trip.setupRequired}
			<div class="alert items-start alert-warning">
				<Settings class="mt-0.5 shrink-0" size={20} />
				<div>
					<h2 class="font-bold">Reisen må settes opp</h2>
					<p class="mt-1 text-sm">
						En administrator må angi reisepassord, velge moduler og fullføre innstillingene.
					</p>
				</div>
			</div>
			<a
				class="btn mt-4 w-full btn-primary"
				href={data.adminAuthenticated ? resolve('/admin/trips') : resolve('/admin/login')}
			>
				<Settings size={18} /> Åpne administratoroppsett
			</a>
		{:else}
			<form class="space-y-4" method="post">
				<label class="form-control block" for="password">
					<span class="label pb-2 font-semibold">Passord</span>
					<span class="input-bordered input flex w-full items-center gap-2 bg-base-100">
						<input
							id="password"
							class="min-w-0 grow"
							type={passwordVisible ? 'text' : 'password'}
							name="password"
							autocomplete="current-password"
							required
						/>
						<button
							class="btn btn-square btn-ghost btn-sm"
							type="button"
							onclick={() => (passwordVisible = !passwordVisible)}
							aria-label={passwordVisible ? 'Skjul passord' : 'Vis passord'}
						>
							{#if passwordVisible}<EyeOff size={19} />{:else}<Eye size={19} />{/if}
						</button>
					</span>
				</label>

				{#if form?.errorMessage}
					<p class="text-sm font-medium text-error" aria-live="polite">{form.errorMessage}</p>
				{/if}

				<button class="btn w-full btn-primary" type="submit"><LogIn size={19} /> Logg inn</button>
			</form>
		{/if}

		<a class="btn mt-4 w-full btn-ghost" href={resolve('/trips')}
			><ArrowLeft size={17} /> Velg en annen reise</a
		>
	</section>
</main>
