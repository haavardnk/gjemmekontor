import { fail, redirect } from '@sveltejs/kit';

import { defaultModuleIds, isModuleId } from '$lib/app/modules/catalog';
import { bringErrorMessage, formMapMode, formText } from '$lib/app/server/admin-form';
import { createTrip, listPeople } from '$lib/app/server/trip-settings';
import { BringConnectionService } from '$lib/modules/shopping-list/server/bring';
import { getBringCredentials } from '$lib/modules/shopping-list/server/config';
import { listShotCloneSources } from '$lib/modules/shots/server/content';

import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => ({
	people: listPeople(locals.db).filter((person) => !person.archived),
	modules: defaultModuleIds,
	shotCloneSources: listShotCloneSources(locals.db)
});

export const actions = {
	default: async ({ request, locals }) => {
		const form = await request.formData();
		const enabled = form
			.getAll('enabledModuleId')
			.filter((value): value is string => typeof value === 'string')
			.filter(isModuleId);
		let tripId: string;
		try {
			const shotMode = formText(form, 'shotContentMode');
			const shots =
				shotMode === 'standard'
					? ({ mode: 'standard' } as const)
					: shotMode === 'clone'
						? ({ mode: 'clone', sourceTripId: formText(form, 'shotSourceTripId') } as const)
						: ({ mode: 'blank' } as const);
			const shoppingConnection = enabled.includes('shopping-list')
				? await new BringConnectionService(getBringCredentials()).verify(
						formText(form, 'shoppingListUuid')
					)
				: undefined;
			tripId = createTrip(locals.db, {
				name: formText(form, 'name'),
				destination: formText(form, 'destination'),
				startsOn: formText(form, 'startsOn'),
				endsOn: formText(form, 'endsOn'),
				timezone: formText(form, 'timezone'),
				welcomeText: formText(form, 'welcomeText'),
				password: formText(form, 'password'),
				memberIds: form
					.getAll('memberId')
					.filter((value): value is string => typeof value === 'string'),
				shots,
				modules: {
					order: [...defaultModuleIds],
					enabled,
					mapGoogleMyMapsId: formText(form, 'mapGoogleMyMapsId'),
					mapDefaultMode: formMapMode(form),
					mapEnabledOverlays: form
						.getAll('mapEnabledOverlay')
						.filter(
							(value): value is 'ais' | 'depth-contours' =>
								value === 'ais' || value === 'depth-contours'
						),
					mapOfflinePackages: form
						.getAll('mapOfflinePackage')
						.filter(
							(value): value is 'normal' | 'nautical' | 'satellite' =>
								value === 'normal' || value === 'nautical' || value === 'satellite'
						),
					shoppingListUuid: shoppingConnection?.listUuid ?? '',
					shoppingListName: shoppingConnection?.listName ?? '',
					shoppingListVerifiedAt: shoppingConnection ? new Date().toISOString() : ''
				}
			});
		} catch (error) {
			const bringMessage = bringErrorMessage(error);
			if (bringMessage) return fail(400, { errorMessage: bringMessage });
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
