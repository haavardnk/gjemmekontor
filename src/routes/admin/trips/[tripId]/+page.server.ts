import { error, fail, redirect } from '@sveltejs/kit';

import { isModuleId } from '$lib/app/modules/catalog';
import { getDatabase } from '$lib/app/server/database';
import {
	activateTrip,
	addPersonToTrip,
	archiveTrip,
	getTripSettings,
	removePersonFromTrip,
	setTripModules,
	setTripPassword,
	setTripVisibility,
	tripReadiness,
	unarchiveTrip,
	updateTripGeneral
} from '$lib/app/server/trip-settings';

import type { Actions, PageServerLoad } from './$types';

function settings(tripId: string) {
	const value = getTripSettings(getDatabase(), tripId);
	if (!value) error(404, 'TRIP_NOT_FOUND');
	return value;
}

function text(form: FormData, name: string): string {
	const value = form.get(name);
	return typeof value === 'string' ? value : '';
}

function actionError(cause: unknown, fallback: string) {
	return fail(400, { errorMessage: cause instanceof Error ? fallback : fallback });
}

export const load: PageServerLoad = ({ params }) => {
	const trip = settings(params.tripId);
	return { settings: trip, readiness: tripReadiness(getDatabase(), trip.id) };
};

export const actions = {
	general: async ({ request, params }) => {
		const form = await request.formData();
		try {
			updateTripGeneral(getDatabase(), params.tripId, {
				name: text(form, 'name'),
				destination: text(form, 'destination'),
				startsOn: text(form, 'startsOn'),
				endsOn: text(form, 'endsOn'),
				timezone: text(form, 'timezone'),
				welcomeText: text(form, 'welcomeText')
			});
			return { successMessage: 'Grunninnstillingene er lagret.' };
		} catch (cause) {
			return actionError(cause, 'Kontroller grunninnstillingene og prøv igjen.');
		}
	},
	password: async ({ request, params }) => {
		const form = await request.formData();
		try {
			setTripPassword(getDatabase(), params.tripId, text(form, 'password'));
			return { successMessage: 'Reisepassordet er erstattet. Gamle innlogginger er utløpt.' };
		} catch (cause) {
			return actionError(cause, 'Passordet må ha minst åtte tegn.');
		}
	},
	modules: async ({ request, params }) => {
		const form = await request.formData();
		try {
			const parsedOrder = JSON.parse(text(form, 'moduleOrder')) as unknown;
			if (!Array.isArray(parsedOrder) || !parsedOrder.every((id) => typeof id === 'string')) {
				throw new Error('INVALID_MODULE_ORDER');
			}
			setTripModules(getDatabase(), params.tripId, {
				order: parsedOrder.filter(isModuleId),
				enabled: form
					.getAll('enabledModuleId')
					.filter((value): value is string => typeof value === 'string')
					.filter(isModuleId),
				mapGoogleMyMapsId: text(form, 'mapGoogleMyMapsId'),
				shoppingListUuid: text(form, 'shoppingListUuid')
			});
			return { successMessage: 'Modulvalg og rekkefølge er lagret.' };
		} catch (cause) {
			return actionError(cause, 'Kunne ikke lagre modulinnstillingene.');
		}
	},
	addExistingMember: async ({ request, params }) => {
		const form = await request.formData();
		try {
			addPersonToTrip(getDatabase(), params.tripId, { personId: text(form, 'personId') });
			return { successMessage: 'Personen er lagt til på reisen.' };
		} catch (cause) {
			return actionError(cause, 'Kunne ikke legge til personen.');
		}
	},
	addNewMember: async ({ request, params }) => {
		const form = await request.formData();
		try {
			addPersonToTrip(getDatabase(), params.tripId, { displayName: text(form, 'displayName') });
			return { successMessage: 'Personen er opprettet og lagt til.' };
		} catch (cause) {
			return actionError(cause, 'Skriv inn et gyldig navn.');
		}
	},
	removeMember: async ({ request, params }) => {
		const form = await request.formData();
		try {
			removePersonFromTrip(getDatabase(), params.tripId, text(form, 'personId'));
			return { successMessage: 'Personen er fjernet fra reisen, men finnes fortsatt i databasen.' };
		} catch (cause) {
			return actionError(cause, 'Kunne ikke fjerne personen.');
		}
	},
	visibility: async ({ request, params }) => {
		const form = await request.formData();
		const visibility = text(form, 'visibility');
		if (visibility !== 'listed' && visibility !== 'unlisted') {
			return fail(400, { errorMessage: 'Ugyldig synlighet.' });
		}
		setTripVisibility(getDatabase(), params.tripId, visibility);
		return { successMessage: 'Synligheten er lagret.' };
	},
	activate: ({ params }) => {
		const readiness = activateTrip(getDatabase(), params.tripId);
		if (!readiness.ready) {
			return fail(409, { errorMessage: readiness.issues.join(' ') });
		}
		return { successMessage: 'Reisen er aktiv og klar for innlogging.' };
	},
	archive: ({ params }) => {
		archiveTrip(getDatabase(), params.tripId);
		redirect(303, '/admin/trips');
	},
	unarchive: ({ params }) => {
		unarchiveTrip(getDatabase(), params.tripId);
		return { successMessage: 'Reisen er hentet tilbake fra arkivet.' };
	}
} satisfies Actions;
