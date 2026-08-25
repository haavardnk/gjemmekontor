import { apiError } from '$lib/server/api';

import { fetchRemoteResource, RemoteFetchError } from './remote-fetch';

const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif'] as const;

function hasRasterSignature(contentType: string, body: Uint8Array): boolean {
	if (contentType === 'image/jpeg') return body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff;
	if (contentType === 'image/png') return body.slice(0, 8).toHex() === '89504e470d0a1a0a';
	if (contentType === 'image/gif') return new TextDecoder().decode(body.slice(0, 4)) === 'GIF8';
	if (contentType === 'image/webp') {
		return (
			new TextDecoder().decode(body.slice(0, 4)) === 'RIFF' &&
			new TextDecoder().decode(body.slice(8, 12)) === 'WEBP'
		);
	}
	if (contentType === 'image/avif') {
		const brand = new TextDecoder().decode(body.slice(8, 12));
		return (
			new TextDecoder().decode(body.slice(4, 8)) === 'ftyp' && ['avif', 'avis'].includes(brand)
		);
	}
	return false;
}

export async function handleMenuImage(request: Request): Promise<Response> {
	const url = new URL(request.url).searchParams.get('url');
	if (!url) return apiError('INVALID_REQUEST', 400);
	try {
		const resource = await fetchRemoteResource(url, {
			accept: allowedTypes.join(','),
			allowedContentTypes: allowedTypes,
			maximumBytes: 5_000_000
		});
		if (!hasRasterSignature(resource.contentType, resource.body)) {
			return apiError('REMOTE_IMAGE_INVALID', 422);
		}
		return new Response(resource.body.slice().buffer as ArrayBuffer, {
			headers: {
				'content-type': resource.contentType,
				'cache-control': 'private, max-age=3600',
				'content-security-policy': "default-src 'none'"
			}
		});
	} catch (error) {
		return apiError(error instanceof RemoteFetchError ? error.code : 'REMOTE_IMAGE_FAILED', 400);
	}
}
