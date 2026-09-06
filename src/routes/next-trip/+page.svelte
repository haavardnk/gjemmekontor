<script lang="ts">
	import NextTripPage from '$lib/modules/next-trip/ui/NextTripPage.svelte';

	let { data } = $props();
</script>

<NextTripPage people={data.people} suggestions={data.suggestions} />
