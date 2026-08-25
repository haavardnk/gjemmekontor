import type { LookupAddress } from 'node:dns';
import { lookup } from 'node:dns/promises';

import ipaddr from 'ipaddr.js';
import { Agent, request } from 'undici';

export class RemoteFetchError extends Error {
	constructor(readonly code: string) {
		super(code);
	}
}

export type RemoteResource = {
	finalUrl: string;
	contentType: string;
	body: Uint8Array;
};

type RemoteFetchOptions = {
	accept: string;
	allowedContentTypes: readonly string[];
	maximumBytes: number;
	maximumRedirects?: number;
};

export function validateRemoteUrl(value: string): URL {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		throw new RemoteFetchError('INVALID_REMOTE_URL');
	}
	if (
		url.protocol !== 'https:' ||
		url.username ||
		url.password ||
		(url.port && url.port !== '443') ||
		!url.hostname ||
		url.hostname.endsWith('.local') ||
		url.hostname.endsWith('.internal') ||
		url.hostname === 'localhost'
	) {
		throw new RemoteFetchError('REMOTE_DESTINATION_BLOCKED');
	}
	return url;
}

export function isPublicAddress(address: string): boolean {
	try {
		let parsed = ipaddr.parse(address);
		if (parsed.kind() === 'ipv6') {
			const ipv6 = parsed as ipaddr.IPv6;
			if (ipv6.isIPv4MappedAddress()) parsed = ipv6.toIPv4Address();
		}
		return parsed.range() === 'unicast';
	} catch {
		return false;
	}
}

export function pinnedLookupResult(
	address: string,
	family: 4 | 6,
	all: boolean
): LookupAddress | LookupAddress[] {
	const selected = { address, family };
	return all ? [selected] : selected;
}

async function publicAddresses(
	hostname: string
): Promise<Array<{ address: string; family: 4 | 6 }>> {
	if (ipaddr.isValid(hostname)) {
		if (!isPublicAddress(hostname)) throw new RemoteFetchError('REMOTE_DESTINATION_BLOCKED');
		return [{ address: hostname, family: ipaddr.parse(hostname).kind() === 'ipv4' ? 4 : 6 }];
	}
	let addresses: LookupAddress[];
	try {
		addresses = await lookup(hostname, { all: true, verbatim: true });
	} catch {
		throw new RemoteFetchError('REMOTE_DNS_FAILED');
	}
	if (!addresses.length || addresses.some((entry) => !isPublicAddress(entry.address))) {
		throw new RemoteFetchError('REMOTE_DESTINATION_BLOCKED');
	}
	return addresses.map((entry) => ({ address: entry.address, family: entry.family as 4 | 6 }));
}

async function readBoundedBody(
	body: AsyncIterable<Uint8Array>,
	maximumBytes: number
): Promise<Uint8Array> {
	const chunks: Uint8Array[] = [];
	let total = 0;
	for await (const chunk of body) {
		total += chunk.byteLength;
		if (total > maximumBytes) throw new RemoteFetchError('REMOTE_RESPONSE_TOO_LARGE');
		chunks.push(chunk);
	}
	const result = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		result.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return result;
}

export async function fetchRemoteResource(
	input: string,
	options: RemoteFetchOptions
): Promise<RemoteResource> {
	let url = validateRemoteUrl(input);
	const maximumRedirects = options.maximumRedirects ?? 5;
	for (let redirects = 0; redirects <= maximumRedirects; redirects += 1) {
		const addresses = await publicAddresses(url.hostname);
		const selected = addresses[0];
		if (!selected) throw new RemoteFetchError('REMOTE_DNS_FAILED');
		const dispatcher = new Agent({
			connect: {
				lookup(_hostname, lookupOptions, callback): void {
					const result = pinnedLookupResult(
						selected.address,
						selected.family,
						Boolean(lookupOptions.all)
					);
					if (Array.isArray(result)) {
						callback(null, result);
					} else {
						callback(null, result.address, result.family);
					}
				}
			}
		});
		try {
			const response = await request(url, {
				dispatcher,
				method: 'GET',
				headersTimeout: 8_000,
				bodyTimeout: 8_000,
				headers: {
					accept: options.accept,
					'user-agent': 'Gjemmekontor Menu/1.0'
				}
			});
			if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
				const rawLocation = response.headers.location;
				const location = Array.isArray(rawLocation) ? rawLocation[0] : rawLocation;
				await response.body.dump();
				if (!location || redirects === maximumRedirects) {
					throw new RemoteFetchError('REMOTE_REDIRECT_LIMIT');
				}
				url = validateRemoteUrl(new URL(location, url).href);
				continue;
			}
			if (response.statusCode < 200 || response.statusCode >= 300) {
				await response.body.dump();
				throw new RemoteFetchError('REMOTE_FETCH_FAILED');
			}
			const declaredLength = Number(response.headers['content-length'] ?? 0);
			if (declaredLength > options.maximumBytes) {
				await response.body.dump();
				throw new RemoteFetchError('REMOTE_RESPONSE_TOO_LARGE');
			}
			const contentType = String(response.headers['content-type'] ?? '')
				.split(';')[0]
				?.trim()
				.toLocaleLowerCase('en-US');
			if (!options.allowedContentTypes.includes(contentType)) {
				await response.body.dump();
				throw new RemoteFetchError('REMOTE_CONTENT_TYPE_INVALID');
			}
			return {
				finalUrl: url.href,
				contentType,
				body: await readBoundedBody(response.body, options.maximumBytes)
			};
		} catch (error) {
			if (error instanceof RemoteFetchError) throw error;
			throw new RemoteFetchError('REMOTE_FETCH_FAILED');
		} finally {
			await dispatcher.close();
		}
	}
	throw new RemoteFetchError('REMOTE_REDIRECT_LIMIT');
}
