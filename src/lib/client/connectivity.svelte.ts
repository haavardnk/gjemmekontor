import { watchOnlineStatus } from './online';

export class ConnectivityState {
	online = $state(true);

	private stopWatching: (() => void) | undefined;

	start(): void {
		this.stop();
		this.stopWatching = watchOnlineStatus((online) => (this.online = online));
	}

	stop(): void {
		this.stopWatching?.();
		this.stopWatching = undefined;
	}

	reportNetworkSuccess(): void {
		this.online = true;
	}

	reportNetworkFailure(error: unknown): void {
		if (error instanceof TypeError) this.online = false;
	}
}

export const connectivity = new ConnectivityState();
