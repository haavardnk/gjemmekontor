<script lang="ts">
	import ShotsPage from '$lib/modules/shots/ui/ShotsPage.svelte';

	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<ShotsPage days={data.days} content={data.shotContent} />
