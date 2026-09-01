export type SyncTriggerEnvironment = {
	windowTarget?: EventTarget;
	documentTarget?: EventTarget;
	setInterval: (callback: () => void, delay: number) => ReturnType<typeof setInterval>;
	clearInterval: (timer: ReturnType<typeof setInterval>) => void;
};

const defaultEnvironment = (): SyncTriggerEnvironment => ({
	...(typeof window === 'undefined' ? {} : { windowTarget: window }),
	...(typeof document === 'undefined' ? {} : { documentTarget: document }),
	setInterval: (callback, delay) => globalThis.setInterval(callback, delay),
	clearInterval: (timer) => globalThis.clearInterval(timer)
});

export function startSyncTriggers(
	trigger: () => void,
	options: { includeOffline?: boolean; intervalMs?: number } = {},
	environment: SyncTriggerEnvironment = defaultEnvironment()
): () => void {
	const windowEvents = options.includeOffline
		? (['online', 'offline', 'focus'] as const)
		: (['online', 'focus'] as const);
	for (const event of windowEvents) environment.windowTarget?.addEventListener(event, trigger);
	environment.documentTarget?.addEventListener('visibilitychange', trigger);
	const timer = environment.setInterval(trigger, options.intervalMs ?? 15_000);

	return (): void => {
		for (const event of windowEvents) environment.windowTarget?.removeEventListener(event, trigger);
		environment.documentTarget?.removeEventListener('visibilitychange', trigger);
		environment.clearInterval(timer);
	};
}
