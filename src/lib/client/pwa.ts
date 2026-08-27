export async function warmAppShell(paths: readonly string[], tripId: string): Promise<void> {
	if (!('serviceWorker' in navigator)) {
		return;
	}
	const registration = await navigator.serviceWorker.ready;
	registration.active?.postMessage({ type: 'CACHE_APP_SHELL', paths, tripId });
}
