<script lang="ts">
	import { LoaderCircle, MapPin } from '@lucide/svelte';
	import { onDestroy } from 'svelte';

	import { loadGooglePlacesUiKit } from '$lib/modules/map/client/google-places-loader';

	type GooglePlace = {
		displayName?: string;
		formattedAddress?: string;
		fetchFields: (request: { fields: string[] }) => Promise<unknown>;
	};
	type GooglePlacePrediction = {
		text: { toString: () => string };
		toPlace: () => GooglePlace;
	};
	type GoogleAutocompleteSuggestion = { placePrediction?: GooglePlacePrediction };
	type GoogleAutocompleteSessionToken = object;
	type GooglePlacesAutocompleteLibrary = {
		AutocompleteSessionToken: new () => GoogleAutocompleteSessionToken;
		AutocompleteSuggestion: {
			fetchAutocompleteSuggestions: (request: {
				input: string;
				language: string;
				sessionToken: GoogleAutocompleteSessionToken;
			}) => Promise<{ suggestions: GoogleAutocompleteSuggestion[] }>;
		};
	};
	type GoogleMapsGlobal = typeof globalThis & {
		google?: { maps?: { importLibrary?: (name: string) => Promise<unknown> } };
	};

	let {
		label,
		value = $bindable(),
		apiKey = '',
		placeholder = '',
		compact = false,
		required = true
	}: {
		label: string;
		value: string;
		apiKey?: string;
		placeholder?: string;
		compact?: boolean;
		required?: boolean;
	} = $props();

	const listboxId = $props.id();
	let open = $state(false);
	let loading = $state(false);
	let googleUnavailable = $state(false);
	let suggestions = $state<GooglePlacePrediction[]>([]);
	let library: GooglePlacesAutocompleteLibrary | undefined;
	let sessionToken: GoogleAutocompleteSessionToken | undefined;
	let requestVersion = 0;
	let debounceTimer: ReturnType<typeof setTimeout> | undefined;

	onDestroy(() => {
		if (debounceTimer) clearTimeout(debounceTimer);
		requestVersion += 1;
	});

	async function ensureLibrary(): Promise<GooglePlacesAutocompleteLibrary | undefined> {
		if (!apiKey || googleUnavailable) return undefined;
		if (library) return library;
		try {
			await loadGooglePlacesUiKit(apiKey);
			const importLibrary = (globalThis as GoogleMapsGlobal).google?.maps?.importLibrary;
			if (!importLibrary) throw new Error('GOOGLE_PLACES_UNAVAILABLE');
			library = (await importLibrary('places')) as GooglePlacesAutocompleteLibrary;
			return library;
		} catch {
			googleUnavailable = true;
			return undefined;
		}
	}

	function queueSuggestions(): void {
		open = true;
		suggestions = [];
		if (debounceTimer) clearTimeout(debounceTimer);
		if (!apiKey || value.trim().length < 2) return;
		debounceTimer = setTimeout(() => void fetchSuggestions(value.trim()), 250);
	}

	async function fetchSuggestions(input: string): Promise<void> {
		const version = ++requestVersion;
		loading = true;
		try {
			const places = await ensureLibrary();
			if (!places || version !== requestVersion) return;
			sessionToken ??= new places.AutocompleteSessionToken();
			const result = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
				input,
				language: 'nb',
				sessionToken
			});
			if (version !== requestVersion || input !== value.trim()) return;
			suggestions = result.suggestions
				.map((suggestion) => suggestion.placePrediction)
				.filter((prediction): prediction is GooglePlacePrediction => Boolean(prediction));
		} catch {
			if (version === requestVersion) suggestions = [];
		} finally {
			if (version === requestVersion) loading = false;
		}
	}

	async function selectPrediction(prediction: GooglePlacePrediction): Promise<void> {
		loading = true;
		try {
			const place = prediction.toPlace();
			await place.fetchFields({ fields: ['displayName', 'formattedAddress'] });
			const displayName = place.displayName?.trim() ?? '';
			const formattedAddress = place.formattedAddress?.trim() ?? '';
			value =
				displayName && formattedAddress && !formattedAddress.startsWith(displayName)
					? `${displayName}, ${formattedAddress}`
					: formattedAddress || displayName || prediction.text.toString();
		} catch {
			value = prediction.text.toString();
		} finally {
			open = false;
			loading = false;
			suggestions = [];
			sessionToken = library ? new library.AutocompleteSessionToken() : undefined;
		}
	}
</script>

<label class="relative block">
	<span class="mb-1 block font-semibold" class:text-sm={compact}>{label}</span>
	<div class="relative">
		<MapPin
			class="pointer-events-none absolute top-1/2 left-3 z-10 -translate-y-1/2 text-base-content/45"
			size={compact ? 14 : 16}
		/>
		<input
			class="input w-full bg-base-100 pr-9 pl-9"
			class:input-sm={compact}
			role="combobox"
			aria-expanded={open && suggestions.length > 0}
			aria-controls={listboxId}
			aria-autocomplete={apiKey ? 'list' : 'none'}
			{placeholder}
			{required}
			bind:value
			maxlength="200"
			autocomplete="off"
			onfocus={() => (open = true)}
			oninput={queueSuggestions}
			onblur={() => (open = false)}
			onkeydown={(event) => {
				if (event.key === 'Escape') open = false;
			}}
		/>
		{#if loading}<LoaderCircle
				class="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 animate-spin text-primary"
				size={compact ? 14 : 16}
			/>{/if}
	</div>
	{#if open && suggestions.length > 0}
		<ul
			id={listboxId}
			class="absolute inset-x-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-xl border border-base-300 bg-base-100 p-1 shadow-xl"
			role="listbox"
		>
			{#each suggestions as prediction, index (`${prediction.text.toString()}-${index}`)}
				<li role="option" aria-selected="false">
					<button
						class="flex w-full items-start gap-2 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-base-200"
						type="button"
						onmousedown={(event) => event.preventDefault()}
						onclick={() => selectPrediction(prediction)}
					>
						<MapPin class="mt-0.5 shrink-0 text-primary" size={15} />
						<span>{prediction.text.toString()}</span>
					</button>
				</li>
			{/each}
			<li class="px-3 py-1.5 text-right text-[10px] text-base-content/40">Google Maps</li>
		</ul>
	{/if}
</label>
