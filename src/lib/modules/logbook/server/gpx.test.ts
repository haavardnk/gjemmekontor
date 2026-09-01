import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { defaultModuleIds } from '$lib/app/modules/catalog';
import { createApplicationDatabase } from '$lib/app/server/database';
import { createTrip } from '$lib/app/server/trip-settings';

import { handleGetGpx, handlePutGpx } from './gpx';

const uploadId = '019d0d25-8ea0-7000-8000-000000000001';
const xml = `<?xml version="1.0"?><gpx creator="test" version="1.1" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>Tur</name><trkseg><trkpt lat="43" lon="16"><time>2027-06-01T08:00:00Z</time></trkpt><trkpt lat="43.01" lon="16"><time>2027-06-01T08:00:20Z</time></trkpt></trkseg></trk></gpx>`;

let dataDir = '';
let db: ReturnType<typeof createApplicationDatabase>;
let tripId = '';
let legKey = '';

beforeEach((): void => {
	dataDir = mkdtempSync(join(tmpdir(), 'gjemmekontor-gpx-'));
	db = createApplicationDatabase(dataDir);
	tripId = testTrip('GPX test');
	const day = db
		.prepare('SELECT id FROM trip_days WHERE trip_id = ? AND position = 0')
		.get(tripId) as { id: string };
	legKey = `logbook:day:${day.id}:leg:019d0d25-8ea0-7000-8000-000000000002`;
});

afterEach((): void => {
	db.close();
	rmSync(dataDir, { recursive: true, force: true });
});

function uploadRequest(body = xml, selectedLegKey = legKey): Request {
	const query = new URLSearchParams({
		legKey: selectedLegKey,
		filename: 'orca.gpx',
		clientId: 'client-a'
	});
	return new Request(`http://localhost/api/logbook/gpx/${uploadId}?${query}`, {
		method: 'PUT',
		headers: { 'content-type': 'application/gpx+xml' },
		body
	});
}

function testTrip(name: string): string {
	return createTrip(db, {
		name,
		destination: '',
		startsOn: '2027-06-01',
		endsOn: '2027-06-19',
		timezone: 'Europe/Oslo',
		welcomeText: 'Velkommen om bord',
		password: 'shared-trip-password',
		memberIds: [],
		modules: {
			order: [...defaultModuleIds],
			enabled: ['logbook'],
			mapGoogleMyMapsId: '',
			mapDefaultMode: 'normal',
			mapEnabledOverlays: [],
			mapOfflinePackages: [],
			shoppingListUuid: '',
			shoppingListName: '',
			shoppingListVerifiedAt: ''
		}
	});
}

describe('GPX archive', (): void => {
	test('stores and retrieves the exact original bytes', async (): Promise<void> => {
		const uploaded = await handlePutGpx(
			uploadRequest(),
			uploadId,
			db,
			tripId,
			() => new Date('2027-06-01T09:00:00Z')
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

		const retrieved = handleGetGpx(uploadId, db, tripId);
		expect(retrieved.status).toBe(200);
		expect(retrieved.headers.get('content-type')).toBe('application/gpx+xml');
		expect(retrieved.headers.get('cache-control')).toBe('no-store');
		expect(await retrieved.text()).toBe(xml);
	});

	test('makes retries idempotent and rejects changed bytes', async (): Promise<void> => {
		expect((await handlePutGpx(uploadRequest(), uploadId, db, tripId)).status).toBe(201);
		expect((await handlePutGpx(uploadRequest(), uploadId, db, tripId)).status).toBe(200);
		const conflict = await handlePutGpx(
			uploadRequest(xml.replace('43.01', '43.02')),
			uploadId,
			db,
			tripId
		);
		expect(conflict.status).toBe(409);
		expect(await conflict.json()).toEqual({ error: 'GPX_UPLOAD_CONFLICT' });
	});

	test('rejects malformed metadata and all-stationary files', async (): Promise<void> => {
		const invalidId = await handlePutGpx(uploadRequest(), 'bad-id', db, tripId);
		expect(invalidId.status).toBe(400);
		const stationary = xml.replace('43.01', '43');
		const invalidTrack = await handlePutGpx(uploadRequest(stationary), uploadId, db, tripId);
		expect(invalidTrack.status).toBe(400);
		expect(await invalidTrack.json()).toEqual({ error: 'GPX_MOVEMENT_REQUIRED' });
		const malformed = await handlePutGpx(uploadRequest(xml.slice(0, -8)), uploadId, db, tripId);
		expect(malformed.status).toBe(400);
	});

	test('isolates upload IDs, bytes, and trip-day relationships by trip', async (): Promise<void> => {
		const otherTripId = testTrip('Annen GPX test');
		const otherDay = db
			.prepare('SELECT id FROM trip_days WHERE trip_id = ? AND position = 0')
			.get(otherTripId) as { id: string };
		const otherLegKey = `logbook:day:${otherDay.id}:leg:019d0d25-8ea0-7000-8000-000000000002`;
		expect((await handlePutGpx(uploadRequest(), uploadId, db, tripId)).status).toBe(201);

		expect(handleGetGpx(uploadId, db, otherTripId).status).toBe(404);
		expect(
			(await handlePutGpx(uploadRequest(xml, otherLegKey), uploadId, db, otherTripId)).status
		).toBe(409);
		const stored = db
			.prepare(
				`SELECT u.trip_id, d.trip_id AS day_trip_id, d.position, u.checksum, hex(u.original) AS original
				 FROM trip_gpx_uploads u JOIN trip_days d ON d.id = u.trip_day_id WHERE u.id = ?`
			)
			.get(uploadId) as {
			trip_id: string;
			day_trip_id: string;
			position: number;
			checksum: string;
			original: string;
		};
		expect(stored).toMatchObject({
			trip_id: tripId,
			day_trip_id: tripId,
			position: 0,
			original: Buffer.from(xml).toString('hex').toUpperCase()
		});
	});

	test('rejects a leg key outside the current trip calendar', async (): Promise<void> => {
		const query = new URLSearchParams({
			legKey: `logbook:day:${crypto.randomUUID()}:leg:019d0d25-8ea0-7000-8000-000000000002`,
			filename: 'orca.gpx',
			clientId: 'client-a'
		});
		const invalidDayRequest = new Request(`http://localhost/api/logbook/gpx/${uploadId}?${query}`, {
			method: 'PUT',
			headers: { 'content-type': 'application/gpx+xml' },
			body: xml
		});
		const response = await handlePutGpx(invalidDayRequest, uploadId, db, tripId);

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error: 'GPX_TRIP_DAY_INVALID' });
	});
});
