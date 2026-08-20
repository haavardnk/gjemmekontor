<script lang="ts">
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
</script>

<svelte:head>
	<title>Gjemmekontor</title>
</svelte:head>

<main class="grid min-h-dvh place-items-center px-6 py-12">
	<section class="text-center">
		<img class="mx-auto mb-6 size-28" src="/gjemmekontor-logo.png" alt="Gjemmekontor-logo" />
		<p class="mb-2 text-sm font-semibold tracking-wide text-primary uppercase">
			Kroatia · september 2026
		</p>
		<h1 class="font-display text-5xl font-bold text-neutral">Gjemmekontor</h1>
		<p class="mt-4 text-base-content/70">Du er logget inn. Reiseappen er under bygging.</p>
		<button class="btn mt-8 btn-ghost" type="button" onclick={signOut} disabled={signingOut}>
			{signingOut ? 'Logger ut …' : 'Logg ut'}
		</button>
	</section>
</main>
