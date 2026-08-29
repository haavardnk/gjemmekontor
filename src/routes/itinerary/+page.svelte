<script lang="ts">
	import ItineraryPage from '$lib/modules/itinerary/ui/ItineraryPage.svelte';

	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<ItineraryPage members={data.members} googlePlacesApiKey={data.googlePlacesApiKey} />
