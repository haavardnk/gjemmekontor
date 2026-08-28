export class ApiError extends Error {
	constructor(
		readonly code: string,
		readonly status: number
	) {
		super(code);
	}
}

export type ApiRequestOptions = Omit<RequestInit, 'body'> & { json?: unknown };

export async function apiRequest<Output = undefined>(
	input: RequestInfo | URL,
	options: ApiRequestOptions = {}
): Promise<Output> {
	const { json, ...init } = options;
	const response = await fetch(input, {
		...init,
		...(json === undefined
			? {}
			: {
					headers: {
						...Object.fromEntries(new Headers(init.headers)),
						'content-type': 'application/json'
					},
					body: JSON.stringify(json)
				})
	});
	const body: unknown = await response.json().catch(() => undefined);
	if (!response.ok) {
		const code =
			body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
				? body.error
				: 'REQUEST_FAILED';
		throw new ApiError(code, response.status);
	}
	return body as Output;
}
