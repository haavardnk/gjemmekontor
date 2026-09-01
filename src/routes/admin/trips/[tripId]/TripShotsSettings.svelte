<script lang="ts">
	import type { PageData } from './$types';

	let { summary }: { summary: PageData['shotsSummary'] } = $props();
</script>

<section class="card border border-base-300 bg-base-100 p-5">
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div>
			<h2 class="text-xl font-bold">Opptaksplan</h2>
			<p class="mt-1 text-sm text-base-content/65">
				{summary.packName} · versjon {summary.version}
			</p>
		</div>
		<span class="badge" class:badge-success={summary.enabled}
			>{summary.enabled ? 'Modul aktiv' : 'Modul av'}</span
		>
	</div>
	<p class="mt-3 text-sm text-base-content/65">
		Planen inneholder scenebank, kameraer og faste dagskoblinger. Fullføring og utvalgsdata ligger
		separat på denne reisen og kopieres aldri med planen.
	</p>
	<div class="mt-4 grid gap-3 sm:grid-cols-2">
		<form
			method="post"
			action="?/shotsBlank"
			onsubmit={(event) => {
				if (!confirm('Starte med en ny tom opptaksplan? Nåværende versjon blir bevart.'))
					event.preventDefault();
			}}
		>
			<button class="btn w-full btn-outline" type="submit">Ny tom plan</button>
		</form>
		<form
			method="post"
			action="?/shotsStandard"
			onsubmit={(event) => {
				if (!confirm('Erstatte med standardmalen? Nåværende versjon blir bevart.'))
					event.preventDefault();
			}}
		>
			<button class="btn w-full btn-outline" type="submit">Bruk standardmal</button>
		</form>
	</div>
	{#if summary.cloneSources.length}
		<form method="post" action="?/shotsClone" class="mt-3 flex flex-col gap-2 sm:flex-row">
			<select class="select-bordered select min-w-0 grow" name="sourceTripId" required
				><option value="">Kopier plan fra en annen reise</option
				>{#each summary.cloneSources as source (source.tripId)}<option value={source.tripId}
						>{source.tripName} · {source.packName} · v{source.version}</option
					>{/each}</select
			>
			<button class="btn btn-outline" type="submit">Kopier definisjoner</button>
		</form>
	{/if}
	<details class="mt-4 rounded-box border border-base-300">
		<summary class="cursor-pointer px-4 py-3 font-semibold">Rediger avansert JSON</summary>
		<form method="post" action="?/shotsCustom" class="border-t border-base-300 p-4">
			<p class="mb-3 text-xs text-base-content/60">
				Lagring validerer alle scene-, gruppe- og dagsreferanser. En ugyldig plan endrer ingenting.
			</p>
			<textarea
				class="textarea-bordered textarea h-96 w-full font-mono text-xs"
				name="contentJson"
				required
				spellcheck="false">{summary.contentJson}</textarea
			>
			<button class="btn mt-3 btn-primary" type="submit">Valider og lagre ny versjon</button>
		</form>
	</details>
</section>
