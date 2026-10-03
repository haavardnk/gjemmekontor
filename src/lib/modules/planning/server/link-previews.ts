import type Database from 'better-sqlite3';
import { load } from 'cheerio';

import {
	hasRasterSignature,
	type RasterImageType,
	rasterImageTypes
} from '$lib/server/raster-image';
import { fetchRemoteResource } from '$lib/server/remote-fetch';

import { type PlanningFiles, writePlanningFile } from './files';

export type ParsedLinkPreview = {
	title: string | null;
	description: string | null;
	siteName: string | null;
	imageUrl: string | null;
};

export type LinkPreview = Omit<ParsedLinkPreview, 'imageUrl'> & {
	image: { type: RasterImageType; body: Uint8Array } | null;
};

export type LinkPreviewFetcher = (url: string) => Promise<LinkPreview>;

type PendingLink = { id: string; url: string };

const htmlTypes = ['text/html', 'application/xhtml+xml'];
const maximumImageBytes = 2_000_000;
const concurrency = 4;
const inFlight = new Set<string>();

function clip(value: string | null | undefined, maximum: number): string | null {
	const normalized = value?.replace(/\s+/g, ' ').trim();
	if (!normalized) return null;
	return normalized.length > maximum
		? `${normalized.slice(0, maximum - 1).trimEnd()}…`
		: normalized;
}

function absoluteUrl(value: string | null, base: string): string | null {
	if (!value) return null;
	try {
		return new URL(value, base).href;
	} catch {
		return null;
	}
}

export function parseLinkPreview(html: string, finalUrl: string): ParsedLinkPreview {
	const $ = load(html);
	const meta = (...names: string[]): string | null => {
		for (const name of names) {
			const value = $(`meta[property="${name}" i], meta[name="${name}" i]`)
				.first()
				.attr('content')
				?.trim();
			if (value) return value;
		}
		return null;
	};
	return {
		title: clip(meta('og:title', 'twitter:title') ?? $('title').first().text(), 300),
		description: clip(meta('og:description', 'twitter:description', 'description'), 500),
		siteName: clip(meta('og:site_name', 'application-name'), 100),
		imageUrl: absoluteUrl(
			meta('og:image:secure_url', 'og:image', 'og:image:url', 'twitter:image', 'twitter:image:src'),
			finalUrl
		)
	};
}

function rasterImage(
	contentType: string,
	body: Uint8Array
): { type: RasterImageType; body: Uint8Array } | null {
	const type = rasterImageTypes.find((candidate) => candidate === contentType);
	return type && hasRasterSignature(type, body) ? { type, body } : null;
}

async function fetchPreviewImage(
	url: string
): Promise<{ type: RasterImageType; body: Uint8Array } | null> {
	try {
		const resource = await fetchRemoteResource(url, {
			accept: rasterImageTypes.join(','),
			allowedContentTypes: rasterImageTypes,
			maximumBytes: maximumImageBytes
		});
		return rasterImage(resource.contentType, resource.body);
	} catch {
		return null;
	}
}

export async function fetchLinkPreview(url: string): Promise<LinkPreview> {
	const resource = await fetchRemoteResource(url, {
		accept: [...htmlTypes, ...rasterImageTypes].join(','),
		allowedContentTypes: [...htmlTypes, ...rasterImageTypes],
		maximumBytes: maximumImageBytes
	});
	if (!htmlTypes.includes(resource.contentType)) {
		return {
			title: null,
			description: null,
			siteName: null,
			image: rasterImage(resource.contentType, resource.body)
		};
	}
	const { imageUrl, ...parsed } = parseLinkPreview(
		new TextDecoder().decode(resource.body),
		resource.finalUrl
	);
	return { ...parsed, image: imageUrl ? await fetchPreviewImage(imageUrl) : null };
}

function storePreview(
	db: Database.Database,
	tripId: string,
	files: PlanningFiles,
	link: PendingLink,
	preview: LinkPreview | null,
	timestamp: string
): boolean {
	const current = db
		.prepare(
			`SELECT url FROM planning_card_links WHERE trip_id = ? AND id = ? AND status = 'pending'`
		)
		.get(tripId, link.id) as { url: string } | undefined;
	if (current?.url !== link.url) return false;
	let imageType: RasterImageType | null = null;
	if (preview?.image) {
		try {
			writePlanningFile(files.links, link.id, preview.image.body);
			imageType = preview.image.type;
		} catch {
			imageType = null;
		}
	}
	db.prepare(
		`UPDATE planning_card_links
		 SET status = ?, title = ?, description = ?, site_name = ?, image_type = ?, fetched_at = ?
		 WHERE trip_id = ? AND id = ?`
	).run(
		preview ? 'ready' : 'failed',
		preview?.title ?? null,
		preview?.description ?? null,
		preview?.siteName ?? null,
		imageType,
		timestamp,
		tripId,
		link.id
	);
	return true;
}

export async function refreshPlanningLinkPreviews(
	db: Database.Database,
	tripId: string,
	files: PlanningFiles,
	fetcher: LinkPreviewFetcher = fetchLinkPreview,
	now: () => Date = () => new Date()
): Promise<boolean> {
	const pending = (
		db
			.prepare(
				`SELECT id, url FROM planning_card_links
				 WHERE trip_id = ? AND status = 'pending' ORDER BY rowid`
			)
			.all(tripId) as PendingLink[]
	).filter((link) => !inFlight.has(link.id));
	for (const link of pending) inFlight.add(link.id);
	let changed = false;
	try {
		for (let start = 0; start < pending.length; start += concurrency) {
			await Promise.all(
				pending.slice(start, start + concurrency).map(async (link): Promise<void> => {
					const preview = await fetcher(link.url).catch(() => null);
					if (storePreview(db, tripId, files, link, preview, now().toISOString())) changed = true;
				})
			);
		}
	} finally {
		for (const link of pending) inFlight.delete(link.id);
	}
	return changed;
}
