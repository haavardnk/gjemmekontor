<script lang="ts">
	import { Eye, EyeOff, LogIn } from '@lucide/svelte';

	import BrandLogo from '$lib/ui/BrandLogo.svelte';
	import ThemeToggle from '$lib/ui/ThemeToggle.svelte';

	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();

	let password = $state('');
	let passwordVisible = $state(false);
	let pending = $state(false);
	let clientErrorMessage = $state('');
	const errorMessage = $derived(clientErrorMessage || form?.errorMessage || '');

	async function submit(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		if (!password) {
			clientErrorMessage = 'Skriv inn passordet.';
			return;
		}

		pending = true;
		clientErrorMessage = '';
		try {
			const response = await fetch('/api/auth/login', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ password })
			});
			if (!response.ok) {
				clientErrorMessage =
					response.status === 401
						? 'Passordet er ikke riktig.'
						: 'Kunne ikke logge inn. Prøv igjen.';
				return;
			}

			window.location.assign('/');
		} catch {
			clientErrorMessage = 'Får ikke kontakt med serveren. Prøv igjen når du er på nett.';
		} finally {
			pending = false;
		}
	}
</script>

<svelte:head>
	<title>Logg inn · Gjemmekontor</title>
</svelte:head>

<main class="grid min-h-dvh place-items-center px-5 py-10">
	<ThemeToggle class="fixed top-4 right-4" />
	<section class="w-full max-w-sm">
		<div class="mb-8 text-center">
			<BrandLogo class="mx-auto mb-6 size-32 text-primary" />
			<p class="mb-2 text-xs font-semibold tracking-wide text-primary uppercase">
				Gjemmekontor · Kroatia 2026
			</p>
			<h1 class="font-display text-4xl leading-tight font-bold text-neutral">
				Velkommen om bord på <span class="block text-primary">S/Y Bad Buoy</span>
			</h1>
			<p class="mt-3 text-sm text-base-content/70">Skriv inn det delte reisepassordet.</p>
		</div>

		<form class="space-y-4" method="post" onsubmit={submit}>
			<div class="form-control block">
				<label class="label pb-2 font-semibold" for="password">Passord</label>
				<span class="input-bordered input flex w-full items-center gap-2 bg-base-100">
					<input
						id="password"
						class="min-w-0 grow"
						type={passwordVisible ? 'text' : 'password'}
						name="password"
						autocomplete="current-password"
						bind:value={password}
						aria-invalid={errorMessage ? 'true' : undefined}
						aria-describedby={errorMessage ? 'login-error' : undefined}
					/>
					<button
						class="btn btn-square btn-ghost btn-sm"
						type="button"
						onclick={() => (passwordVisible = !passwordVisible)}
						aria-label={passwordVisible ? 'Skjul passord' : 'Vis passord'}
						title={passwordVisible ? 'Skjul passord' : 'Vis passord'}
					>
						{#if passwordVisible}
							<EyeOff size={19} />
						{:else}
							<Eye size={19} />
						{/if}
					</button>
				</span>
			</div>

			{#if errorMessage}
				<p id="login-error" class="text-sm font-medium text-error" aria-live="polite">
					{errorMessage}
				</p>
			{/if}

			<button class="btn w-full btn-primary" type="submit" disabled={pending}>
				{#if pending}
					<span class="loading loading-sm loading-spinner"></span>
					Logger inn …
				{:else}
					<LogIn size={19} />
					Logg inn
				{/if}
			</button>
		</form>
	</section>
</main>
