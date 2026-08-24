<script lang="ts">
	import {
		Anchor,
		Binoculars,
		Coffee,
		IceCreamBowl,
		LifeBuoy,
		Martini,
		Sailboat,
		ShoppingBasket,
		UtensilsCrossed
	} from '@lucide/svelte';

	import type { MapPointSymbol } from './types';

	let {
		symbol,
		color,
		size = 32
	}: { symbol: MapPointSymbol; color: string; size?: number } = $props();

	const icons: Record<MapPointSymbol, typeof Anchor> = {
		anchorage: Anchor,
		bar: Martini,
		'buoy-field': LifeBuoy,
		cafe: Coffee,
		dessert: IceCreamBowl,
		marina: Sailboat,
		restaurant: UtensilsCrossed,
		shop: ShoppingBasket,
		poi: Binoculars
	};
	const SymbolIcon = $derived(icons[symbol] ?? Binoculars);
</script>

<span
	class="grid shrink-0 place-items-center rounded-full border-2 border-white shadow"
	style={`width:${size}px;height:${size}px;background:${color}`}
>
	<SymbolIcon size={Math.round(size * 0.56)} strokeWidth={2.4} color="white" />
</span>
