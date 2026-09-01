<script lang="ts">
	import { ArrowLeft, CheckCircle2, KeyRound, Plus, Save, Trash2, UserMinus } from '@lucide/svelte';

	import { resolve } from '$app/paths';

	import type { ActionData, PageData } from './$types';
	import TripModuleSettings from './TripModuleSettings.svelte';
	import TripServiceSettings from './TripServiceSettings.svelte';
	import TripShotsSettings from './TripShotsSettings.svelte';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let mapGoogleMyMapsId = $derived(
		String(data.settings.modules.find((module) => module.id === 'map')?.config.googleMyMapsId ?? '')
	);
	const members = $derived(data.settings.people.filter((person) => person.member));
	const availablePeople = $derived(
		data.settings.people.filter((person) => !person.member && !person.archived)
	);
	const mapConfig = $derived(
		data.settings.modules.find((module) => module.id === 'map')?.config ?? {}
	);
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

			<TripModuleSettings configuredModules={data.settings.modules} />

			<TripServiceSettings
				tripName={data.settings.name}
				mapSummary={data.mapSummary}
				bringSummary={data.bringSummary}
				{mapConfig}
				bind:mapGoogleMyMapsId
			/>

			<TripShotsSettings summary={data.shotsSummary} />

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
