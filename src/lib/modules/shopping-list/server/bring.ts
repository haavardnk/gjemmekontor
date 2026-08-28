import type Database from 'better-sqlite3';
import Bring from 'bring-shopping';

import {
	type AbsoluteShoppingOperation,
	addShoppingListItemSchema,
	completeShoppingListItemSchema,
	editShoppingListItemSchema,
	type ShoppingListItem,
	type ShoppingListSnapshot,
	type ShoppingPlanningSnapshot
} from '$lib/modules/shopping-list/domain/shopping-list';
import { apiError, apiSuccess, parseJsonRequest } from '$lib/server/api';

import { type BringConfig, type BringCredentials, getBringCredentials } from './config';

type BringList = { listUuid: string; name: string };
type BringItem = { name: string; specification: string };
type BringItems = { purchase: BringItem[]; recently: BringItem[] };
type BringCatalog = {
	catalog: {
		sections: Array<{
			sectionId: string;
			items: Array<{ itemId: string; name: string }>;
		}>;
	};
};
type BringUserSettings = {
	userlistsettings: Array<{
		listUuid: string;
		usersettings: Array<{ key: string; value: string }>;
	}>;
};

export type BringClient = {
	login(): Promise<void>;
	loadLists(): Promise<{ lists: BringList[] }>;
	getItems(listUuid: string): Promise<BringItems>;
	loadCatalog(locale: string): Promise<BringCatalog>;
	getUserSettings(): Promise<BringUserSettings>;
	saveItem(listUuid: string, name: string, specification: string): Promise<string>;
	moveToRecentList(listUuid: string, name: string): Promise<string>;
	createList?(name: string): Promise<void>;
};

type BringClientFactory = (credentials: BringCredentials) => BringClient;
export type BringErrorCode =
	| 'BRING_NOT_CONFIGURED'
	| 'BRING_AUTH_FAILED'
	| 'BRING_LIST_NOT_FOUND'
	| 'BRING_LIST_NAME_CONFLICT'
	| 'BRING_LIST_CREATE_FAILED'
	| 'BRING_UNAVAILABLE'
	| 'BRING_MUTATION_FAILED';

export class BringServiceError extends Error {
	constructor(readonly code: BringErrorCode) {
		super(code);
	}
}

function defaultClientFactory(credentials: BringCredentials): BringClient {
	const client = new Bring({ mail: credentials.email, password: credentials.password });
	const internal = client as unknown as BringClient & {
		uuid?: string;
		url?: string;
		putHeaders?: Record<string, string>;
	};
	internal.createList = async (name: string): Promise<void> => {
		if (!internal.uuid || !internal.url || !internal.putHeaders) {
			throw new Error('Bring client is not authenticated');
		}
		const response = await fetch(`${internal.url}bringusers/${internal.uuid}/lists`, {
			method: 'POST',
			headers: internal.putHeaders,
			body: new URLSearchParams({
				name,
				theme: 'ch.publisheria.bring.theme.home'
			})
		});
		if (!response.ok) {
			throw new Error(`Bring list creation failed (${response.status})`);
		}
	};
	return internal;
}

function isAuthenticationError(error: unknown): boolean {
	return (
		error instanceof Error && /jwt|access token|unauthorized|\b401\b|\b403\b/i.test(error.message)
	);
}

function validUpstreamItem(
	item: BringItem,
	displayNames: Map<string, string>
): ShoppingListItem | undefined {
	const sourceName = item.name.trim();
	const name = displayNames.get(sourceName) ?? sourceName;
	const specification = item.specification.trim();
	return sourceName && sourceName.length <= 100 && name.length <= 100 && specification.length <= 120
		? { sourceName, name, specification }
		: undefined;
}

export type BringListConnection = { listUuid: string; listName: string };

export class BringConnectionService {
	constructor(
		private readonly credentials: BringCredentials | undefined,
		private readonly createClient: BringClientFactory = defaultClientFactory
	) {}

	private async authenticatedClient(): Promise<BringClient> {
		if (!this.credentials) throw new BringServiceError('BRING_NOT_CONFIGURED');
		const client = this.createClient(this.credentials);
		try {
			await client.login();
			return client;
		} catch {
			throw new BringServiceError('BRING_AUTH_FAILED');
		}
	}

	private async lists(client: BringClient): Promise<BringList[]> {
		try {
			return (await client.loadLists()).lists;
		} catch (error) {
			throw new BringServiceError(
				isAuthenticationError(error) ? 'BRING_AUTH_FAILED' : 'BRING_UNAVAILABLE'
			);
		}
	}

	async verify(listUuid: string): Promise<BringListConnection> {
		const selectedUuid = listUuid.trim();
		if (!selectedUuid) throw new BringServiceError('BRING_LIST_NOT_FOUND');
		const client = await this.authenticatedClient();
		const selected = (await this.lists(client)).find((list) => list.listUuid === selectedUuid);
		if (!selected) throw new BringServiceError('BRING_LIST_NOT_FOUND');
		return { listUuid: selected.listUuid, listName: selected.name };
	}

	async create(name: string): Promise<BringListConnection> {
		const listName = name.trim();
		if (!listName || listName.length > 100) {
			throw new BringServiceError('BRING_LIST_CREATE_FAILED');
		}
		const client = await this.authenticatedClient();
		const before = await this.lists(client);
		const normalizedName = listName.toLocaleLowerCase('nb-NO');
		if (before.some((list) => list.name.trim().toLocaleLowerCase('nb-NO') === normalizedName)) {
			throw new BringServiceError('BRING_LIST_NAME_CONFLICT');
		}
		if (!client.createList) throw new BringServiceError('BRING_LIST_CREATE_FAILED');
		try {
			await client.createList(listName);
		} catch (error) {
			throw new BringServiceError(
				isAuthenticationError(error) ? 'BRING_AUTH_FAILED' : 'BRING_LIST_CREATE_FAILED'
			);
		}
		const previousIds = new Set(before.map((list) => list.listUuid));
		for (let attempt = 0; attempt < 3; attempt += 1) {
			const created = (await this.lists(client)).filter(
				(list) =>
					!previousIds.has(list.listUuid) &&
					list.name.trim().toLocaleLowerCase('nb-NO') === normalizedName
			);
			if (created.length === 1) {
				return { listUuid: created[0].listUuid, listName: created[0].name };
			}
			if (created.length > 1) break;
		}
		throw new BringServiceError('BRING_LIST_CREATE_FAILED');
	}
}

export class BringService {
	private client: BringClient | undefined;
	private listName: string | undefined;
	private displayNames = new Map<string, string>();
	private sourceNames = new Map<string, string>();
	private listedSourceNames = new Map<string, string>();
	private itemSections = new Map<string, string>();
	private sectionRanks = new Map<string, number>();
	private loginPromise: Promise<void> | undefined;
	private mutationTail: Promise<void> = Promise.resolve();

	constructor(
		private readonly config: BringConfig | undefined,
		private readonly createClient: BringClientFactory = defaultClientFactory,
		private readonly now: () => Date = (): Date => new Date()
	) {}

	private async authenticate(): Promise<void> {
		if (!this.config) {
			throw new BringServiceError('BRING_NOT_CONFIGURED');
		}
		if (this.client && this.listName) {
			return;
		}
		if (!this.loginPromise) {
			const config = this.config;
			this.loginPromise = (async (): Promise<void> => {
				const client = this.createClient(config);
				try {
					await client.login();
				} catch {
					throw new BringServiceError('BRING_AUTH_FAILED');
				}
				let lists: { lists: BringList[] };
				let catalog: BringCatalog;
				let settings: BringUserSettings;
				try {
					[lists, catalog, settings] = await Promise.all([
						client.loadLists(),
						client.loadCatalog('nb-NO'),
						client.getUserSettings()
					]);
				} catch {
					throw new BringServiceError('BRING_UNAVAILABLE');
				}
				const selected = lists.lists.find((list) => list.listUuid === config.listUuid);
				if (!selected) {
					throw new BringServiceError('BRING_LIST_NOT_FOUND');
				}
				this.client = client;
				this.listName = selected.name;
				this.displayNames = new Map();
				this.sourceNames = new Map();
				this.itemSections = new Map();
				const sectionIds = catalog.catalog.sections.map((section) => section.sectionId);
				const configuredValue = settings.userlistsettings
					.find((setting) => setting.listUuid === config.listUuid)
					?.usersettings.find((setting) => setting.key === 'listSectionOrder')?.value;
				let configuredOrder: string[] = [];
				if (configuredValue) {
					try {
						const parsed: unknown = JSON.parse(configuredValue);
						if (Array.isArray(parsed) && parsed.every((value) => typeof value === 'string')) {
							configuredOrder = parsed;
						}
					} catch {
						configuredOrder = [];
					}
				}
				const userSection = 'Eigene Artikel';
				const availableSections = [...sectionIds, userSection];
				const sectionOrder = configuredOrder.filter(
					(section, index) =>
						availableSections.includes(section) && configuredOrder.indexOf(section) === index
				);
				const missingSections = availableSections.filter(
					(section) => !sectionOrder.includes(section)
				);
				const insertionIndex =
					sectionOrder.at(-1) === userSection ? sectionOrder.length - 1 : sectionOrder.length;
				sectionOrder.splice(insertionIndex, 0, ...missingSections);
				this.sectionRanks = new Map(sectionOrder.map((section, index) => [section, index]));
				for (const section of catalog.catalog.sections) {
					for (const item of section.items) {
						this.displayNames.set(item.itemId, item.name);
						this.sourceNames.set(item.name.toLocaleLowerCase('nb-NO'), item.itemId);
						if (!this.itemSections.has(item.itemId)) {
							this.itemSections.set(item.itemId, section.sectionId);
						}
					}
				}
			})().finally((): void => {
				this.loginPromise = undefined;
			});
		}
		return this.loginPromise;
	}

	private resetAuthentication(): void {
		this.client = undefined;
		this.listName = undefined;
		this.displayNames = new Map();
		this.sourceNames = new Map();
		this.listedSourceNames = new Map();
		this.itemSections = new Map();
		this.sectionRanks = new Map();
	}

	private async withAuthentication<T>(
		operation: (client: BringClient) => Promise<T>,
		failureCode: 'BRING_UNAVAILABLE' | 'BRING_MUTATION_FAILED'
	): Promise<T> {
		for (let attempt = 0; attempt < 2; attempt += 1) {
			await this.authenticate();
			try {
				return await operation(this.client as BringClient);
			} catch (error) {
				if (isAuthenticationError(error) && attempt === 0) {
					this.resetAuthentication();
					continue;
				}
				throw new BringServiceError(
					isAuthenticationError(error) ? 'BRING_AUTH_FAILED' : failureCode
				);
			}
		}
		throw new BringServiceError(failureCode);
	}

	async snapshot(): Promise<ShoppingListSnapshot> {
		try {
			return await this.withAuthentication(async (client): Promise<ShoppingListSnapshot> => {
				const response = await client.getItems(this.config?.listUuid ?? '');
				const normalize = (items: BringItem[]): ShoppingListItem[] =>
					items.flatMap((item) => {
						const valid = validUpstreamItem(item, this.displayNames);
						return valid ? [valid] : [];
					});
				const items = normalize(response.purchase);
				this.listedSourceNames = new Map(
					items.map((item) => [item.sourceName.toLocaleLowerCase('nb-NO'), item.sourceName])
				);
				items.sort((first, second) => {
					const firstSection = this.itemSections.get(first.sourceName) ?? 'Eigene Artikel';
					const secondSection = this.itemSections.get(second.sourceName) ?? 'Eigene Artikel';
					const firstRank = this.sectionRanks.get(firstSection) ?? Number.MAX_SAFE_INTEGER;
					const secondRank = this.sectionRanks.get(secondSection) ?? Number.MAX_SAFE_INTEGER;
					if (firstRank !== secondRank) {
						return firstRank - secondRank;
					}
					if (first.sourceName === second.sourceName) {
						return 0;
					}
					return first.sourceName < second.sourceName ? -1 : 1;
				});
				return {
					listUuid: this.config?.listUuid ?? '',
					listName: this.listName ?? '',
					items,
					recentItems: normalize(response.recently),
					fetchedAt: this.now().toISOString()
				};
			}, 'BRING_UNAVAILABLE');
		} catch (error) {
			if (error instanceof BringServiceError) {
				throw error;
			}
			throw new BringServiceError('BRING_UNAVAILABLE');
		}
	}

	async planningSnapshot(): Promise<ShoppingPlanningSnapshot> {
		const snapshot = await this.snapshot();
		return {
			snapshot,
			catalog: [...this.displayNames.entries()].map(([sourceName, name]) => ({ sourceName, name }))
		};
	}

	private serializeMutation(
		operation: () => Promise<ShoppingListSnapshot>
	): Promise<ShoppingListSnapshot> {
		const result = this.mutationTail.then(operation);
		this.mutationTail = result.then(
			() => undefined,
			() => undefined
		);
		return result;
	}

	add(name: string, specification: string): Promise<ShoppingListSnapshot> {
		return this.serializeMutation(async (): Promise<ShoppingListSnapshot> => {
			try {
				await this.authenticate();
				const sourceName = this.sourceNames.get(name.toLocaleLowerCase('nb-NO')) ?? name;
				await this.withAuthentication(
					(client) => client.saveItem(this.config?.listUuid ?? '', sourceName, specification),
					'BRING_MUTATION_FAILED'
				);
				const snapshot = await this.snapshot();
				const saved = snapshot.items.find((item) => item.sourceName === sourceName);
				if (!saved || saved.specification !== specification) {
					throw new BringServiceError('BRING_MUTATION_FAILED');
				}
				return snapshot;
			} catch (error) {
				if (error instanceof BringServiceError) {
					throw error;
				}
				throw new BringServiceError('BRING_MUTATION_FAILED');
			}
		});
	}

	complete(sourceName: string): Promise<ShoppingListSnapshot> {
		return this.serializeMutation(async (): Promise<ShoppingListSnapshot> => {
			try {
				await this.withAuthentication(
					(client) => client.moveToRecentList(this.config?.listUuid ?? '', sourceName),
					'BRING_MUTATION_FAILED'
				);
				const snapshot = await this.snapshot();
				if (
					snapshot.items.some((item) => item.sourceName === sourceName) ||
					!snapshot.recentItems.some((item) => item.sourceName === sourceName)
				) {
					throw new BringServiceError('BRING_MUTATION_FAILED');
				}
				return snapshot;
			} catch (error) {
				if (error instanceof BringServiceError) {
					throw error;
				}
				throw new BringServiceError('BRING_MUTATION_FAILED');
			}
		});
	}

	edit(sourceName: string, specification: string): Promise<ShoppingListSnapshot> {
		return this.serializeMutation(async (): Promise<ShoppingListSnapshot> => {
			try {
				await this.withAuthentication(
					(client) => client.saveItem(this.config?.listUuid ?? '', sourceName, specification),
					'BRING_MUTATION_FAILED'
				);
				const snapshot = await this.snapshot();
				const edited = snapshot.items.find((item) => item.sourceName === sourceName);
				if (!edited || edited.specification !== specification) {
					throw new BringServiceError('BRING_MUTATION_FAILED');
				}
				return snapshot;
			} catch (error) {
				if (error instanceof BringServiceError) {
					throw error;
				}
				throw new BringServiceError('BRING_MUTATION_FAILED');
			}
		});
	}

	applyAbsolute(operations: readonly AbsoluteShoppingOperation[]): Promise<ShoppingListSnapshot> {
		return this.serializeMutation(async (): Promise<ShoppingListSnapshot> => {
			try {
				await this.authenticate();
				for (const operation of operations) {
					const sourceName =
						this.listedSourceNames.get(operation.sourceName.toLocaleLowerCase('nb-NO')) ??
						this.sourceNames.get(operation.sourceName.toLocaleLowerCase('nb-NO')) ??
						operation.sourceName;
					await this.withAuthentication(
						(client) =>
							client.saveItem(this.config?.listUuid ?? '', sourceName, operation.specification),
						'BRING_MUTATION_FAILED'
					);
				}
				const snapshot = await this.snapshot();
				for (const operation of operations) {
					const sourceName =
						this.listedSourceNames.get(operation.sourceName.toLocaleLowerCase('nb-NO')) ??
						this.sourceNames.get(operation.sourceName.toLocaleLowerCase('nb-NO')) ??
						operation.sourceName;
					const saved = snapshot.items.find((item) => item.sourceName === sourceName);
					if (!saved || saved.specification !== operation.specification) {
						throw new BringServiceError('BRING_MUTATION_FAILED');
					}
				}
				return snapshot;
			} catch (error) {
				if (error instanceof BringServiceError) throw error;
				throw new BringServiceError('BRING_MUTATION_FAILED');
			}
		});
	}
}

function errorResponse(error: unknown): Response {
	if (!(error instanceof BringServiceError)) {
		return apiError('BRING_UNAVAILABLE', 502);
	}
	const status = error.code === 'BRING_NOT_CONFIGURED' ? 503 : 502;
	return apiError(error.code, status);
}

export function loadTripBringConfig(
	db: Database.Database,
	tripId: string,
	credentials: BringCredentials | undefined = getBringCredentials()
): BringConfig | undefined {
	if (!credentials) return undefined;
	const row = db
		.prepare(
			`SELECT config_json FROM trip_modules
			 WHERE trip_id = ? AND module_id = 'shopping-list' AND enabled = 1`
		)
		.get(tripId) as { config_json: string } | undefined;
	if (!row) return undefined;
	const config = JSON.parse(row.config_json) as Record<string, unknown>;
	return typeof config.listUuid === 'string' && config.providerStatus === 'verified'
		? { ...credentials, listUuid: config.listUuid }
		: undefined;
}

const services = new Map<string, { listUuid: string; service: BringService }>();

export function getBringService(db: Database.Database, tripId: string): BringService {
	const config = loadTripBringConfig(db, tripId);
	const cached = services.get(tripId);
	if (cached && cached.listUuid === config?.listUuid) return cached.service;
	const service = new BringService(config);
	if (config) services.set(tripId, { listUuid: config.listUuid, service });
	else services.delete(tripId);
	return service;
}

export async function handleGetShoppingList(bring: BringService): Promise<Response> {
	try {
		return apiSuccess(await bring.snapshot());
	} catch (error) {
		return errorResponse(error);
	}
}

export async function handleAddShoppingListItem(
	request: Request,
	bring: BringService
): Promise<Response> {
	const result = await parseJsonRequest(request, addShoppingListItemSchema);
	if (!result.success) {
		return apiError('INVALID_REQUEST', 400);
	}
	try {
		return apiSuccess(await bring.add(result.data.name, result.data.specification));
	} catch (error) {
		return errorResponse(error);
	}
}

export async function handleCompleteShoppingListItem(
	request: Request,
	bring: BringService
): Promise<Response> {
	const result = await parseJsonRequest(request, completeShoppingListItemSchema);
	if (!result.success) {
		return apiError('INVALID_REQUEST', 400);
	}
	try {
		return apiSuccess(await bring.complete(result.data.sourceName));
	} catch (error) {
		return errorResponse(error);
	}
}

export async function handleEditShoppingListItem(
	request: Request,
	bring: BringService
): Promise<Response> {
	const result = await parseJsonRequest(request, editShoppingListItemSchema);
	if (!result.success) {
		return apiError('INVALID_REQUEST', 400);
	}
	try {
		return apiSuccess(await bring.edit(result.data.sourceName, result.data.specification));
	} catch (error) {
		return errorResponse(error);
	}
}
