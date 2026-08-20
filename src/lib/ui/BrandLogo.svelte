<script lang="ts">
	let { label = 'Gjemmekontor', class: className = '' }: { label?: string; class?: string } =
		$props();
</script>

<span class="brand-logo {className}" role="img" aria-label={label}></span>

<style>
	.brand-logo {
		display: block;
		flex-shrink: 0;
		background-color: currentColor;
		mask: url('/gjemmekontor-logo.png') center / contain no-repeat;
		-webkit-mask: url('/gjemmekontor-logo.png') center / contain no-repeat;
	}
</style>
