<script lang="ts">
	import { ArrowLeft, Eye, EyeOff, ShieldCheck } from '@lucide/svelte';

	import { resolve } from '$app/paths';
	import BrandLogo from '$lib/ui/BrandLogo.svelte';
	import ThemeToggle from '$lib/ui/ThemeToggle.svelte';

	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
	let passwordVisible = $state(false);
</script>

<svelte:head>
	<title>Administrator · Gjemmekontor</title>
</svelte:head>

<main class="grid min-h-dvh place-items-center px-5 py-10">
	<ThemeToggle class="fixed top-4 right-4" />
	<section class="w-full max-w-sm">
		<div class="mb-8 text-center">
			<BrandLogo class="mx-auto mb-6 size-28 text-primary" />
			<p class="mb-2 text-xs font-semibold tracking-wide text-primary uppercase">Gjemmekontor</p>
			<h1 class="font-display text-4xl font-bold text-neutral">Administrator</h1>
			<p class="mt-3 text-sm text-base-content/70">Logg inn for å opprette eller endre reiser.</p>
		</div>

		<form class="space-y-4" method="post">
			<label class="form-control block" for="password">
				<span class="label pb-2 font-semibold">Administratorpassord</span>
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

			<button class="btn w-full btn-primary" type="submit">
				<ShieldCheck size={19} /> Logg inn som administrator
			</button>
		</form>

		<a class="btn mt-4 w-full btn-ghost" href={resolve('/trips')}
			><ArrowLeft size={17} /> Til reiser</a
		>
	</section>
</main>
