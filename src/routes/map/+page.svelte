<script lang="ts">
	import MapPage from '$lib/modules/map/ui/MapPage.svelte';

	let { data } = $props();
</script>

<MapPage defaultMode={data.defaultMode} enabledOverlays={data.enabledOverlays} />
