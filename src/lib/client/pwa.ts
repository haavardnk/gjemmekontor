export async function warmAppShell(): Promise<void> {
	if (!('serviceWorker' in navigator)) {
		return;
	}
	const registration = await navigator.serviceWorker.ready;
	registration.active?.postMessage({ type: 'CACHE_APP_SHELL' });
}
