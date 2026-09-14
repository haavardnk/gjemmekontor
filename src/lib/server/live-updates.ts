export type LiveUpdate = {
	state: boolean;
	modules: string[];
	reload: boolean;
};

type LiveUpdateListener = (update: LiveUpdate) => void;

export class LiveUpdateHub {
	private listeners = new Map<string, Set<LiveUpdateListener>>();

	subscribe(tripId: string, listener: LiveUpdateListener): () => void {
		const tripListeners = this.listeners.get(tripId) ?? new Set();
		tripListeners.add(listener);
		this.listeners.set(tripId, tripListeners);
		return (): void => {
			tripListeners.delete(listener);
			if (!tripListeners.size) this.listeners.delete(tripId);
		};
	}

	publish(tripId: string, update: LiveUpdate): void {
		for (const listener of this.listeners.get(tripId) ?? []) listener(update);
	}
}

export const liveUpdates = new LiveUpdateHub();
