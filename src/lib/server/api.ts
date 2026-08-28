import type { ZodType } from 'zod';

export function apiError(code: string, status: number): Response {
	return Response.json({ error: code }, { status });
}

export function apiSuccess<T>(body: T, status = 200): Response {
	return Response.json(body, { status });
}

export async function readJsonRequest(request: Request): Promise<unknown> {
	try {
		return await request.json();
	} catch {
		return undefined;
	}
}

export async function parseJsonRequest<Output>(request: Request, schema: ZodType<Output>) {
	return schema.safeParse(await readJsonRequest(request));
}
