import { createHash } from 'node:crypto';

import { DOMParser, onErrorStopParsing } from '@xmldom/xmldom';
import type Database from 'better-sqlite3';
import { z } from 'zod';

import { apiError, apiSuccess } from '$lib/server/api';
import {
	extractGpxXml,
	type GpxExtraction,
	gpxExtractionVersion,
	gpxMaximumBytes
} from '$lib/trip/gpx';

const uploadIdSchema = z.uuid();
const legKeySchema = z.string().regex(/^logbook:d(?:[0-9]|1[0-8]):leg:[A-Za-z0-9-]+$/);
const filenameSchema = z.string().min(1).max(200);
const clientIdSchema = z.string().min(1).max(200);

type StoredGpx = {
	id: string;
	leg_key: string;
	filename: string;
	content_type: string;
	checksum: string;
	byte_size: number;
	parser_version: number;
	extraction: string;
	original: Buffer;
	client_id: string;
	created_at: string;
};

export type GpxUploadResponse = {
	id: string;
	legKey: string;
	filename: string;
	checksum: string;
	byteSize: number;
	parserVersion: number;
	extraction: GpxExtraction;
	createdAt: string;
};

function responseBody(row: StoredGpx): GpxUploadResponse {
	return {
		id: row.id,
		legKey: row.leg_key,
		filename: row.filename,
		checksum: row.checksum,
		byteSize: row.byte_size,
		parserVersion: row.parser_version,
		extraction: JSON.parse(row.extraction) as GpxExtraction,
		createdAt: row.created_at
	};
}

function storedGpx(db: Database.Database, id: string): StoredGpx | undefined {
	return db.prepare('SELECT * FROM gpx_uploads WHERE id = ?').get(id) as StoredGpx | undefined;
}

function noStore(response: Response): Response {
	response.headers.set('Cache-Control', 'no-store');
	return response;
}

export async function handlePutGpx(
	request: Request,
	id: string,
	db: Database.Database,
	now: () => Date = (): Date => new Date()
): Promise<Response> {
	if (!uploadIdSchema.safeParse(id).success) {
		return noStore(apiError('GPX_ID_INVALID', 400));
	}
	const url = new URL(request.url);
	const legKey = legKeySchema.safeParse(url.searchParams.get('legKey'));
	const filename = filenameSchema.safeParse(url.searchParams.get('filename'));
	const clientId = clientIdSchema.safeParse(url.searchParams.get('clientId'));
	if (!legKey.success || !filename.success || !clientId.success) {
		return noStore(apiError('GPX_METADATA_INVALID', 400));
	}
	if (request.headers.get('content-type')?.split(';')[0] !== 'application/gpx+xml') {
		return noStore(apiError('GPX_CONTENT_TYPE_INVALID', 415));
	}
	const declaredSize = Number(request.headers.get('content-length'));
	if (Number.isFinite(declaredSize) && declaredSize > gpxMaximumBytes) {
		return noStore(apiError('GPX_TOO_LARGE', 413));
	}
	const bytes = new Uint8Array(await request.arrayBuffer());
	if (bytes.byteLength === 0) {
		return noStore(apiError('GPX_EMPTY', 400));
	}
	if (bytes.byteLength > gpxMaximumBytes) {
		return noStore(apiError('GPX_TOO_LARGE', 413));
	}
	const checksum = createHash('sha256').update(bytes).digest('hex');
	const existing = storedGpx(db, id);
	if (existing) {
		return noStore(
			existing.checksum === checksum
				? apiSuccess(responseBody(existing))
				: apiError('GPX_UPLOAD_CONFLICT', 409)
		);
	}
	let xml: string;
	let extraction: GpxExtraction;
	try {
		xml = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
		extraction = extractGpxXml(xml, (value) =>
			new DOMParser({ onError: onErrorStopParsing }).parseFromString(value, 'text/xml')
		);
	} catch (error) {
		const code =
			error instanceof Error && error.message.startsWith('GPX_') ? error.message : 'GPX_INVALID';
		return noStore(apiError(code, 400));
	}
	const createdAt = now().toISOString();
	db.prepare(
		`INSERT INTO gpx_uploads (
			id, leg_key, filename, content_type, checksum, byte_size, parser_version,
			extraction, original, client_id, created_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
	).run(
		id,
		legKey.data,
		filename.data,
		'application/gpx+xml',
		checksum,
		bytes.byteLength,
		gpxExtractionVersion,
		JSON.stringify(extraction),
		Buffer.from(bytes),
		clientId.data,
		createdAt
	);
	const row = storedGpx(db, id);
	if (!row) {
		return noStore(apiError('GPX_ARCHIVE_FAILED', 500));
	}
	return noStore(apiSuccess(responseBody(row), 201));
}

export function handleGetGpx(id: string, db: Database.Database): Response {
	if (!uploadIdSchema.safeParse(id).success) {
		return noStore(apiError('GPX_ID_INVALID', 400));
	}
	const row = storedGpx(db, id);
	if (!row) {
		return noStore(apiError('GPX_NOT_FOUND', 404));
	}
	return new Response(new Uint8Array(row.original), {
		headers: {
			'Cache-Control': 'no-store',
			'Content-Type': row.content_type,
			'Content-Length': String(row.byte_size),
			'X-Content-SHA256': row.checksum,
			'X-GPX-Filename': encodeURIComponent(row.filename)
		}
	});
}
