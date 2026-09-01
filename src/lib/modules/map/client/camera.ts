import { z } from 'zod';

import type { Position } from '../domain/types';

const mapCameraSchema = z
	.object({
		center: z.tuple([z.number().finite().min(-180).max(180), z.number().finite().min(-90).max(90)]),
		zoom: z.number().finite().min(0).max(24),
		bearing: z.number().finite(),
		pitch: z.number().finite().min(0).max(85)
	})
	.strict();

export type MapCamera = {
	center: Position;
	zoom: number;
	bearing: number;
	pitch: number;
};

type CameraStorage = Pick<Storage, 'getItem' | 'removeItem' | 'setItem'>;

export function mapCameraStorageKey(tripId: string): string {
	return `mapCamera:${tripId}`;
}

export function loadMapCamera(storage: CameraStorage, key: string): MapCamera | undefined {
	try {
		const parsed = mapCameraSchema.safeParse(JSON.parse(storage.getItem(key) ?? 'null'));
		return parsed.success ? parsed.data : undefined;
	} catch {
		return undefined;
	}
}

export function storeMapCamera(storage: CameraStorage, key: string, camera: MapCamera): void {
	try {
		storage.setItem(key, JSON.stringify(mapCameraSchema.parse(camera)));
	} catch {
		// Camera persistence must not interrupt map interaction.
	}
}

export function removeMapCamera(storage: CameraStorage, key: string): void {
	try {
		storage.removeItem(key);
	} catch {
		// The overview reset still works when storage is unavailable.
	}
}
