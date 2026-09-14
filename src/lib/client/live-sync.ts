import { z } from 'zod';

import { activateAppVersion } from './pwa';

const liveSyncEventSchema = z.object({
	state: z.boolean(),
	modules: z.array(z.string()),
	reload: z.boolean(),
	version: z.string().nullable().optional()
});

type LiveSyncDependencies = {
	createEventSource?: (url: string) => EventSource;
	refreshModules: (moduleId?: string) => Promise<void>;
	refreshState: () => Promise<void>;
	activateVersion?: typeof activateAppVersion;
	reload?: () => void;
};

export class LiveSync {
	private readonly createEventSource: (url: string) => EventSource;
	private readonly refreshModules: (moduleId?: string) => Promise<void>;
	private readonly refreshState: () => Promise<void>;
	private readonly activateVersion: typeof activateAppVersion;
	private readonly reload: () => void;
	private source: EventSource | undefined;
	private runningVersion: string | undefined;

	constructor(dependencies: LiveSyncDependencies) {
		this.createEventSource =
			dependencies.createEventSource ?? ((url: string): EventSource => new EventSource(url));
		this.refreshModules = dependencies.refreshModules;
		this.refreshState = dependencies.refreshState;
		this.activateVersion = dependencies.activateVersion ?? activateAppVersion;
		this.reload = dependencies.reload ?? (() => window.location.reload());
	}

	start(tripId: string, runningVersion?: string): void {
		this.stop();
		this.runningVersion = runningVersion;
		this.source = this.createEventSource(`/api/trips/${encodeURIComponent(tripId)}/events`);
		this.source.addEventListener('sync', this.handleSync);
	}

	stop(): void {
		if (!this.source) return;
		this.source.removeEventListener('sync', this.handleSync);
		this.source.close();
		this.source = undefined;
	}

	private readonly handleSync = (event: MessageEvent<string>): void => {
		let data: unknown;
		try {
			data = JSON.parse(event.data);
		} catch {
			return;
		}
		const parsed = liveSyncEventSchema.safeParse(data);
		if (!parsed.success) return;
		if (parsed.data.reload) {
			this.reload();
			return;
		}
		void this.activateVersion(this.runningVersion, parsed.data.version);
		if (parsed.data.state) void this.refreshState();
		for (const moduleId of new Set(parsed.data.modules)) {
			void this.refreshModules(moduleId);
		}
	};
}
