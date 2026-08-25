import { z } from 'zod';

const bringEnvironmentSchema = z
	.object({
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

export type BringConfig = { email: string; password: string; listUuid: string };

export function parseBringConfig(
	environment: Record<string, string | undefined>
): BringConfig | undefined {
	const result = bringEnvironmentSchema.safeParse(environment);
	if (!result.success) {
		const variables = [...new Set(result.error.issues.map((issue) => issue.path.join('.')))];
		throw new Error(`Invalid Shopping List environment: ${variables.join(', ')}`);
	}
	return result.data.BRING_EMAIL && result.data.BRING_PASSWORD && result.data.BRING_LIST_UUID
		? {
				email: result.data.BRING_EMAIL,
				password: result.data.BRING_PASSWORD,
				listUuid: result.data.BRING_LIST_UUID
			}
		: undefined;
}

export function getBringConfig(): BringConfig | undefined {
	return parseBringConfig(process.env);
}
