import { error, fail, redirect } from '@sveltejs/kit';

import { isModuleId } from '$lib/app/modules/catalog';
import { getDatabase } from '$lib/app/server/database';
import {
	activateTrip,
	addPersonToTrip,
	archiveTrip,
	getTripSettings,
	removePersonFromTrip,
	setTripMapConfiguration,
	setTripModules,
	setTripPassword,
	setTripShoppingListConnection,
	setTripVisibility,
	tripReadiness,
	unarchiveTrip,
	updateTripGeneral
} from '$lib/app/server/trip-settings';
import { handleRefreshMap } from '$lib/modules/map/server';
import { getMapRuntimeConfig } from '$lib/modules/map/server/config';
import { BringConnectionService, BringServiceError } from '$lib/modules/shopping-list/server/bring';
import { getBringCredentials } from '$lib/modules/shopping-list/server/config';
import {
	listShotCloneSources,
	loadTripShotContent,
	replaceTripShotContent
} from '$lib/modules/shots/server/content';

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

function mapMode(form: FormData): 'normal' | 'nautical' | 'satellite' {
	const value = text(form, 'mapDefaultMode');
	return value === 'nautical' || value === 'satellite' ? value : 'normal';
}

function actionError(cause: unknown, fallback: string) {
	return fail(400, { errorMessage: cause instanceof Error ? fallback : fallback });
}

export const load: PageServerLoad = ({ params }) => {
	const trip = settings(params.tripId);
	const db = getDatabase();
	const mapRuntime = getMapRuntimeConfig();
	const mapModule = trip.modules.find((module) => module.id === 'map');
	const shoppingModule = trip.modules.find((module) => module.id === 'shopping-list');
	const shotsModule = trip.modules.find((module) => module.id === 'shots');
	const shotContent = loadTripShotContent(db, trip.id);
	return {
		settings: trip,
		readiness: tripReadiness(db, trip.id),
		mapSummary: {
			enabled: mapModule?.enabled === true,
			configured: typeof mapModule?.config.googleMyMapsId === 'string',
			aisProviderConfigured: Boolean(mapRuntime.aisStreamApiKey),
			googlePlacesConfigured: Boolean(
				mapRuntime.googlePlacesServerApiKey && mapRuntime.googlePlacesUiKitApiKey
			),
			tripadvisorConfigured: Boolean(mapRuntime.tripadvisorTerraApiKey),
			mappings: (
				db
					.prepare('SELECT COUNT(*) AS count FROM trip_poi_provider_mappings WHERE trip_id = ?')
					.get(trip.id) as { count: number }
			).count,
			enrichments: (
				db
					.prepare('SELECT COUNT(*) AS count FROM trip_poi_enrichment_cache WHERE trip_id = ?')
					.get(trip.id) as { count: number }
			).count
		},
		bringSummary: {
			enabled: shoppingModule?.enabled === true,
			credentialsConfigured: Boolean(getBringCredentials()),
			listUuid:
				typeof shoppingModule?.config.listUuid === 'string'
					? shoppingModule.config.listUuid
					: undefined,
			listName:
				typeof shoppingModule?.config.listName === 'string'
					? shoppingModule.config.listName
					: undefined,
			providerStatus:
				shoppingModule?.config.providerStatus === 'verified' ? 'verified' : 'unconfigured',
			verifiedAt:
				typeof shoppingModule?.config.verifiedAt === 'string'
					? shoppingModule.config.verifiedAt
					: undefined
		},
		shotsSummary: {
			enabled: shotsModule?.enabled === true,
			packName: shotContent.name,
			version: shotContent.version,
			contentJson: JSON.stringify(shotContent.content, null, 2),
			cloneSources: listShotCloneSources(db, trip.id)
		}
	};
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
			const currentModules = settings(params.tripId).modules;
			const currentMap = currentModules.find((module) => module.id === 'map')?.config ?? {};
			const currentShopping =
				currentModules.find((module) => module.id === 'shopping-list')?.config ?? {};
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
				mapGoogleMyMapsId:
					typeof currentMap.googleMyMapsId === 'string' ? currentMap.googleMyMapsId : '',
				mapDefaultMode:
					currentMap.defaultMode === 'nautical' || currentMap.defaultMode === 'satellite'
						? currentMap.defaultMode
						: 'normal',
				mapEnabledOverlays: Array.isArray(currentMap.enabledOverlays)
					? currentMap.enabledOverlays.filter(
							(value): value is 'ais' | 'depth-contours' =>
								value === 'ais' || value === 'depth-contours'
						)
					: [],
				mapOfflinePackages: Array.isArray(currentMap.offlinePackages)
					? currentMap.offlinePackages.filter(
							(value): value is 'normal' | 'nautical' | 'satellite' =>
								value === 'normal' || value === 'nautical' || value === 'satellite'
						)
					: [],
				shoppingListUuid:
					typeof currentShopping.listUuid === 'string' ? currentShopping.listUuid : '',
				shoppingListName:
					typeof currentShopping.listName === 'string' ? currentShopping.listName : '',
				shoppingListVerifiedAt:
					typeof currentShopping.verifiedAt === 'string' ? currentShopping.verifiedAt : ''
			});
			return { successMessage: 'Modulvalg og rekkefølge er lagret.' };
		} catch (cause) {
			return actionError(cause, 'Kunne ikke lagre modulinnstillingene.');
		}
	},
	map: async ({ request, params }) => {
		const form = await request.formData();
		try {
			setTripMapConfiguration(getDatabase(), params.tripId, {
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
					)
			});
			return { successMessage: 'Kartinnstillingene er lagret.' };
		} catch (cause) {
			return actionError(cause, 'Kunne ikke lagre kartinnstillingene.');
		}
	},
	connectBring: async ({ request, params }) => {
		const form = await request.formData();
		try {
			const connection = await new BringConnectionService(getBringCredentials()).verify(
				text(form, 'listUuid')
			);
			setTripShoppingListConnection(getDatabase(), params.tripId, connection);
			return { successMessage: `Bring-listen «${connection.listName}» er koblet til reisen.` };
		} catch (cause) {
			if (cause instanceof BringServiceError) {
				const messages = {
					BRING_NOT_CONFIGURED: 'Bring-legitimasjon mangler på serveren.',
					BRING_AUTH_FAILED: 'Bring-legitimasjonen ble avvist.',
					BRING_LIST_NOT_FOUND: 'Bring-listen finnes ikke eller kontoen har ikke tilgang.',
					BRING_LIST_NAME_CONFLICT: 'Det finnes allerede en Bring-liste med dette navnet.',
					BRING_LIST_CREATE_FAILED: 'Bring klarte ikke å opprette listen.',
					BRING_UNAVAILABLE: 'Bring er ikke tilgjengelig akkurat nå.',
					BRING_MUTATION_FAILED: 'Bring lagret ikke endringen.'
				};
				return fail(400, { errorMessage: messages[cause.code] });
			}
			return fail(400, { errorMessage: 'Bring-listen kunne ikke kobles til.' });
		}
	},
	createBring: async ({ params }) => {
		try {
			const trip = settings(params.tripId);
			const connection = await new BringConnectionService(getBringCredentials()).create(trip.name);
			setTripShoppingListConnection(getDatabase(), params.tripId, connection);
			return {
				successMessage: `Bring-listen «${connection.listName}» er opprettet og koblet til.`
			};
		} catch (cause) {
			if (cause instanceof BringServiceError) {
				const messages = {
					BRING_NOT_CONFIGURED: 'Bring-legitimasjon mangler på serveren.',
					BRING_AUTH_FAILED: 'Bring-legitimasjonen ble avvist.',
					BRING_LIST_NOT_FOUND: 'Bring-listen finnes ikke.',
					BRING_LIST_NAME_CONFLICT:
						'Det finnes allerede en Bring-liste med reisenavnet. Koble den til med ID i stedet.',
					BRING_LIST_CREATE_FAILED:
						'Bring klarte ikke å opprette listen. Den eksisterende koblingen er uendret.',
					BRING_UNAVAILABLE: 'Bring er ikke tilgjengelig akkurat nå.',
					BRING_MUTATION_FAILED: 'Bring lagret ikke endringen.'
				};
				return fail(400, { errorMessage: messages[cause.code] });
			}
			return fail(400, { errorMessage: 'Bring-listen kunne ikke opprettes.' });
		}
	},
	shotsBlank: ({ params }) => {
		replaceTripShotContent(getDatabase(), params.tripId, { mode: 'blank' });
		return { successMessage: 'En ny tom opptaksplan er lagret. Tidligere versjoner er bevart.' };
	},
	shotsStandard: ({ params }) => {
		replaceTripShotContent(getDatabase(), params.tripId, { mode: 'standard' });
		return { successMessage: 'Standardmalen er lagret som en ny opptaksplan.' };
	},
	shotsClone: async ({ request, params }) => {
		const form = await request.formData();
		try {
			replaceTripShotContent(getDatabase(), params.tripId, {
				mode: 'clone',
				sourceTripId: text(form, 'sourceTripId')
			});
			return {
				successMessage: 'Opptaksplanen er kopiert. Fullføring og utvalgsdata ble ikke kopiert.'
			};
		} catch {
			return fail(400, { errorMessage: 'Opptaksplanen kunne ikke kopieres.' });
		}
	},
	shotsCustom: async ({ request, params }) => {
		const form = await request.formData();
		try {
			replaceTripShotContent(getDatabase(), params.tripId, {
				mode: 'custom',
				content: JSON.parse(text(form, 'contentJson')) as unknown
			});
			return { successMessage: 'Den egendefinerte opptaksplanen er validert og lagret.' };
		} catch {
			return fail(400, {
				errorMessage: 'Opptaksplanen er ugyldig. Kontroller JSON, referanser og A-roll-indekser.'
			});
		}
	},
	refreshMap: async ({ params }) => {
		const response = await handleRefreshMap(params.tripId);
		if (!response.ok) {
			return fail(response.status, {
				errorMessage: 'Kartet kunne ikke hentes. Kontroller Google My Maps-ID-en og delingen.'
			});
		}
		return { successMessage: 'Kartforbindelsen virker, og kartet er oppdatert.' };
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
