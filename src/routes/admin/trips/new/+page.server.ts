import { fail, redirect } from '@sveltejs/kit';

import { defaultModuleIds, isModuleId } from '$lib/app/modules/catalog';
import { createTrip, listPeople } from '$lib/app/server/trip-settings';
import { BringConnectionService, BringServiceError } from '$lib/modules/shopping-list/server/bring';
import { getBringCredentials } from '$lib/modules/shopping-list/server/config';
import { listShotCloneSources } from '$lib/modules/shots/server/content';

import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => ({
	people: listPeople(locals.db).filter((person) => !person.archived),
	modules: defaultModuleIds,
	shotCloneSources: listShotCloneSources(locals.db)
});

function text(form: FormData, name: string): string {
	const value = form.get(name);
	return typeof value === 'string' ? value : '';
}

function mapMode(form: FormData): 'normal' | 'nautical' | 'satellite' {
	const value = text(form, 'mapDefaultMode');
	return value === 'nautical' || value === 'satellite' ? value : 'normal';
}

export const actions = {
	default: async ({ request, locals }) => {
		const form = await request.formData();
		const enabled = form
			.getAll('enabledModuleId')
			.filter((value): value is string => typeof value === 'string')
			.filter(isModuleId);
		let tripId: string;
		try {
			const shotMode = text(form, 'shotContentMode');
			const shots =
				shotMode === 'standard'
					? ({ mode: 'standard' } as const)
					: shotMode === 'clone'
						? ({ mode: 'clone', sourceTripId: text(form, 'shotSourceTripId') } as const)
						: ({ mode: 'blank' } as const);
			const shoppingConnection = enabled.includes('shopping-list')
				? await new BringConnectionService(getBringCredentials()).verify(
						text(form, 'shoppingListUuid')
					)
				: undefined;
			tripId = createTrip(locals.db, {
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
				shots,
				modules: {
					order: [...defaultModuleIds],
					enabled,
					mapGoogleMyMapsId: text(form, 'mapGoogleMyMapsId'),
					mapDefaultMode: mapMode(form),
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
			if (error instanceof BringServiceError) {
				const messages = {
					BRING_NOT_CONFIGURED: 'Bring-legitimasjon mangler på serveren.',
					BRING_AUTH_FAILED: 'Bring-legitimasjonen ble avvist.',
					BRING_LIST_NOT_FOUND: 'Bring-listen finnes ikke eller kontoen har ikke tilgang.',
					BRING_LIST_NAME_CONFLICT: 'Det finnes allerede en Bring-liste med dette navnet.',
					BRING_LIST_CREATE_FAILED: 'Bring klarte ikke å opprette listen.',
					BRING_UNAVAILABLE: 'Bring er ikke tilgjengelig akkurat nå.',
					BRING_MUTATION_FAILED: 'Bring lagret ikke endringen.'
				};
				return fail(400, { errorMessage: messages[error.code] });
			}
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
