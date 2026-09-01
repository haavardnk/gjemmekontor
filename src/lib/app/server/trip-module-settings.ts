import { randomUUID } from 'node:crypto';

import type Database from 'better-sqlite3';
import { z } from 'zod';

import { env } from '$env/dynamic/private';
import { isModuleId, moduleCatalog, type ModuleId } from '$lib/app/modules/catalog';
import type { MapMode } from '$lib/modules/map/domain/types';
import {
	type MapOverlay,
	mapOverlayValues,
	parseMapRuntimeConfig
} from '$lib/modules/map/server/config';
import { getBringCredentials } from '$lib/modules/shopping-list/server/config';

import { auditTrip, nowIso } from './trip-settings-internal';

export type ModuleSettingsInput = {
	order: ModuleId[];
	enabled: ModuleId[];
	mapGoogleMyMapsId: string;
	mapDefaultMode: MapMode;
	mapEnabledOverlays: MapOverlay[];
	mapOfflinePackages: MapMode[];
	shoppingListUuid: string;
	shoppingListName: string;
	shoppingListVerifiedAt: string;
};

export type MapSettingsInput = Pick<
	ModuleSettingsInput,
	'mapGoogleMyMapsId' | 'mapDefaultMode' | 'mapEnabledOverlays' | 'mapOfflinePackages'
>;

export type TripReadiness = {
	ready: boolean;
	issues: string[];
};

const mapSettingsSchema = z
	.object({
		mapGoogleMyMapsId: z.string().transform((value) => value.trim()),
		mapDefaultMode: z.enum(['normal', 'nautical', 'satellite']),
		mapEnabledOverlays: z.array(z.enum(mapOverlayValues)),
		mapOfflinePackages: z.array(z.enum(['normal', 'nautical', 'satellite']))
	})
	.strict()
	.refine(
		(value) =>
			new Set(value.mapEnabledOverlays).size === value.mapEnabledOverlays.length &&
			new Set(value.mapOfflinePackages).size === value.mapOfflinePackages.length,
		{ message: 'INVALID_MAP_CONFIGURATION' }
	);

const shoppingListConnectionSchema = z
	.object({
		listUuid: z.string().trim().min(1).max(100),
		listName: z.string().trim().min(1).max(100),
		verifiedAt: z.iso.datetime().optional()
	})
	.strict();

function parseModuleOrder(value: readonly string[]): ModuleId[] {
	if (value.length !== moduleCatalog.length || new Set(value).size !== moduleCatalog.length) {
		throw new Error('INVALID_MODULE_ORDER');
	}
	if (!value.every(isModuleId) || moduleCatalog.some((module) => !value.includes(module.id))) {
		throw new Error('INVALID_MODULE_ORDER');
	}
	return [...value] as ModuleId[];
}

function parseMapSettings(input: MapSettingsInput): MapSettingsInput {
	return mapSettingsSchema.parse({
		mapGoogleMyMapsId: input.mapGoogleMyMapsId,
		mapDefaultMode: input.mapDefaultMode,
		mapEnabledOverlays: input.mapEnabledOverlays,
		mapOfflinePackages: input.mapOfflinePackages
	});
}

export function mapConfig(input: MapSettingsInput): Record<string, unknown> {
	const parsed = parseMapSettings(input);
	return {
		...(parsed.mapGoogleMyMapsId ? { googleMyMapsId: parsed.mapGoogleMyMapsId } : {}),
		defaultMode: parsed.mapDefaultMode,
		enabledOverlays: parsed.mapEnabledOverlays,
		offlinePackages: parsed.mapOfflinePackages
	};
}

export function normalizedModuleInput(input: ModuleSettingsInput): ModuleSettingsInput {
	const order = parseModuleOrder(input.order);
	const enabled = input.enabled.filter(isModuleId);
	if (new Set(enabled).size !== enabled.length) throw new Error('INVALID_ENABLED_MODULES');
	const map = parseMapSettings(input);
	return {
		order,
		enabled,
		...map,
		shoppingListUuid: input.shoppingListUuid.trim(),
		shoppingListName: input.shoppingListName.trim(),
		shoppingListVerifiedAt: input.shoppingListVerifiedAt.trim()
	};
}

export function moduleConfig(
	moduleId: ModuleId,
	input: ModuleSettingsInput
): Record<string, unknown> {
	if (moduleId === 'map') return mapConfig(input);
	if (moduleId === 'shopping-list') {
		return input.shoppingListUuid
			? {
					listUuid: input.shoppingListUuid,
					listName: input.shoppingListName,
					providerStatus: 'verified',
					verifiedAt: input.shoppingListVerifiedAt || nowIso()
				}
			: {};
	}
	return {};
}

export function tripReadiness(db: Database.Database, tripId: string): TripReadiness {
	const issues: string[] = [];
	const trip = db.prepare('SELECT starts_on, ends_on FROM trips WHERE id = ?').get(tripId) as
		{ starts_on: string | null; ends_on: string | null } | undefined;
	if (!trip) throw new Error('TRIP_NOT_FOUND');
	if (!trip.starts_on || !trip.ends_on) issues.push('Angi fra- og til-dato.');
	if (!db.prepare('SELECT 1 FROM trip_credentials WHERE trip_id = ?').get(tripId)) {
		issues.push('Angi et reisepassord.');
	}
	const modules = db
		.prepare(
			`SELECT module_id, config_json FROM trip_modules
			 WHERE trip_id = ? AND enabled = 1 ORDER BY position`
		)
		.all(tripId) as Array<{ module_id: string; config_json: string }>;
	if (modules.length === 0) issues.push('Aktiver minst én modul.');
	for (const module of modules) {
		const config = JSON.parse(module.config_json) as Record<string, unknown>;
		if (module.module_id === 'map' && !config.googleMyMapsId) {
			issues.push('Kart trenger en Google My Maps-ID.');
		}
		if (
			module.module_id === 'map' &&
			Array.isArray(config.enabledOverlays) &&
			config.enabledOverlays.includes('ais') &&
			!parseMapRuntimeConfig(env, '.').aisStreamApiKey
		) {
			issues.push('AIS-overlegget trenger AISSTREAM_API_KEY.');
		}
		if (
			module.module_id === 'shopping-list' &&
			(!config.listUuid || config.providerStatus !== 'verified')
		) {
			issues.push('Handleliste trenger en verifisert Bring-liste.');
		}
		if (module.module_id === 'shopping-list' && !getBringCredentials()) {
			issues.push('Handleliste trenger BRING_EMAIL og BRING_PASSWORD.');
		}
	}
	return { ready: issues.length === 0, issues };
}

function writeTripModuleConfig(
	db: Database.Database,
	tripId: string,
	moduleId: ModuleId,
	config: Record<string, unknown>,
	event: { type: string; metadata?: Record<string, unknown>; checkReadiness?: boolean }
): void {
	const configJson = JSON.stringify(config);
	const current = db
		.prepare(
			`SELECT config_version, config_json FROM trip_modules
			 WHERE trip_id = ? AND module_id = ?`
		)
		.get(tripId, moduleId) as { config_version: number; config_json: string } | undefined;
	if (!current) throw new Error('TRIP_NOT_FOUND');
	if (current.config_json === configJson) return;

	const now = nowIso();
	const version = current.config_version + 1;
	db.prepare(
		`UPDATE trip_modules SET config_version = ?, config_json = ?, configured_at = ?, updated_at = ?
		 WHERE trip_id = ? AND module_id = ?`
	).run(version, configJson, now, now, tripId, moduleId);
	db.prepare(
		`INSERT INTO trip_module_config_history
		 (id, trip_id, module_id, config_version, config_json, changed_at, changed_by_session)
		 VALUES (?, ?, ?, ?, ?, ?, NULL)`
	).run(randomUUID(), tripId, moduleId, version, configJson, now);
	if (event.checkReadiness && !tripReadiness(db, tripId).ready) {
		db.prepare("UPDATE trips SET status = 'draft', updated_at = ? WHERE id = ?").run(now, tripId);
		db.prepare('DELETE FROM session_trip_grants WHERE trip_id = ?').run(tripId);
	}
	auditTrip(db, tripId, event.type, event.metadata);
}

export function setTripModules(
	db: Database.Database,
	tripId: string,
	input: ModuleSettingsInput
): void {
	const modules = normalizedModuleInput(input);
	const now = nowIso();
	db.transaction((): void => {
		const existing = db
			.prepare(
				`SELECT module_id, enabled, config_version, config_json, configured_at
				 FROM trip_modules WHERE trip_id = ?`
			)
			.all(tripId) as Array<{
			module_id: ModuleId;
			enabled: number;
			config_version: number;
			config_json: string;
			configured_at: string;
		}>;
		if (existing.length !== moduleCatalog.length) throw new Error('TRIP_MODULES_INCOMPLETE');
		const byId = new Map(existing.map((module) => [module.module_id, module]));
		db.prepare('UPDATE trip_modules SET position = position + 10000 WHERE trip_id = ?').run(tripId);
		const update = db.prepare(
			`UPDATE trip_modules SET enabled = ?, position = ?, config_version = ?,
			 config_json = ?, configured_at = ?, updated_at = ?
			 WHERE trip_id = ? AND module_id = ?`
		);
		const insertHistory = db.prepare(
			`INSERT INTO trip_module_config_history
			 (id, trip_id, module_id, config_version, config_json, changed_at, changed_by_session)
			 VALUES (?, ?, ?, ?, ?, ?, NULL)`
		);
		for (const [position, moduleId] of modules.order.entries()) {
			const previous = byId.get(moduleId);
			if (!previous) throw new Error('TRIP_MODULES_INCOMPLETE');
			const configJson = JSON.stringify(moduleConfig(moduleId, modules));
			const configChanged = configJson !== previous.config_json;
			const configVersion = previous.config_version + (configChanged ? 1 : 0);
			update.run(
				modules.enabled.includes(moduleId) ? 1 : 0,
				position,
				configVersion,
				configJson,
				configChanged ? now : previous.configured_at,
				now,
				tripId,
				moduleId
			);
			if (configChanged) {
				insertHistory.run(randomUUID(), tripId, moduleId, configVersion, configJson, now);
			}
		}
		if (!tripReadiness(db, tripId).ready) {
			db.prepare("UPDATE trips SET status = 'draft', updated_at = ? WHERE id = ?").run(now, tripId);
			db.prepare('DELETE FROM session_trip_grants WHERE trip_id = ?').run(tripId);
		}
		auditTrip(db, tripId, 'trip.modules.updated', {
			order: modules.order,
			enabled: modules.enabled
		});
	})();
}

export function setTripMapConfiguration(
	db: Database.Database,
	tripId: string,
	input: MapSettingsInput
): void {
	db.transaction(() =>
		writeTripModuleConfig(db, tripId, 'map', mapConfig(input), {
			type: 'trip.map.updated',
			checkReadiness: true
		})
	)();
}

export function setTripShoppingListConnection(
	db: Database.Database,
	tripId: string,
	connection: { listUuid: string; listName: string; verifiedAt?: string }
): void {
	const parsed = shoppingListConnectionSchema.parse(connection);
	const now = nowIso();
	const config = {
		listUuid: parsed.listUuid,
		listName: parsed.listName,
		providerStatus: 'verified',
		verifiedAt: parsed.verifiedAt ?? now
	};
	db.transaction(() =>
		writeTripModuleConfig(db, tripId, 'shopping-list', config, {
			type: 'trip.shopping-list.connected',
			metadata: { listUuid: parsed.listUuid, listName: parsed.listName }
		})
	)();
}
