export interface OnlineStatusEnvironment {
	target: EventTarget;
	read: () => boolean;
}

export function watchOnlineStatus(
	update: (online: boolean) => void,
	environment: OnlineStatusEnvironment = {
		target: window,
		read: () => navigator.onLine
	}
): () => void {
	const sync = (): void => update(environment.read());

	sync();
	environment.target.addEventListener('online', sync);
	environment.target.addEventListener('offline', sync);

	return (): void => {
		environment.target.removeEventListener('online', sync);
		environment.target.removeEventListener('offline', sync);
	};
}
