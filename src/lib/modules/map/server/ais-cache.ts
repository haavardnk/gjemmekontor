import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { vesselFromCache, type VesselState } from './ais-vessels';

type VesselCache = {
	version: 1;
	vessels: VesselState[];
};

export function loadVesselCache(path: string | undefined, now: number, staleAfterMs: number) {
	const vessels = new Map<number, VesselState>();
	if (!path) return vessels;
	try {
		const cache = JSON.parse(readFileSync(path, 'utf8')) as Partial<VesselCache>;
		if (cache.version !== 1 || !Array.isArray(cache.vessels)) return vessels;
		for (const value of cache.vessels) {
			const vessel = vesselFromCache(value, now, staleAfterMs);
			if (vessel) vessels.set(vessel.mmsi, vessel);
		}
	} catch {
		return vessels;
	}
	return vessels;
}

export function persistVesselCache(path: string, vessels: Map<number, VesselState>): void {
	const temporaryPath = `${path}.${randomUUID()}.tmp`;
	try {
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(
			temporaryPath,
			JSON.stringify({ version: 1, vessels: [...vessels.values()] } satisfies VesselCache),
			{ encoding: 'utf8', mode: 0o600 }
		);
		renameSync(temporaryPath, path);
	} catch {
		try {
			rmSync(temporaryPath, { force: true });
		} catch {
			return;
		}
	}
}
