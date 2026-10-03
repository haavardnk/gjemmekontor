import { apiError } from '$lib/server/api';
import { hasRasterSignature, rasterImageTypes } from '$lib/server/raster-image';
import { fetchRemoteResource, RemoteFetchError } from '$lib/server/remote-fetch';

export async function handleMenuImage(request: Request): Promise<Response> {
	const url = new URL(request.url).searchParams.get('url');
	if (!url) return apiError('INVALID_REQUEST', 400);
	try {
		const resource = await fetchRemoteResource(url, {
			accept: rasterImageTypes.join(','),
			allowedContentTypes: rasterImageTypes,
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
