export async function warmAppShell(paths: readonly string[], tripId: string): Promise<boolean> {
	if (!('serviceWorker' in navigator)) {
		return false;
	}
	const registration = await navigator.serviceWorker.ready;
	if (!registration.active) return false;
	return new Promise<boolean>((resolve) => {
		const channel = new MessageChannel();
		const timeout = window.setTimeout(() => resolve(false), 15_000);
		channel.port1.onmessage = (event): void => {
			window.clearTimeout(timeout);
			resolve(event.data?.ready === true);
		};
		registration.active?.postMessage({ type: 'CACHE_APP_SHELL', paths, tripId }, [channel.port2]);
	});
}
