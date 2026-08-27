<script lang="ts">
	import {
		ArrowDown,
		ArrowLeft,
		ArrowUp,
		CheckCircle2,
		GripVertical,
		KeyRound,
		Plus,
		Save,
		Trash2,
		UserMinus
	} from '@lucide/svelte';
	import { untrack } from 'svelte';

	import { resolve } from '$app/paths';

	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let modules = $state(untrack(() => data.settings.modules.map((module) => ({ ...module }))));
	let draggedIndex = $state<number>();
	let mapGoogleMyMapsId = $state(
		untrack(() =>
			String(
				data.settings.modules.find((module) => module.id === 'map')?.config.googleMyMapsId ?? ''
			)
		)
	);
	let loadedModules = $state(untrack(() => JSON.stringify(data.settings.modules)));
	const members = $derived(data.settings.people.filter((person) => person.member));
	const availablePeople = $derived(
		data.settings.people.filter((person) => !person.member && !person.archived)
	);
	const mapConfig = $derived(
		data.settings.modules.find((module) => module.id === 'map')?.config ?? {}
	);

	$effect(() => {
		const fingerprint = JSON.stringify(data.settings.modules);
		if (fingerprint === loadedModules) return;
		modules = data.settings.modules.map((module) => ({ ...module }));
		mapGoogleMyMapsId = String(
			data.settings.modules.find((module) => module.id === 'map')?.config.googleMyMapsId ?? ''
		);
		loadedModules = fingerprint;
	});

	function moveModule(index: number, direction: -1 | 1): void {
		const target = index + direction;
		if (target < 0 || target >= modules.length) return;
		const [module] = modules.splice(index, 1);
		if (module) modules.splice(target, 0, module);
	}

	function dropModule(target: number): void {
		if (draggedIndex === undefined || draggedIndex === target) return;
		const [module] = modules.splice(draggedIndex, 1);
		if (module) modules.splice(target, 0, module);
		draggedIndex = undefined;
	}
</script>

<svelte:head><title>Innstillinger · {data.settings.name} · Gjemmekontor</title></svelte:head>

<main class="mx-auto min-h-dvh w-full max-w-4xl px-5 py-10">
	<a class="btn mb-5 btn-ghost btn-sm" href={resolve('/admin/trips')}>
		<ArrowLeft size={17} /> Reiser
	</a>
	<header class="mb-8 flex flex-wrap items-start justify-between gap-4">
		<div>
			<p class="mb-1 text-xs font-semibold tracking-wide text-primary uppercase">Trip Settings</p>
			<h1 class="font-display text-4xl font-bold text-neutral">{data.settings.name}</h1>
			<p class="mt-2 text-sm text-base-content/70">
				Status: <span class="font-semibold">{data.settings.status}</span>
			</p>
		</div>
		<a
			class="btn btn-outline btn-sm"
			href={resolve('/t/[tripSlug]/unlock', { tripSlug: data.settings.slug })}
		>
			Vis innlogging
		</a>
	</header>

	{#if form?.errorMessage}
		<p class="mb-5 alert text-sm alert-error" aria-live="polite">{form.errorMessage}</p>
	{:else if form?.successMessage}
		<p class="mb-5 alert text-sm alert-success" aria-live="polite">{form.successMessage}</p>
	{/if}

	{#if !data.readiness.ready}
		<aside class="mb-6 alert items-start alert-warning">
			<div>
				<h2 class="font-bold">Oppsettet må fullføres</h2>
				<ul class="mt-2 list-inside list-disc text-sm">
					{#each data.readiness.issues as issue (issue)}<li>{issue}</li>{/each}
				</ul>
			</div>
		</aside>
	{/if}

	{#if data.settings.status === 'archived'}
		<form method="post" action="?/unarchive" class="card border border-base-300 bg-base-100 p-5">
			<h2 class="text-xl font-bold">Arkivert reise</h2>
			<p class="my-3 text-sm">Alle data er bevart. Hent reisen tilbake for å redigere den.</p>
			<button class="btn self-start btn-primary" type="submit">Hent fra arkivet</button>
		</form>
	{:else}
		<div class="space-y-6">
			<form method="post" action="?/general" class="card border border-base-300 bg-base-100 p-5">
				<h2 class="mb-4 text-xl font-bold">Generelt og datoer</h2>
				<div class="grid gap-4 sm:grid-cols-2">
					<label class="form-control sm:col-span-2">
						<span class="label font-semibold">Reisenavn</span>
						<input
							class="input-bordered input"
							name="name"
							value={data.settings.name}
							required
							maxlength="100"
						/>
					</label>
					<label class="form-control sm:col-span-2">
						<span class="label font-semibold">Reisemål</span>
						<input
							class="input-bordered input"
							name="destination"
							value={data.settings.destination}
							maxlength="200"
						/>
					</label>
					<label class="form-control">
						<span class="label font-semibold">Fra dato</span>
						<input
							class="input-bordered input"
							type="date"
							name="startsOn"
							value={data.settings.startsOn}
							required
						/>
					</label>
					<label class="form-control">
						<span class="label font-semibold">Til dato</span>
						<input
							class="input-bordered input"
							type="date"
							name="endsOn"
							value={data.settings.endsOn}
							required
						/>
					</label>
					<label class="form-control sm:col-span-2">
						<span class="label font-semibold">Tidssone</span>
						<input
							class="input-bordered input"
							name="timezone"
							value={data.settings.timezone}
							required
						/>
					</label>
					<label class="form-control sm:col-span-2">
						<span class="label font-semibold">Velkomsttekst</span>
						<textarea class="textarea-bordered textarea" name="welcomeText" required maxlength="200"
							>{data.settings.welcomeText}</textarea
						>
						<span class="label text-xs text-base-content/60">
							«Skriv inn det delte reisepassordet.» er fast tekst.
						</span>
					</label>
				</div>
				<button class="btn mt-4 self-end btn-primary" type="submit"
					><Save size={18} /> Lagre generelt</button
				>
			</form>

			<form method="post" action="?/password" class="card border border-base-300 bg-base-100 p-5">
				<h2 class="mb-2 text-xl font-bold">Reisepassord</h2>
				<p class="mb-4 text-sm text-base-content/65">
					Et nytt passord logger ut alle som er inne på denne reisen. Det gamle passordet trengs
					ikke.
				</p>
				<div class="flex flex-col gap-3 sm:flex-row">
					<input
						class="input-bordered input grow"
						name="password"
						type="password"
						minlength="8"
						required
						placeholder={data.settings.hasPassword ? 'Nytt reisepassord' : 'Angi reisepassord'}
					/>
					<button class="btn btn-primary" type="submit"
						><KeyRound size={18} /> Erstatt passord</button
					>
				</div>
			</form>

			<section class="card border border-base-300 bg-base-100 p-5">
				<h2 class="mb-2 text-xl font-bold">Personer</h2>
				<p class="mb-4 text-sm text-base-content/65">
					Personer fjernes bare fra reisen og forblir tilgjengelige for nye reiser.
				</p>
				<div class="space-y-2" role="list">
					{#each members as person (person.id)}
						<div class="flex items-center gap-3 rounded-box border border-base-300 p-3">
							<span class="grow font-semibold">{person.displayName}</span>
							<form method="post" action="?/removeMember">
								<input type="hidden" name="personId" value={person.id} />
								<button class="btn btn-ghost text-error btn-sm" type="submit">
									<UserMinus size={17} /> Fjern
								</button>
							</form>
						</div>
					{/each}
				</div>
				<div class="mt-4 grid gap-3 sm:grid-cols-2">
					<form method="post" action="?/addExistingMember" class="flex gap-2">
						<select class="select-bordered select min-w-0 grow" name="personId" required>
							<option value="">Velg eksisterende person</option>
							{#each availablePeople as person (person.id)}
								<option value={person.id}>{person.displayName}</option>
							{/each}
						</select>
						<button class="btn btn-outline" type="submit"><Plus size={17} /> Legg til</button>
					</form>
					<form method="post" action="?/addNewMember" class="flex gap-2">
						<input
							class="input-bordered input min-w-0 grow"
							name="displayName"
							required
							placeholder="Ny person"
						/>
						<button class="btn btn-outline" type="submit"><Plus size={17} /> Opprett</button>
					</form>
				</div>
			</section>

			<form method="post" action="?/modules" class="card border border-base-300 bg-base-100 p-5">
				<h2 class="mb-2 text-xl font-bold">Moduler og rekkefølge</h2>
				<p class="mb-4 text-sm text-base-content/65">
					Dra modulene eller bruk pilene. Rekkefølgen brukes i hele navigasjonen.
				</p>
				<input
					type="hidden"
					name="moduleOrder"
					value={JSON.stringify(modules.map((module) => module.id))}
				/>
				<div class="space-y-2">
					{#each modules as module, index (module.id)}
						<div
							class="flex items-center gap-2 rounded-box border border-base-300 p-3"
							role="listitem"
							draggable={true}
							ondragstart={() => (draggedIndex = index)}
							ondragover={(event) => event.preventDefault()}
							ondrop={() => dropModule(index)}
						>
							<GripVertical class="cursor-grab text-base-content/40" size={19} />
							<input
								class="checkbox checkbox-primary"
								type="checkbox"
								name="enabledModuleId"
								value={module.id}
								bind:checked={module.enabled}
								aria-label={`Aktiver ${module.label}`}
							/>
							<span class="grow font-semibold">{module.label}</span>
							<button
								class="btn btn-square btn-ghost btn-sm"
								type="button"
								onclick={() => moveModule(index, -1)}
								disabled={index === 0}
								aria-label={`Flytt ${module.label} opp`}
							>
								<ArrowUp size={17} />
							</button>
							<button
								class="btn btn-square btn-ghost btn-sm"
								type="button"
								onclick={() => moveModule(index, 1)}
								disabled={index === modules.length - 1}
								aria-label={`Flytt ${module.label} ned`}
							>
								<ArrowDown size={17} />
							</button>
						</div>
					{/each}
				</div>
				<button class="btn mt-4 self-end btn-primary" type="submit"
					><Save size={18} /> Lagre moduler</button
				>
			</form>

			<section class="card border border-base-300 bg-base-100 p-5">
				<div class="flex flex-wrap items-start justify-between gap-3">
					<div>
						<h2 class="text-xl font-bold">Kart</h2>
						<p class="mt-1 text-sm text-base-content/65">
							{data.mapSummary.mappings} leverandørkoblinger · {data.mapSummary.enrichments}
							lagrede Tripadvisor-oppslag
						</p>
						<p class="mt-1 text-xs text-base-content/55">
							AIS {data.mapSummary.aisProviderConfigured ? 'klar' : 'mangler nøkkel'} · Google Places
							{data.mapSummary.googlePlacesConfigured ? 'klar' : 'av'} · Tripadvisor
							{data.mapSummary.tripadvisorConfigured ? 'klar' : 'av'}
						</p>
					</div>
					<span
						class="badge"
						class:badge-success={data.mapSummary.enabled && data.mapSummary.configured}
						class:badge-warning={!data.mapSummary.enabled || !data.mapSummary.configured}
					>
						{data.mapSummary.enabled && data.mapSummary.configured ? 'Konfigurert' : 'Ikke klar'}
					</span>
				</div>
				<form method="post" action="?/map" class="mt-4">
					<div class="grid gap-4 sm:grid-cols-2">
						<label class="form-control">
							<span class="label font-semibold">Google My Maps-ID</span>
							<input
								class="input-bordered input"
								name="mapGoogleMyMapsId"
								bind:value={mapGoogleMyMapsId}
							/>
						</label>
						<label class="form-control">
							<span class="label font-semibold">Standardvisning</span>
							<select
								class="select-bordered select"
								name="mapDefaultMode"
								value={String(mapConfig.defaultMode ?? 'normal')}
							>
								<option value="normal">Vanlig kart</option>
								<option value="nautical">Sjøkart</option>
								<option value="satellite">Satellittkart</option>
							</select>
						</label>
						<fieldset class="rounded-box border border-base-300 p-3">
							<legend class="px-1 text-sm font-semibold">Overlegg</legend>
							<label class="mt-1 flex items-center gap-2 text-sm">
								<input
									class="checkbox checkbox-sm checkbox-primary"
									type="checkbox"
									name="mapEnabledOverlay"
									value="ais"
									checked={Array.isArray(mapConfig.enabledOverlays)
										? mapConfig.enabledOverlays.includes('ais')
										: true}
								/>
								AIS-fartøy
							</label>
							<label class="mt-2 flex items-center gap-2 text-sm">
								<input
									class="checkbox checkbox-sm checkbox-primary"
									type="checkbox"
									name="mapEnabledOverlay"
									value="depth-contours"
									checked={Array.isArray(mapConfig.enabledOverlays)
										? mapConfig.enabledOverlays.includes('depth-contours')
										: true}
								/>
								Dybdekoter i sjøkart
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
										checked={Array.isArray(mapConfig.offlinePackages) &&
											mapConfig.offlinePackages.includes(option.id)}
									/>
									{option.label}
								</label>
							{/each}
						</fieldset>
					</div>
					<button class="btn mt-4 btn-primary" type="submit"><Save size={18} /> Lagre kart</button>
				</form>
				<form method="post" action="?/refreshMap" class="mt-4">
					<button
						class="btn btn-outline"
						type="submit"
						disabled={!data.mapSummary.enabled || !data.mapSummary.configured}
					>
						Test og oppdater kart
					</button>
				</form>
			</section>

			<section class="card border border-base-300 bg-base-100 p-5">
				<div class="flex flex-wrap items-start justify-between gap-3">
					<div>
						<h2 class="text-xl font-bold">Handleliste og Bring</h2>
						<p class="mt-1 text-sm text-base-content/65">
							Bring-kontoen deles av serveren, mens hver reise velger sin egen liste.
						</p>
					</div>
					<span
						class="badge"
						class:badge-success={data.bringSummary.providerStatus === 'verified'}
						class:badge-warning={data.bringSummary.providerStatus !== 'verified'}
					>
						{data.bringSummary.providerStatus === 'verified' ? 'Verifisert' : 'Ikke koblet'}
					</span>
				</div>
				{#if data.bringSummary.listUuid}
					<div class="mt-4 rounded-box border border-base-300 bg-base-200/40 p-3 text-sm">
						<p class="font-semibold">{data.bringSummary.listName ?? 'Bring-liste'}</p>
						<p class="mt-1 font-mono text-xs break-all text-base-content/65">
							{data.bringSummary.listUuid}
						</p>
					</div>
				{/if}
				{#if !data.bringSummary.credentialsConfigured}
					<p class="mt-4 alert text-sm alert-warning">
						BRING_EMAIL og BRING_PASSWORD må konfigureres på serveren først.
					</p>
				{/if}
				<div class="mt-4 grid gap-4 sm:grid-cols-2">
					<form
						method="post"
						action="?/connectBring"
						class="rounded-box border border-base-300 p-4"
					>
						<h3 class="font-bold">Bruk eksisterende liste</h3>
						<p class="mt-1 text-xs text-base-content/60">
							ID-en lagres først etter at Bring har bekreftet tilgangen.
						</p>
						<input
							class="input-bordered input mt-3 w-full"
							name="listUuid"
							required
							maxlength="100"
							placeholder="Bring-liste-ID"
						/>
						<button
							class="btn mt-3 w-full btn-outline"
							type="submit"
							disabled={!data.bringSummary.credentialsConfigured}
						>
							Test og koble til
						</button>
					</form>
					<form method="post" action="?/createBring" class="rounded-box border border-base-300 p-4">
						<h3 class="font-bold">Opprett ny liste</h3>
						<p class="mt-1 text-xs text-base-content/60">
							Opprettes med navnet «{data.settings.name}» og kobles til etter kontroll.
						</p>
						<button
							class="btn mt-3 w-full btn-primary"
							type="submit"
							disabled={!data.bringSummary.credentialsConfigured}
						>
							Opprett i Bring
						</button>
					</form>
				</div>
				<p class="mt-4 text-xs text-base-content/55">
					Et senere bytte av reisenavn endrer ikke navnet på Bring-listen automatisk.
				</p>
			</section>

			<section class="card border border-base-300 bg-base-100 p-5">
				<div class="flex flex-wrap items-start justify-between gap-3">
					<div>
						<h2 class="text-xl font-bold">Opptaksplan</h2>
						<p class="mt-1 text-sm text-base-content/65">
							{data.shotsSummary.packName} · versjon {data.shotsSummary.version}
						</p>
					</div>
					<span class="badge" class:badge-success={data.shotsSummary.enabled}>
						{data.shotsSummary.enabled ? 'Modul aktiv' : 'Modul av'}
					</span>
				</div>
				<p class="mt-3 text-sm text-base-content/65">
					Planen inneholder scenebank, kameraer og faste dagskoblinger. Fullføring og utvalgsdata
					ligger separat på denne reisen og kopieres aldri med planen.
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
				{#if data.shotsSummary.cloneSources.length}
					<form method="post" action="?/shotsClone" class="mt-3 flex flex-col gap-2 sm:flex-row">
						<select class="select-bordered select min-w-0 grow" name="sourceTripId" required>
							<option value="">Kopier plan fra en annen reise</option>
							{#each data.shotsSummary.cloneSources as source (source.tripId)}
								<option value={source.tripId}>
									{source.tripName} · {source.packName} · v{source.version}
								</option>
							{/each}
						</select>
						<button class="btn btn-outline" type="submit">Kopier definisjoner</button>
					</form>
				{/if}
				<details class="mt-4 rounded-box border border-base-300">
					<summary class="cursor-pointer px-4 py-3 font-semibold">Rediger avansert JSON</summary>
					<form method="post" action="?/shotsCustom" class="border-t border-base-300 p-4">
						<p class="mb-3 text-xs text-base-content/60">
							Lagring validerer alle scene-, gruppe- og dagsreferanser. En ugyldig plan endrer
							ingenting.
						</p>
						<textarea
							class="textarea-bordered textarea h-96 w-full font-mono text-xs"
							name="contentJson"
							required
							spellcheck="false">{data.shotsSummary.contentJson}</textarea
						>
						<button class="btn mt-3 btn-primary" type="submit">Valider og lagre ny versjon</button>
					</form>
				</details>
			</section>

			<section class="card border border-base-300 bg-base-100 p-5">
				<h2 class="mb-4 text-xl font-bold">Tilgang og status</h2>
				<form method="post" action="?/visibility" class="flex flex-wrap items-end gap-3">
					<label class="form-control grow">
						<span class="label font-semibold">Synlighet i reisevelgeren</span>
						<select
							class="select-bordered select"
							name="visibility"
							value={data.settings.visibility}
						>
							<option value="listed">Synlig</option>
							<option value="unlisted">Skjult</option>
						</select>
					</label>
					<button class="btn btn-outline" type="submit"><Save size={18} /> Lagre</button>
				</form>
				<form method="post" action="?/activate" class="mt-4">
					<button class="btn btn-success" type="submit" disabled={!data.readiness.ready}>
						<CheckCircle2 size={18} /> Aktiver reisen
					</button>
				</form>
			</section>

			<form
				method="post"
				action="?/archive"
				class="card border border-error/30 bg-error/5 p-5"
				onsubmit={(event) => {
					if (!confirm('Arkivere reisen? Ingen data blir slettet.')) event.preventDefault();
				}}
			>
				<h2 class="text-xl font-bold text-error">Arkiver reise</h2>
				<p class="my-3 text-sm">
					Reisen skjules og alle reiseinnlogginger utløper. Dataene beholdes.
				</p>
				<button class="btn self-start btn-error" type="submit"><Trash2 size={18} /> Arkiver</button>
			</form>
		</div>
	{/if}
</main>
