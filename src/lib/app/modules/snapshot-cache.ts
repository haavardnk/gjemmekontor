import { apiRequest } from '$lib/client/api';
import type { CachedResourceDescriptor } from '$lib/client/cached-resource';
import { cachedResources } from '$lib/client/cached-resources.svelte';
import { gearCache } from '$lib/modules/gear/client/cache';
import { mapCache } from '$lib/modules/map/client/cache';
import { menuCache } from '$lib/modules/menu/client/cache';
import { nextTripCache } from '$lib/modules/next-trip/client/cache';
import { shoppingListCache } from '$lib/modules/shopping-list/client/cache';

export const snapshotCaches = [
	gearCache,
	mapCache,
	menuCache,
	nextTripCache,
	shoppingListCache
] as const;

async function warmSnapshot(descriptor: CachedResourceDescriptor<unknown>): Promise<boolean> {
	try {
		const response = await apiRequest(descriptor.endpoint, {
			signal: AbortSignal.timeout(15_000)
		});
		const parsed = descriptor.schema.safeParse(
			descriptor.select ? descriptor.select(response) : response
		);
		if (!parsed.success) return false;
		await cachedResources.storeSnapshot(descriptor.snapshotKey, parsed.data);
		return true;
	} catch {
		return false;
	}
}

export async function warmEnabledSnapshots(enabledModuleIds: readonly string[]): Promise<void> {
	await Promise.allSettled(
		snapshotCaches
			.filter((descriptor) => enabledModuleIds.includes(descriptor.moduleId))
			.map(warmSnapshot)
	);
}
