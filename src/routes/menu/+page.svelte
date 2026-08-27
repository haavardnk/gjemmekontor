<script lang="ts">
	import MenuPage from '$lib/modules/menu/ui/MenuPage.svelte';

	let { data } = $props();
</script>

<MenuPage archives={data.archives} dishes={data.dishes} />
