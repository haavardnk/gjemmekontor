import { z } from 'zod';

const runtimeEnvironmentSchema = z
	.object({
		APP_PASSWORD: z.string().min(8),
		APP_VERSION: z
			.union([
				z.literal('unreleased'),
				z.string().regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/)
			])
			.optional(),
		SESSION_SECRET: z.string().min(32),
		DATA_DIR: z.string().min(1),
		BUNDLED_OFFLINE_MAP_DIR: z.string().min(1).optional(),
		GOOGLE_MY_MAPS_ID: z.string().min(1),
		ORIGIN: z.url(),
		BRING_EMAIL: z.email().optional(),
		BRING_PASSWORD: z.string().min(1).optional(),
		BRING_LIST_UUID: z.string().min(1).max(100).optional()
	})
	.superRefine((environment, context): void => {
		const values = [
			environment.BRING_EMAIL,
			environment.BRING_PASSWORD,
			environment.BRING_LIST_UUID
		];
		if (values.some(Boolean) && !values.every(Boolean)) {
			for (const key of ['BRING_EMAIL', 'BRING_PASSWORD', 'BRING_LIST_UUID'] as const) {
				if (!environment[key]) {
					context.addIssue({ code: 'custom', path: [key], message: 'Required with Bring config' });
				}
			}
		}
	});

export type BringConfig = {
	email: string;
	password: string;
	listUuid: string;
};

export type RuntimeConfig = {
	appPassword: string;
	appVersion?: string;
	sessionSecret: string;
	dataDir: string;
	bundledOfflineMapDir?: string;
	googleMyMapsId: string;
	origin: string;
	bring?: BringConfig;
};

export function parseRuntimeConfig(environment: Record<string, string | undefined>): RuntimeConfig {
	const result = runtimeEnvironmentSchema.safeParse(environment);
	if (!result.success) {
		const variables = [...new Set(result.error.issues.map((issue) => issue.path.join('.')))];
		throw new Error(`Invalid runtime environment: ${variables.join(', ')}`);
	}

	return {
		appPassword: result.data.APP_PASSWORD,
		...(result.data.APP_VERSION && result.data.APP_VERSION !== 'unreleased'
			? { appVersion: result.data.APP_VERSION }
			: {}),
		sessionSecret: result.data.SESSION_SECRET,
		dataDir: result.data.DATA_DIR,
		...(result.data.BUNDLED_OFFLINE_MAP_DIR
			? { bundledOfflineMapDir: result.data.BUNDLED_OFFLINE_MAP_DIR }
			: {}),
		googleMyMapsId: result.data.GOOGLE_MY_MAPS_ID,
		origin: result.data.ORIGIN,
		...(result.data.BRING_EMAIL && result.data.BRING_PASSWORD && result.data.BRING_LIST_UUID
			? {
					bring: {
						email: result.data.BRING_EMAIL,
						password: result.data.BRING_PASSWORD,
						listUuid: result.data.BRING_LIST_UUID
					}
				}
			: {})
	};
}

let runtimeConfig: RuntimeConfig | undefined;

export function getRuntimeConfig(): RuntimeConfig {
	if (!runtimeConfig) {
		runtimeConfig = parseRuntimeConfig(process.env);
	}

	return runtimeConfig;
}
