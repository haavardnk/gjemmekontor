import { randomUUID } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { getRuntimeConfig } from '$lib/server/env';

export type PlanningFiles = { links: string };

export function planningFiles(dataDir: string, tripId: string): PlanningFiles {
	const root = join(dataDir, 'trips', tripId, 'planning');
	return { links: join(root, 'links') };
}

export function runtimePlanningFiles(tripId: string): PlanningFiles {
	return planningFiles(getRuntimeConfig().dataDir, tripId);
}

export function writePlanningFile(directory: string, name: string, data: Uint8Array): void {
	mkdirSync(directory, { recursive: true });
	const temporaryPath = join(directory, `.${name}.${randomUUID()}.tmp`);
	try {
		writeFileSync(temporaryPath, data);
		renameSync(temporaryPath, join(directory, name));
	} catch (error) {
		rmSync(temporaryPath, { force: true });
		throw error;
	}
}

export function readPlanningFile(directory: string, name: string): Uint8Array | undefined {
	try {
		return readFileSync(join(directory, name));
	} catch {
		return undefined;
	}
}

export function removePlanningFiles(directory: string, names: readonly string[]): void {
	for (const name of names) rmSync(join(directory, name), { force: true });
}

export function sweepPlanningDirectory(directory: string, keep: ReadonlySet<string>): void {
	let names: string[];
	try {
		names = readdirSync(directory);
	} catch {
		return;
	}
	removePlanningFiles(
		directory,
		names.filter((name) => !keep.has(name))
	);
}
