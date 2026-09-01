<script lang="ts">
	import { Save } from '@lucide/svelte';

	import type { PageData } from './$types';

	let {
		tripName,
		mapSummary,
		bringSummary,
		mapConfig,
		mapGoogleMyMapsId = $bindable()
	}: {
		tripName: string;
		mapSummary: PageData['mapSummary'];
		bringSummary: PageData['bringSummary'];
		mapConfig: Record<string, unknown>;
		mapGoogleMyMapsId: string;
	} = $props();
</script>

<section class="card border border-base-300 bg-base-100 p-5">
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div>
			<h2 class="text-xl font-bold">Kart</h2>
			<p class="mt-1 text-sm text-base-content/65">
				{mapSummary.mappings} leverandørkoblinger · {mapSummary.enrichments} lagrede Tripadvisor-oppslag
			</p>
			<p class="mt-1 text-xs text-base-content/55">
				AIS {mapSummary.aisProviderConfigured ? 'klar' : 'mangler nøkkel'} · Google Places {mapSummary.googlePlacesConfigured
					? 'klar'
					: 'av'} · Tripadvisor {mapSummary.tripadvisorConfigured ? 'klar' : 'av'}
			</p>
		</div>
		<span
			class="badge"
			class:badge-success={mapSummary.enabled && mapSummary.configured}
			class:badge-warning={!mapSummary.enabled || !mapSummary.configured}
			>{mapSummary.enabled && mapSummary.configured ? 'Konfigurert' : 'Ikke klar'}</span
		>
	</div>
	<form method="post" action="?/map" class="mt-4">
		<div class="grid gap-4 sm:grid-cols-2">
			<label class="form-control"
				><span class="label font-semibold">Google My Maps-ID</span><input
					class="input-bordered input"
					name="mapGoogleMyMapsId"
					bind:value={mapGoogleMyMapsId}
				/></label
			>
			<label class="form-control">
				<span class="label font-semibold">Standardvisning</span>
				<select
					class="select-bordered select"
					name="mapDefaultMode"
					value={String(mapConfig.defaultMode ?? 'normal')}
					><option value="normal">Vanlig kart</option><option value="nautical">Sjøkart</option
					><option value="satellite">Satellittkart</option></select
				>
			</label>
			<fieldset class="rounded-box border border-base-300 p-3">
				<legend class="px-1 text-sm font-semibold">Overlegg</legend>
				<label class="mt-1 flex items-center gap-2 text-sm"
					><input
						class="checkbox checkbox-sm checkbox-primary"
						type="checkbox"
						name="mapEnabledOverlay"
						value="ais"
						checked={Array.isArray(mapConfig.enabledOverlays)
							? mapConfig.enabledOverlays.includes('ais')
							: true}
					/>AIS-fartøy</label
				>
				<label class="mt-2 flex items-center gap-2 text-sm"
					><input
						class="checkbox checkbox-sm checkbox-primary"
						type="checkbox"
						name="mapEnabledOverlay"
						value="depth-contours"
						checked={Array.isArray(mapConfig.enabledOverlays)
							? mapConfig.enabledOverlays.includes('depth-contours')
							: true}
					/>Dybdekoter i sjøkart</label
				>
			</fieldset>
			<fieldset class="rounded-box border border-base-300 p-3">
				<legend class="px-1 text-sm font-semibold">Tillatte offlinepakker</legend>
				{#each [{ id: 'normal', label: 'Vanlig' }, { id: 'nautical', label: 'Sjøkart' }, { id: 'satellite', label: 'Satellitt' }] as option (option.id)}<label
						class="mt-1 flex items-center gap-2 text-sm"
						><input
							class="checkbox checkbox-sm checkbox-primary"
							type="checkbox"
							name="mapOfflinePackage"
							value={option.id}
							checked={Array.isArray(mapConfig.offlinePackages) &&
								mapConfig.offlinePackages.includes(option.id)}
						/>{option.label}</label
					>{/each}
			</fieldset>
		</div>
		<button class="btn mt-4 btn-primary" type="submit"><Save size={18} /> Lagre kart</button>
	</form>
	<form method="post" action="?/refreshMap" class="mt-4">
		<button
			class="btn btn-outline"
			type="submit"
			disabled={!mapSummary.enabled || !mapSummary.configured}>Test og oppdater kart</button
		>
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
			class:badge-success={bringSummary.providerStatus === 'verified'}
			class:badge-warning={bringSummary.providerStatus !== 'verified'}
			>{bringSummary.providerStatus === 'verified' ? 'Verifisert' : 'Ikke koblet'}</span
		>
	</div>
	{#if bringSummary.listUuid}<div
			class="mt-4 rounded-box border border-base-300 bg-base-200/40 p-3 text-sm"
		>
			<p class="font-semibold">{bringSummary.listName ?? 'Bring-liste'}</p>
			<p class="mt-1 font-mono text-xs break-all text-base-content/65">{bringSummary.listUuid}</p>
		</div>{/if}
	{#if !bringSummary.credentialsConfigured}<p class="mt-4 alert text-sm alert-warning">
			BRING_EMAIL og BRING_PASSWORD må konfigureres på serveren først.
		</p>{/if}
	<div class="mt-4 grid gap-4 sm:grid-cols-2">
		<form method="post" action="?/connectBring" class="rounded-box border border-base-300 p-4">
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
				disabled={!bringSummary.credentialsConfigured}>Test og koble til</button
			>
		</form>
		<form method="post" action="?/createBring" class="rounded-box border border-base-300 p-4">
			<h3 class="font-bold">Opprett ny liste</h3>
			<p class="mt-1 text-xs text-base-content/60">
				Opprettes med navnet «{tripName}» og kobles til etter kontroll.
			</p>
			<button
				class="btn mt-3 w-full btn-primary"
				type="submit"
				disabled={!bringSummary.credentialsConfigured}>Opprett i Bring</button
			>
		</form>
	</div>
	<p class="mt-4 text-xs text-base-content/55">
		Et senere bytte av reisenavn endrer ikke navnet på Bring-listen automatisk.
	</p>
</section>
