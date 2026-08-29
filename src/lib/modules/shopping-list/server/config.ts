import { z } from 'zod';

import { env } from '$env/dynamic/private';

const bringEnvironmentSchema = z
	.object({
		BRING_EMAIL: z.email().optional(),
		BRING_PASSWORD: z.string().min(1).optional()
	})
	.superRefine((environment, context): void => {
		const values = [environment.BRING_EMAIL, environment.BRING_PASSWORD];
		if (values.some(Boolean) && !values.every(Boolean)) {
			for (const key of ['BRING_EMAIL', 'BRING_PASSWORD'] as const) {
				if (!environment[key]) {
					context.addIssue({ code: 'custom', path: [key], message: 'Required with Bring config' });
				}
			}
		}
	});

export type BringCredentials = { email: string; password: string };
export type BringConfig = BringCredentials & { listUuid: string };

export function parseBringCredentials(
	environment: Record<string, string | undefined>
): BringCredentials | undefined {
	const result = bringEnvironmentSchema.safeParse(environment);
	if (!result.success) {
		const variables = [...new Set(result.error.issues.map((issue) => issue.path.join('.')))];
		throw new Error(`Invalid Shopping List environment: ${variables.join(', ')}`);
	}
	return result.data.BRING_EMAIL && result.data.BRING_PASSWORD
		? {
				email: result.data.BRING_EMAIL,
				password: result.data.BRING_PASSWORD
			}
		: undefined;
}

export function getBringCredentials(): BringCredentials | undefined {
	return parseBringCredentials(env);
}
