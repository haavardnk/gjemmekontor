<script lang="ts">
	import PlanningPage from '$lib/modules/planning/ui/PlanningPage.svelte';

	let { data } = $props();
</script>

<PlanningPage planning={data.planning} googlePlacesApiKey={data.googlePlacesApiKey} />
