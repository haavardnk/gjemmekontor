import { type ClientDatabaseSource, resolveClientDatabase } from '$lib/client/database';

import {
	planningLinkImagePath,
	type PlanningPageData,
	planningPhotoPath
} from '../domain/planning';

const imagePrefix = 'planning:image:';

export function planningImagePaths(data: PlanningPageData): string[] {
	return data.cards.flatMap((card) => [
		...card.photos.map(({ id }) => planningPhotoPath(id, 'thumb')),
		...card.links.filter(({ hasImage }) => hasImage).map(({ id }) => planningLinkImagePath(id))
	]);
}

export async function cachePlanningImages(
	source: ClientDatabaseSource,
	paths: readonly string[],
	fetcher: typeof fetch = fetch
): Promise<void> {
	const { database, close } = await resolveClientDatabase(source);
	try {
		const wanted = new Set(paths.map((path) => `${imagePrefix}${path}`));
		const stored = (await database.getAllKeys('moduleBlobs')).filter((key) =>
			key.startsWith(imagePrefix)
		);
		await Promise.all(
			stored.filter((key) => !wanted.has(key)).map((key) => database.delete('moduleBlobs', key))
		);
		const existing = new Set(stored);
		for (const key of wanted) {
			if (existing.has(key)) continue;
			const response = await fetcher(key.slice(imagePrefix.length)).catch(() => undefined);
			if (!response?.ok) continue;
			const data = await response.blob();
			await database.put('moduleBlobs', { key, data, metadata: null, updatedAt: Date.now() });
		}
	} finally {
		if (close) database.close();
	}
}

export async function cachedPlanningImage(
	source: ClientDatabaseSource,
	path: string
): Promise<Blob | undefined> {
	const { database, close } = await resolveClientDatabase(source);
	try {
		return (await database.get('moduleBlobs', `${imagePrefix}${path}`))?.data;
	} finally {
		if (close) database.close();
	}
}
