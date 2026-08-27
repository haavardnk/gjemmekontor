import { z } from 'zod';

const runtimeEnvironmentSchema = z.object({
	ADMIN_PASSWORD: z.string().min(12).max(1024),
	APP_VERSION: z
		.union([
			z.literal('unreleased'),
			z.string().regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/)
		])
		.optional(),
	SESSION_SECRET: z.string().min(32),
	DATA_DIR: z.string().min(1),
	ORIGIN: z.url()
});

export type RuntimeConfig = {
	adminPassword: string;
	appVersion?: string;
	sessionSecret: string;
	dataDir: string;
	origin: string;
};

export function parseRuntimeConfig(environment: Record<string, string | undefined>): RuntimeConfig {
	const result = runtimeEnvironmentSchema.safeParse(environment);
	if (!result.success) {
		const variables = [...new Set(result.error.issues.map((issue) => issue.path.join('.')))];
		throw new Error(`Invalid runtime environment: ${variables.join(', ')}`);
	}

	return {
		adminPassword: result.data.ADMIN_PASSWORD,
		...(result.data.APP_VERSION && result.data.APP_VERSION !== 'unreleased'
			? { appVersion: result.data.APP_VERSION }
			: {}),
		sessionSecret: result.data.SESSION_SECRET,
		dataDir: result.data.DATA_DIR,
		origin: result.data.ORIGIN
	};
}

let runtimeConfig: RuntimeConfig | undefined;

export function getRuntimeConfig(): RuntimeConfig {
	if (!runtimeConfig) {
		runtimeConfig = parseRuntimeConfig(process.env);
	}

	return runtimeConfig;
}
