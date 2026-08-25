<script lang="ts">
	export type LocationSuggestion = {
		id: string;
		name: string;
	};

	let {
		label,
		value = $bindable(),
		suggestions,
		placeholder = '',
		oncommit
	}: {
		label: string;
		value: string;
		suggestions: LocationSuggestion[];
		placeholder?: string;
		oncommit?: (value: string) => void;
	} = $props();

	let open = $state(false);
	const normalized = $derived(value.trim().toLocaleLowerCase('nb-NO'));
	const matches = $derived(
		suggestions.filter(
			(suggestion) => !normalized || suggestion.name.toLocaleLowerCase('nb-NO').includes(normalized)
		)
	);
	const listboxId = $props.id();

	function select(name: string): void {
		value = name;
		open = false;
		oncommit?.(name);
	}

	function commit(): void {
		open = false;
		oncommit?.(value);
	}
</script>

<label class="relative block">
	<span class="mb-1 block font-semibold">{label}</span>
	<input
		class="input w-full bg-base-100"
		role="combobox"
		aria-expanded={open && matches.length > 0}
		aria-controls={listboxId}
		aria-autocomplete="list"
		{placeholder}
		bind:value
		maxlength="200"
		onfocus={() => (open = true)}
		oninput={() => (open = true)}
		onblur={commit}
		onkeydown={(event) => {
			if (event.key === 'Escape') open = false;
		}}
	/>
	{#if open && matches.length > 0}
		<ul
			id={listboxId}
			class="absolute inset-x-0 top-full z-50 mt-1 max-h-56 overflow-y-auto rounded-lg border border-base-300 bg-base-100 p-1 shadow-xl"
			role="listbox"
		>
			{#each matches as suggestion, index (`${suggestion.id}-${index}`)}
				<li role="option" aria-selected={suggestion.name === value}>
					<button
						class="w-full rounded px-3 py-2 text-left text-sm hover:bg-base-200"
						type="button"
						onmousedown={(event) => event.preventDefault()}
						onclick={() => select(suggestion.name)}
					>
						{suggestion.name}
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</label>
