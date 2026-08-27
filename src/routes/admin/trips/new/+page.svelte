<script lang="ts">
	import { ArrowLeft, Plus } from '@lucide/svelte';

	import { resolve } from '$app/paths';
	import { moduleCatalog } from '$lib/app/modules/catalog';

	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const today = new Date().toISOString().slice(0, 10);
</script>

<svelte:head><title>Ny reise · Gjemmekontor</title></svelte:head>

<main class="mx-auto min-h-dvh w-full max-w-3xl px-5 py-10">
	<a class="btn mb-5 btn-ghost btn-sm" href={resolve('/admin/trips')}>
		<ArrowLeft size={17} /> Reiser
	</a>
	<header class="mb-8">
		<p class="mb-1 text-xs font-semibold tracking-wide text-primary uppercase">Administrator</p>
		<h1 class="font-display text-4xl font-bold text-neutral">Ny reise</h1>
		<p class="mt-2 text-sm text-base-content/70">
			Reisen opprettes samlet når alle obligatoriske innstillinger og leverandørkoblinger er
			gyldige.
		</p>
	</header>

	<form method="post" class="space-y-6">
		<fieldset class="card border border-base-300 bg-base-100 p-5">
			<legend class="px-2 text-lg font-bold">Grunninformasjon</legend>
			<div class="grid gap-4 sm:grid-cols-2">
				<label class="form-control sm:col-span-2">
					<span class="label font-semibold">Reisenavn</span>
					<input class="input-bordered input" name="name" required maxlength="100" />
				</label>
				<label class="form-control sm:col-span-2">
					<span class="label font-semibold">Reisemål</span>
					<input class="input-bordered input" name="destination" maxlength="200" />
				</label>
				<label class="form-control">
					<span class="label font-semibold">Fra dato</span>
					<input class="input-bordered input" name="startsOn" type="date" value={today} required />
				</label>
				<label class="form-control">
					<span class="label font-semibold">Til dato</span>
					<input class="input-bordered input" name="endsOn" type="date" value={today} required />
				</label>
				<label class="form-control sm:col-span-2">
					<span class="label font-semibold">Tidssone</span>
					<input class="input-bordered input" name="timezone" value="Europe/Oslo" required />
				</label>
				<label class="form-control sm:col-span-2">
					<span class="label font-semibold">Velkomsttekst</span>
					<textarea class="textarea-bordered textarea" name="welcomeText" required maxlength="200"
						>Velkommen om bord</textarea
					>
				</label>
			</div>
		</fieldset>

		<fieldset class="card border border-base-300 bg-base-100 p-5">
			<legend class="px-2 text-lg font-bold">Tilgang</legend>
			<label class="form-control">
				<span class="label font-semibold">Delt reisepassord</span>
				<input
					class="input-bordered input"
					name="password"
					type="password"
					minlength="8"
					required
				/>
			</label>
		</fieldset>

		<fieldset class="card border border-base-300 bg-base-100 p-5">
			<legend class="px-2 text-lg font-bold">Personer</legend>
			<p class="mb-3 text-sm text-base-content/65">
				Velg personer som allerede finnes i databasen.
			</p>
			<div class="grid gap-2 sm:grid-cols-2">
				{#each data.people as person (person.id)}
					<label class="flex items-center gap-3 rounded-box border border-base-300 p-3">
						<input
							class="checkbox checkbox-primary"
							type="checkbox"
							name="memberId"
							value={person.id}
						/>
						<span class="font-semibold">{person.displayName}</span>
					</label>
				{/each}
			</div>
		</fieldset>

		<fieldset class="card border border-base-300 bg-base-100 p-5">
			<legend class="px-2 text-lg font-bold">Moduler</legend>
			<div class="grid gap-2 sm:grid-cols-2">
				{#each moduleCatalog as module (module.id)}
					<label class="flex items-center gap-3 rounded-box border border-base-300 p-3">
						<input
							class="checkbox checkbox-primary"
							type="checkbox"
							name="enabledModuleId"
							value={module.id}
							checked={module.id === 'map'}
						/>
						<span class="font-semibold">{module.label}</span>
					</label>
				{/each}
			</div>
			<div class="mt-4 grid gap-4 sm:grid-cols-2">
				<label class="form-control">
					<span class="label font-semibold">Google My Maps-ID</span>
					<input class="input-bordered input" name="mapGoogleMyMapsId" />
				</label>
				<label class="form-control">
					<span class="label font-semibold">Standard kartvisning</span>
					<select class="select-bordered select" name="mapDefaultMode">
						<option value="normal">Vanlig kart</option>
						<option value="nautical">Sjøkart</option>
						<option value="satellite">Satellittkart</option>
					</select>
				</label>
				<fieldset class="rounded-box border border-base-300 p-3">
					<legend class="px-1 text-sm font-semibold">Kartoverlegg</legend>
					<label class="flex items-center gap-2 text-sm">
						<input
							class="checkbox checkbox-sm checkbox-primary"
							type="checkbox"
							name="mapEnabledOverlay"
							value="ais"
							checked
						/> AIS-fartøy
					</label>
					<label class="mt-2 flex items-center gap-2 text-sm">
						<input
							class="checkbox checkbox-sm checkbox-primary"
							type="checkbox"
							name="mapEnabledOverlay"
							value="depth-contours"
							checked
						/> Dybdekoter
					</label>
				</fieldset>
				<fieldset class="rounded-box border border-base-300 p-3">
					<legend class="px-1 text-sm font-semibold">Tillatte offlinepakker</legend>
					{#each [{ id: 'normal', label: 'Vanlig' }, { id: 'nautical', label: 'Sjøkart' }, { id: 'satellite', label: 'Satellitt' }] as option (option.id)}
						<label class="mt-1 flex items-center gap-2 text-sm">
							<input
								class="checkbox checkbox-sm checkbox-primary"
								type="checkbox"
								name="mapOfflinePackage"
								value={option.id}
							/>
							{option.label}
						</label>
					{/each}
				</fieldset>
				<label class="form-control">
					<span class="label font-semibold">Eksisterende Bring-liste-ID</span>
					<input class="input-bordered input" name="shoppingListUuid" />
					<span class="label text-xs text-base-content/60">
						Kontrolleres før reisen opprettes når handlelistemodulen er valgt. En ny liste kan
						opprettes fra Trip Settings etterpå.
					</span>
				</label>
				<label class="form-control">
					<span class="label font-semibold">Startinnhold for opptak</span>
					<select class="select-bordered select" name="shotContentMode">
						<option value="blank">Tom opptaksplan</option>
						<option value="standard">Standardmal</option>
						{#if data.shotCloneSources.length}
							<option value="clone">Kopier fra en reise</option>
						{/if}
					</select>
				</label>
				{#if data.shotCloneSources.length}
					<label class="form-control">
						<span class="label font-semibold">Reise å kopiere opptaksplan fra</span>
						<select class="select-bordered select" name="shotSourceTripId">
							<option value="">Velg reise når «Kopier» er valgt</option>
							{#each data.shotCloneSources as source (source.tripId)}
								<option value={source.tripId}>
									{source.tripName} · {source.packName} · v{source.version}
								</option>
							{/each}
						</select>
					</label>
				{/if}
			</div>
		</fieldset>

		{#if form?.errorMessage}
			<p class="alert text-sm alert-error" aria-live="polite">{form.errorMessage}</p>
		{/if}
		<button class="btn w-full btn-primary" type="submit"><Plus size={19} /> Opprett reise</button>
	</form>
</main>
