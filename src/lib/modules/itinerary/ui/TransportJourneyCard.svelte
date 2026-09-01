<script lang="ts">
	import type { ItineraryEndpoint, TransportMode } from '../domain/itinerary';

	let { from, to, mode }: { from: ItineraryEndpoint; to: ItineraryEndpoint; mode: TransportMode } =
		$props();

	function timeLabel(endpoint: ItineraryEndpoint): string {
		return endpoint.localDateTime.slice(11);
	}

	function utcOffsetLabel(endpoint: ItineraryEndpoint): string {
		const part = new Intl.DateTimeFormat('en-GB', {
			timeZone: endpoint.timeZone,
			timeZoneName: 'shortOffset'
		})
			.formatToParts(new Date(endpoint.instant))
			.find((value) => value.type === 'timeZoneName')?.value;
		return part?.replace('GMT+0', 'GMT') ?? 'GMT';
	}

	function endpointMeta(endpoint: ItineraryEndpoint): string[] {
		return [
			endpoint.locationCode.toUpperCase(),
			endpoint.terminal ? `Terminal ${endpoint.terminal}` : '',
			endpoint.gate ? `Gate ${endpoint.gate}` : '',
			endpoint.platform && endpoint.platform !== endpoint.gate ? `Spor ${endpoint.platform}` : ''
		].filter(Boolean);
	}

	const hasArrivalTime = $derived(mode !== 'taxi' && mode !== 'transfer');
</script>

<div class="mt-4" data-transport-route>
	<div class="relative ml-1">
		<span class="absolute top-2 bottom-2 left-[0.3rem] w-px bg-primary/30" aria-hidden="true"
		></span>

		<section class="relative pb-5 pl-7" data-transport-stop="from">
			<span
				class="absolute top-1 left-0 size-2.5 rounded-full border-2 border-primary bg-base-100"
				aria-hidden="true"
			></span>
			<div class="flex items-baseline justify-between gap-3">
				<p class="text-[10px] font-bold tracking-[0.16em] text-base-content/50 uppercase">Fra</p>
				<p class="shrink-0 text-sm font-bold tabular-nums">
					{timeLabel(from)}
					<span class="ml-1 text-[10px] font-semibold text-base-content/45"
						>{utcOffsetLabel(from)}</span
					>
				</p>
			</div>
			<p class="mt-1 leading-snug font-bold [overflow-wrap:anywhere]">{from.locationName}</p>
			{#if endpointMeta(from).length}
				<p class="mt-1 text-xs text-base-content/55">{endpointMeta(from).join(' · ')}</p>
			{/if}
		</section>

		<section class="relative pl-7" data-transport-stop="to">
			<span
				class="absolute top-1 left-0 size-2.5 rounded-full bg-primary ring-2 ring-base-100"
				aria-hidden="true"
			></span>
			<div class="flex items-baseline justify-between gap-3">
				<p class="text-[10px] font-bold tracking-[0.16em] text-base-content/50 uppercase">Til</p>
				{#if hasArrivalTime}
					<p class="shrink-0 text-sm font-bold tabular-nums">
						{timeLabel(to)}
						<span class="ml-1 text-[10px] font-semibold text-base-content/45"
							>{utcOffsetLabel(to)}</span
						>
					</p>
				{/if}
			</div>
			<p class="mt-1 leading-snug font-bold [overflow-wrap:anywhere]">{to.locationName}</p>
			{#if endpointMeta(to).length}
				<p class="mt-1 text-xs text-base-content/55">{endpointMeta(to).join(' · ')}</p>
			{/if}
		</section>
	</div>
</div>
