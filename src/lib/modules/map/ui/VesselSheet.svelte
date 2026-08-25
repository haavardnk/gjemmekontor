<script lang="ts">
	import { Anchor, ExternalLink, Gauge, MapPin, Ruler, Ship, X } from '@lucide/svelte';

	import type { AisVesselFeature } from '$lib/modules/map/domain/ais';

	let {
		vessel,
		onclose
	}: {
		vessel: AisVesselFeature;
		onclose: () => void;
	} = $props();

	const navigationStatusLabels: Record<number, string> = {
		0: 'Underveis for motor',
		1: 'For anker',
		2: 'Ikke under kommando',
		3: 'Begrenset manøvreringsevne',
		4: 'Begrenset av dypgående',
		5: 'Fortøyd',
		6: 'På grunn',
		7: 'Driver fiske',
		8: 'Underveis for seil',
		14: 'Nødsender'
	};

	function shipTypeLabel(type: number | undefined): string {
		if (type === undefined || type === 0) return 'Ukjent fartøytype';
		if (type >= 20 && type <= 29) return 'WIG-fartøy';
		if (type === 30) return 'Fiskefartøy';
		if (type >= 31 && type <= 32) return 'Slepefartøy';
		if (type === 33) return 'Mudringsfartøy';
		if (type === 34) return 'Dykkerfartøy';
		if (type === 35) return 'Militært fartøy';
		if (type === 36) return 'Seilbåt';
		if (type === 37) return 'Fritidsbåt';
		if (type >= 40 && type <= 49) return 'Hurtiggående fartøy';
		if (type === 50) return 'Losfartøy';
		if (type === 51) return 'Søk- og redningsfartøy';
		if (type === 52) return 'Slepebåt';
		if (type === 53) return 'Havnefartøy';
		if (type === 54) return 'Miljøvernfartøy';
		if (type === 55) return 'Myndighetsfartøy';
		if (type >= 60 && type <= 69) return 'Passasjerskip';
		if (type >= 70 && type <= 79) return 'Lasteskip';
		if (type >= 80 && type <= 89) return 'Tankskip';
		return 'Annet fartøy';
	}

	const properties = $derived(vessel.properties);
	const coordinates = $derived(vessel.geometry.coordinates);
	const updated = $derived(
		new Intl.DateTimeFormat('nb-NO', { dateStyle: 'medium', timeStyle: 'medium' }).format(
			new Date(properties.lastSeenAt)
		)
	);
	function metricDimension(value: number, label: string): string {
		const meters = value.toLocaleString('nb-NO', { maximumFractionDigits: 1 });
		return `${meters} m ${label}`;
	}

	function lengthDimension(value: number): string {
		const meters = value.toLocaleString('nb-NO', { maximumFractionDigits: 1 });
		const feet = Math.round(value * 3.28084).toLocaleString('nb-NO');
		return `${meters} m / ${feet} ft lang`;
	}

	const dimensions = $derived(
		properties.lengthMeters !== undefined || properties.widthMeters !== undefined
			? [
					properties.lengthMeters !== undefined
						? lengthDimension(properties.lengthMeters)
						: undefined,
					properties.widthMeters !== undefined
						? metricDimension(properties.widthMeters, 'bred')
						: undefined,
					properties.draughtMeters !== undefined
						? metricDimension(properties.draughtMeters, 'dypgående')
						: undefined
				].filter(Boolean)
			: []
	);
</script>

<aside
	class="absolute inset-x-0 bottom-0 z-30 max-h-[78%] overflow-y-auto rounded-t-lg border-t border-base-300 bg-base-100 shadow-2xl lg:inset-y-4 lg:right-4 lg:left-auto lg:max-h-none lg:w-96 lg:rounded-lg lg:border"
	data-vessel-details={properties.mmsi}
>
	<div
		class="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-base-300 bg-base-100 p-5"
	>
		<div class="min-w-0">
			<p class="text-xs font-semibold text-primary">{shipTypeLabel(properties.shipType)}</p>
			<h2 class="font-display mt-1 text-2xl leading-tight font-bold text-neutral">
				{properties.name}
			</h2>
			<p class="mt-1 font-mono text-xs text-base-content/55">
				MMSI {properties.mmsi}{#if properties.callSign}
					· Kallesignal {properties.callSign}{/if}
			</p>
		</div>
		<button
			class="btn btn-square btn-ghost btn-sm"
			type="button"
			onclick={onclose}
			aria-label="Lukk fartøydetaljer"
			title="Lukk fartøydetaljer"
		>
			<X size={20} />
		</button>
	</div>
	<div class="space-y-4 p-5">
		<div class="grid grid-cols-2 gap-3">
			<div class="rounded-lg border border-base-300 p-3">
				<Gauge class="mb-2 text-primary" size={18} />
				<p class="text-xs font-semibold text-base-content/55">Fart</p>
				<p class="mt-0.5 font-semibold">
					{properties.speedOverGround !== undefined
						? `${properties.speedOverGround.toLocaleString('nb-NO', { maximumFractionDigits: 1 })} kn`
						: 'Ukjent'}
				</p>
			</div>
			<div class="rounded-lg border border-base-300 p-3">
				<Anchor class="mb-2 text-primary" size={18} />
				<p class="text-xs font-semibold text-base-content/55">Kurs</p>
				<p class="mt-0.5 font-semibold">
					{properties.courseOverGround !== undefined
						? `${Math.round(properties.courseOverGround)}°`
						: 'Ukjent'}
				</p>
			</div>
		</div>

		<dl class="divide-y divide-base-300 rounded-lg border border-base-300 px-3 text-sm">
			{#if properties.navigationStatus !== undefined}
				<div class="grid grid-cols-[7rem_1fr] gap-3 py-3">
					<dt class="font-semibold text-base-content/60">Status</dt>
					<dd>
						{navigationStatusLabels[properties.navigationStatus] ??
							`Kode ${properties.navigationStatus}`}
					</dd>
				</div>
			{/if}
			{#if properties.imoNumber}
				<div class="grid grid-cols-[7rem_1fr] gap-3 py-3">
					<dt class="font-semibold text-base-content/60">IMO</dt>
					<dd>{properties.imoNumber}</dd>
				</div>
			{/if}
			{#if properties.destination}
				<div class="grid grid-cols-[7rem_1fr] gap-3 py-3">
					<dt class="font-semibold text-base-content/60">Destinasjon</dt>
					<dd class="break-words">{properties.destination}</dd>
				</div>
			{/if}
		</dl>

		{#if dimensions.length > 0}
			<div class="flex items-start gap-3 rounded-lg border border-base-300 p-3">
				<Ruler class="mt-0.5 shrink-0 text-primary" size={18} />
				<div>
					<p class="text-xs font-semibold text-base-content/55">Dimensjoner</p>
					<p class="mt-0.5 text-sm font-semibold">{dimensions.join(' · ')}</p>
				</div>
			</div>
		{/if}

		<div class="flex items-start gap-3 rounded-lg border border-base-300 p-3">
			<MapPin class="mt-0.5 shrink-0 text-primary" size={18} />
			<div>
				<p class="text-xs font-semibold text-base-content/55">Posisjon</p>
				<p class="mt-0.5 font-mono text-sm font-semibold">
					{coordinates[1].toFixed(5)}, {coordinates[0].toFixed(5)}
				</p>
			</div>
		</div>

		<a
			class="btn w-full btn-outline btn-sm"
			href={`https://ships25.com/no/vessel/detail/${properties.mmsi}`}
			target="_blank"
			rel="noreferrer"
		>
			<ExternalLink size={15} /> Mer informasjon og bilder
		</a>

		<p class="flex items-center gap-2 border-t border-base-300 pt-4 text-xs text-base-content/50">
			<Ship size={14} /> AISStream · Sist sett {updated}
		</p>
	</div>
</aside>
