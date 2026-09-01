export type CookingGesture = 'ingredients' | 'next' | 'previous';
export type PointerPosition = { x: number; y: number };
export type WakeLockState = { supported: boolean; active: boolean };

export function cookingGesture(
	start: PointerPosition,
	end: PointerPosition,
	showingIngredients: boolean
): CookingGesture | undefined {
	const deltaX = end.x - start.x;
	const deltaY = end.y - start.y;
	if (Math.abs(deltaX) > 56 && Math.abs(deltaX) > Math.abs(deltaY) * 1.15) {
		return 'ingredients';
	}
	if (showingIngredients || Math.abs(deltaY) <= 56) return undefined;
	return deltaY < 0 ? 'next' : 'previous';
}

type LockedScroll = {
	x: number;
	y: number;
	rootOverflow: string;
	bodyStyles: Pick<CSSStyleDeclaration, 'position' | 'top' | 'left' | 'width' | 'overflow'>;
};

export class CookingBrowserSession {
	private wakeLock: WakeLockSentinel | undefined;
	private lockedScroll: LockedScroll | undefined;
	private running = false;
	private mounted = false;

	constructor(private readonly onWakeLockState: (state: WakeLockState) => void) {}

	mount(): () => void {
		this.mounted = true;
		this.publishWakeLock(false);
		document.addEventListener('visibilitychange', this.handleVisibility);
		return (): void => this.destroy();
	}

	async start(): Promise<void> {
		this.running = true;
		this.lockScroll();
		await this.requestWakeLock();
	}

	async stop(): Promise<void> {
		this.running = false;
		this.unlockScroll();
		const sentinel = this.wakeLock;
		this.wakeLock = undefined;
		await sentinel?.release();
		this.publishWakeLock(false);
	}

	private destroy(): void {
		if (!this.mounted) return;
		this.mounted = false;
		document.removeEventListener('visibilitychange', this.handleVisibility);
		void this.stop();
	}

	private readonly handleVisibility = (): void => {
		if (this.running && document.visibilityState === 'visible' && !this.wakeLock) {
			void this.requestWakeLock();
		}
	};

	private publishWakeLock(active: boolean): void {
		this.onWakeLockState({ supported: 'wakeLock' in navigator, active });
	}

	private async requestWakeLock(): Promise<void> {
		if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') {
			this.publishWakeLock(false);
			return;
		}
		try {
			const sentinel = await navigator.wakeLock.request('screen');
			if (!this.running) {
				await sentinel.release();
				return;
			}
			this.wakeLock = sentinel;
			this.publishWakeLock(true);
			sentinel.addEventListener('release', () => {
				if (this.wakeLock !== sentinel) return;
				this.wakeLock = undefined;
				this.publishWakeLock(false);
			});
		} catch {
			this.wakeLock = undefined;
			this.publishWakeLock(false);
		}
	}

	private lockScroll(): void {
		if (this.lockedScroll) return;
		this.lockedScroll = {
			x: window.scrollX,
			y: window.scrollY,
			rootOverflow: document.documentElement.style.overflow,
			bodyStyles: {
				position: document.body.style.position,
				top: document.body.style.top,
				left: document.body.style.left,
				width: document.body.style.width,
				overflow: document.body.style.overflow
			}
		};
		document.documentElement.style.overflow = 'hidden';
		Object.assign(document.body.style, {
			position: 'fixed',
			top: `${-this.lockedScroll.y}px`,
			left: `${-this.lockedScroll.x}px`,
			width: '100%',
			overflow: 'hidden'
		});
	}

	private unlockScroll(): void {
		const locked = this.lockedScroll;
		if (!locked) return;
		this.lockedScroll = undefined;
		document.documentElement.style.overflow = locked.rootOverflow;
		Object.assign(document.body.style, locked.bodyStyles);
		window.scrollTo(locked.x, locked.y);
	}
}
