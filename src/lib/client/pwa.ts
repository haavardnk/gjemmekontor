import { startSyncTriggers } from './sync-triggers';

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

export async function activateAppVersion(
	runningVersion: string | undefined,
	serverVersion: string | null | undefined
): Promise<void> {
	if (!serverVersion || !runningVersion || serverVersion === runningVersion) return;
	const marker = `gjemmekontor-reload:${serverVersion}`;
	if (sessionStorage.getItem(marker)) return;
	sessionStorage.setItem(marker, 'requested');
	if ('serviceWorker' in navigator) {
		const registration = await navigator.serviceWorker.getRegistration();
		await registration?.update().catch(() => undefined);
	}
	window.location.reload();
}

export function startAppVersionChecks(runningVersion: string | undefined): () => void {
	if (!runningVersion) return (): void => undefined;
	const check = (): void => {
		void fetch('/api/health')
			.then(async (response): Promise<void> => {
				if (!response.ok) return;
				const body = (await response.json()) as { version?: unknown };
				await activateAppVersion(
					runningVersion,
					typeof body.version === 'string' ? body.version : undefined
				);
			})
			.catch(() => undefined);
	};
	check();
	return startSyncTriggers(check);
}
