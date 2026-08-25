import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { createApplicationDatabase } from '$lib/app/server/database';

import { handleGetGpx, handlePutGpx } from './gpx';

const uploadId = '019d0d25-8ea0-7000-8000-000000000001';
const legKey = 'logbook:d0:leg:019d0d25-8ea0-7000-8000-000000000002';
const xml = `<?xml version="1.0"?><gpx creator="test" version="1.1" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>Tur</name><trkseg><trkpt lat="43" lon="16"><time>2026-09-05T08:00:00Z</time></trkpt><trkpt lat="43.01" lon="16"><time>2026-09-05T08:00:20Z</time></trkpt></trkseg></trk></gpx>`;

let dataDir = '';
let db: ReturnType<typeof createApplicationDatabase>;

beforeEach((): void => {
	dataDir = mkdtempSync(join(tmpdir(), 'gjemmekontor-gpx-'));
	db = createApplicationDatabase(dataDir);
});

afterEach((): void => {
	db.close();
	rmSync(dataDir, { recursive: true, force: true });
});

function uploadRequest(body = xml): Request {
	const query = new URLSearchParams({ legKey, filename: 'orca.gpx', clientId: 'client-a' });
	return new Request(`http://localhost/api/logbook/gpx/${uploadId}?${query}`, {
		method: 'PUT',
		headers: { 'content-type': 'application/gpx+xml' },
		body
	});
}

describe('GPX archive', (): void => {
	test('stores and retrieves the exact original bytes', async (): Promise<void> => {
		const uploaded = await handlePutGpx(
			uploadRequest(),
			uploadId,
			db,
			() => new Date('2026-09-05T09:00:00Z')
		);
		expect(uploaded.status).toBe(201);
		expect(await uploaded.json()).toMatchObject({
			id: uploadId,
			legKey,
			filename: 'orca.gpx',
			byteSize: new TextEncoder().encode(xml).byteLength,
			parserVersion: 1,
			extraction: { name: 'Tur', originalPointCount: 2 }
		});

		const retrieved = handleGetGpx(uploadId, db);
		expect(retrieved.status).toBe(200);
		expect(retrieved.headers.get('content-type')).toBe('application/gpx+xml');
		expect(retrieved.headers.get('cache-control')).toBe('no-store');
		expect(await retrieved.text()).toBe(xml);
	});

	test('makes retries idempotent and rejects changed bytes', async (): Promise<void> => {
		expect((await handlePutGpx(uploadRequest(), uploadId, db)).status).toBe(201);
		expect((await handlePutGpx(uploadRequest(), uploadId, db)).status).toBe(200);
		const conflict = await handlePutGpx(uploadRequest(xml.replace('43.01', '43.02')), uploadId, db);
		expect(conflict.status).toBe(409);
		expect(await conflict.json()).toEqual({ error: 'GPX_UPLOAD_CONFLICT' });
	});

	test('rejects malformed metadata and all-stationary files', async (): Promise<void> => {
		const invalidId = await handlePutGpx(uploadRequest(), 'bad-id', db);
		expect(invalidId.status).toBe(400);
		const stationary = xml.replace('43.01', '43');
		const invalidTrack = await handlePutGpx(uploadRequest(stationary), uploadId, db);
		expect(invalidTrack.status).toBe(400);
		expect(await invalidTrack.json()).toEqual({ error: 'GPX_MOVEMENT_REQUIRED' });
		const malformed = await handlePutGpx(uploadRequest(xml.slice(0, -8)), uploadId, db);
		expect(malformed.status).toBe(400);
	});
});
