import { z } from 'zod';

const maximumProviderBytes = 512 * 1024;

export type ProviderErrorCode = 'no_match' | 'not_found' | 'rate_limited' | 'unavailable';

export class ProviderError extends Error {
	constructor(
		public readonly code: ProviderErrorCode,
		public readonly retryAfter?: Date
	) {
		super(code);
	}
}

export function providerResponseError(response: Response, now = Date.now()): ProviderError {
	if (response.status === 404) return new ProviderError('not_found');
	if (response.status === 429) {
		const retryHeader = response.headers.get('retry-after');
		const seconds = retryHeader ? Number(retryHeader) : Number.NaN;
		const parsedDate = retryHeader ? Date.parse(retryHeader) : Number.NaN;
		const retryAt = Number.isFinite(seconds)
			? new Date(now + Math.min(Math.max(seconds, 1), 86_400) * 1000)
			: Number.isFinite(parsedDate)
				? new Date(Math.min(Math.max(parsedDate, now + 1000), now + 86_400_000))
				: new Date(now + 60_000);
		return new ProviderError('rate_limited', retryAt);
	}
	return new ProviderError('unavailable');
}

export async function parseProviderJson<T extends z.ZodType>(
	response: Response,
	schema: T
): Promise<z.infer<T>> {
	const declaredLength = Number(response.headers.get('content-length'));
	if (Number.isFinite(declaredLength) && declaredLength > maximumProviderBytes) {
		throw new ProviderError('unavailable');
	}
	if (!response.body) throw new ProviderError('unavailable');
	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	while (true) {
		const result = await reader.read();
		if (result.done) break;
		total += result.value.byteLength;
		if (total > maximumProviderBytes) {
			await reader.cancel();
			throw new ProviderError('unavailable');
		}
		chunks.push(result.value);
	}
	try {
		const bytes = Buffer.concat(chunks);
		return schema.parse(JSON.parse(bytes.toString('utf8')));
	} catch {
		throw new ProviderError('unavailable');
	}
}
