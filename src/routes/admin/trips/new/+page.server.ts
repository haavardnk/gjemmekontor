import { fail, redirect } from '@sveltejs/kit';

import { defaultModuleIds, isModuleId } from '$lib/app/modules/catalog';
import { getDatabase } from '$lib/app/server/database';
import { createTrip, listPeople } from '$lib/app/server/trip-settings';

import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = () => ({
	people: listPeople(getDatabase()).filter((person) => !person.archived),
	modules: defaultModuleIds
});

function text(form: FormData, name: string): string {
	const value = form.get(name);
	return typeof value === 'string' ? value : '';
}

export const actions = {
	default: async ({ request }) => {
		const form = await request.formData();
		const enabled = form
			.getAll('enabledModuleId')
			.filter((value): value is string => typeof value === 'string')
			.filter(isModuleId);
		let tripId: string;
		try {
			tripId = createTrip(getDatabase(), {
				name: text(form, 'name'),
				destination: text(form, 'destination'),
				startsOn: text(form, 'startsOn'),
				endsOn: text(form, 'endsOn'),
				timezone: text(form, 'timezone'),
				welcomeText: text(form, 'welcomeText'),
				password: text(form, 'password'),
				memberIds: form
					.getAll('memberId')
					.filter((value): value is string => typeof value === 'string'),
				modules: {
					order: [...defaultModuleIds],
					enabled,
					mapGoogleMyMapsId: text(form, 'mapGoogleMyMapsId'),
					shoppingListUuid: text(form, 'shoppingListUuid')
				}
			});
		} catch (error) {
			return fail(400, {
				errorMessage:
					error instanceof Error && error.message.startsWith('TRIP_NOT_READY:')
						? error.message.slice('TRIP_NOT_READY:'.length).replaceAll('|', ' ')
						: 'Kontroller feltene og prøv igjen.'
			});
		}
		redirect(303, `/admin/trips/${tripId}`);
	}
} satisfies Actions;
