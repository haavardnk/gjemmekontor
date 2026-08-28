<script lang="ts">
	import RuleBookPage from '$lib/modules/rule-book/ui/RuleBookPage.svelte';

	let { data } = $props();
</script>

<RuleBookPage
	members={data.members}
	days={data.tripDays ?? []}
	timeZone={data.tripTimezone ?? 'Europe/Oslo'}
/>
