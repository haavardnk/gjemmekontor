import { apiRequest, type ApiRequestOptions } from '$lib/client/api';
import type { AisApiResponse } from '$lib/modules/map/domain/ais';

export type AisPollerOptions = {
	onData: (response: AisApiResponse) => void;
	onError: () => void;
	request?: (input: RequestInfo | URL, options?: ApiRequestOptions) => Promise<unknown>;
	intervalMs?: number;
};

export function parseAisResponse(value: unknown): AisApiResponse {
	if (
		value === null ||
		typeof value !== 'object' ||
		!('type' in value) ||
		value.type !== 'FeatureCollection' ||
		!('features' in value) ||
		!Array.isArray(value.features) ||
		!('status' in value) ||
		typeof value.status !== 'string'
	) {
		throw new Error('AIS_INVALID_RESPONSE');
	}
	return value as AisApiResponse;
}

export function startAisPolling(options: AisPollerOptions): () => void {
	const request = options.request ?? apiRequest;
	let disposed = false;
	let loading = false;
	let controller: AbortController | undefined;
	const refresh = async (): Promise<void> => {
		if (loading) return;
		loading = true;
		controller = new AbortController();
		try {
			const response = await request('/api/map/ais', {
				signal: controller.signal,
				cache: 'no-store'
			});
			if (!disposed) options.onData(parseAisResponse(response));
		} catch (error) {
			if (!disposed && !(error instanceof DOMException && error.name === 'AbortError')) {
				options.onError();
			}
		} finally {
			loading = false;
		}
	};
	void refresh();
	const interval = setInterval(refresh, options.intervalMs ?? 5_000);
	return (): void => {
		disposed = true;
		controller?.abort();
		clearInterval(interval);
	};
}
