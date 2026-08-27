<script lang="ts">
	import GearPage from '$lib/modules/gear/ui/GearPage.svelte';

	let { data } = $props();
</script>

<GearPage people={data.people} categories={data.categories} items={data.items} />
