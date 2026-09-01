<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		dialog = $bindable(),
		id,
		label,
		labelledBy,
		modalClass = 'modal',
		boxClass = 'modal-box',
		closeLabel = 'Lukk dialogen',
		closeDisabled = false,
		onclose,
		children
	}: {
		dialog: HTMLDialogElement;
		id?: string;
		label?: string;
		labelledBy?: string;
		modalClass?: string;
		boxClass?: string;
		closeLabel?: string;
		closeDisabled?: boolean;
		onclose?: (event: Event) => void;
		children: Snippet;
	} = $props();
</script>

<dialog
	bind:this={dialog}
	{id}
	class={modalClass}
	aria-label={label}
	aria-labelledby={labelledBy}
	{onclose}
>
	<div class={boxClass}>
		{@render children()}
	</div>
	<form method="dialog" class="modal-backdrop">
		<button type="submit" disabled={closeDisabled} aria-label={closeLabel}>Lukk</button>
	</form>
</dialog>
