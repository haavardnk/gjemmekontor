import type { Map as MapLibreMap } from 'maplibre-gl';

import type { Position } from '../domain/types';
import { isGeoJsonSource } from './map-sources';

export type LocationState = 'idle' | 'locating' | 'active' | 'denied' | 'timeout' | 'unavailable';

export type LocationView = {
	state: LocationState;
	following: boolean;
	heading: number;
	speedKnots: number | undefined;
};

const minimumMovingSpeedKnots = 0.3;
const metersPerSecondToKnots = 1.9438444924406;

export function locationMessage(state: LocationState): string {
	return state === 'locating'
		? 'Finner posisjonen din …'
		: state === 'denied'
			? 'Du har ikke gitt tilgang til posisjonen din.'
			: state === 'timeout'
				? 'Det tok for lang tid å finne posisjonen.'
				: state === 'unavailable'
					? 'Posisjonen er ikke tilgjengelig.'
					: '';
}

export function accuracyCircle(center: Position, radius: number): Position[] {
	const latitudeRadians = (center[1] * Math.PI) / 180;
	return Array.from({ length: 65 }, (_value, index): Position => {
		const angle = (index / 64) * Math.PI * 2;
		const latitude = center[1] + (radius / 111_320) * Math.sin(angle);
		const longitude =
			center[0] + (radius / (111_320 * Math.cos(latitudeRadians))) * Math.cos(angle);
		return [longitude, latitude];
	});
}

export class MapLocationController {
	private state: LocationState = 'idle';
	private following = false;
	private heading = 0;
	private speedKnots: number | undefined;
	private watchId: number | undefined;
	private lastPosition: GeolocationPosition | undefined;

	constructor(
		private readonly getMap: () => MapLibreMap | undefined,
		private readonly onChange: (view: LocationView) => void
	) {}

	locate(): void {
		if (!navigator.geolocation) {
			this.state = 'unavailable';
			this.publish();
			return;
		}
		this.following = true;
		if (this.lastPosition) {
			this.updatePosition(this.lastPosition);
			return;
		}
		this.state = 'locating';
		this.publish();
		this.watchId ??= navigator.geolocation.watchPosition(this.updatePosition, this.handleError, {
			enableHighAccuracy: true,
			timeout: 15_000,
			maximumAge: 5_000
		});
	}

	stopFollowing(): void {
		if (!this.following) return;
		this.following = false;
		this.publish();
	}

	refreshSource(): void {
		if (this.lastPosition) this.updatePosition(this.lastPosition);
	}

	dispose(): void {
		if (this.watchId !== undefined && navigator.geolocation) {
			navigator.geolocation.clearWatch(this.watchId);
			this.watchId = undefined;
		}
	}

	private readonly updatePosition = (position: GeolocationPosition): void => {
		this.lastPosition = position;
		this.state = 'active';
		if (
			position.coords.heading !== null &&
			Number.isFinite(position.coords.heading) &&
			position.coords.heading >= 0 &&
			position.coords.heading < 360
		) {
			this.heading = position.coords.heading;
		}
		const speedKnots =
			position.coords.speed !== null &&
			Number.isFinite(position.coords.speed) &&
			position.coords.speed >= 0
				? position.coords.speed * metersPerSecondToKnots
				: undefined;
		this.speedKnots =
			speedKnots !== undefined && speedKnots >= minimumMovingSpeedKnots ? speedKnots : undefined;
		const coordinates: Position = [position.coords.longitude, position.coords.latitude];
		const map = this.getMap();
		const source = map?.getSource('location');
		if (isGeoJsonSource(source)) {
			source.setData({
				type: 'FeatureCollection',
				features: [
					{
						type: 'Feature',
						properties: { kind: 'accuracy' },
						geometry: {
							type: 'Polygon',
							coordinates: [accuracyCircle(coordinates, position.coords.accuracy)]
						}
					},
					{
						type: 'Feature',
						properties: {
							kind: 'position',
							heading: this.heading,
							moving: this.speedKnots !== undefined
						},
						geometry: { type: 'Point', coordinates }
					}
				]
			});
		}
		if (this.following && map) {
			map.easeTo({ center: coordinates, zoom: Math.max(map.getZoom(), 14) });
		}
		this.publish();
	};

	private readonly handleError = (error: GeolocationPositionError): void => {
		this.following = false;
		this.state = error.code === 1 ? 'denied' : error.code === 3 ? 'timeout' : 'unavailable';
		this.publish();
	};

	private publish(): void {
		this.onChange({
			state: this.state,
			following: this.following,
			heading: this.heading,
			speedKnots: this.speedKnots
		});
	}
}
