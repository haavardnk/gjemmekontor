import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, expect, test } from 'vitest';

import { defaultModuleIds } from '$lib/app/modules/catalog';
import { createApplicationDatabase } from '$lib/app/server/database';
import { createTrip } from '$lib/app/server/trip-settings';

import { actions } from './+page.server';

const dataDirectories: string[] = [];

afterEach((): void => {
	for (const dataDirectory of dataDirectories.splice(0)) {
		rmSync(dataDirectory, { recursive: true, force: true });
	}
});

test('refreshes the selected trip navigation after activating a module', async (): Promise<void> => {
	const dataDirectory = mkdtempSync(join(tmpdir(), 'admin-modules-'));
	dataDirectories.push(dataDirectory);
	const db = createApplicationDatabase(dataDirectory);
	const tripId = createTrip(db, {
		name: 'Testreise',
		destination: 'Teststed',
		startsOn: '2027-06-01',
		endsOn: '2027-06-02',
		timezone: 'Europe/Oslo',
		welcomeText: 'Velkommen',
		password: 'test-trip-password',
		memberIds: [],
		modules: {
			order: [...defaultModuleIds],
			enabled: ['menu'],
			mapGoogleMyMapsId: '',
			mapDefaultMode: 'normal',
			mapEnabledOverlays: [],
			mapOfflinePackages: [],
			shoppingListUuid: '',
			shoppingListName: '',
			shoppingListVerifiedAt: ''
		}
	});
	const form = new FormData();
	form.set('moduleOrder', JSON.stringify(defaultModuleIds));
	form.append('enabledModuleId', 'menu');
	form.append('enabledModuleId', 'itinerary');
	const locals: App.Locals = {
		adminAuthenticated: true,
		db,
		tripAuthenticated: true,
		trip: {
			id: tripId,
			slug: 'testreise',
			name: 'Testreise',
			enabledModuleIds: ['menu']
		}
	};

	try {
		const result = await actions.modules({
			request: new Request('http://localhost/admin/modules', { method: 'POST', body: form }),
			params: { tripId },
			locals
		} as never);

		expect(result).toEqual({ successMessage: 'Modulvalg og rekkefølge er lagret.' });
		expect(locals.trip?.enabledModuleIds).toEqual(['itinerary', 'menu']);
	} finally {
		db.close();
	}
});
