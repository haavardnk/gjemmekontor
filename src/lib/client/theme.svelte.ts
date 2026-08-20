export type ColorTheme = 'light' | 'dark';

export const themeStorageKey = 'gjemmekontor-theme';

export function resolveTheme(stored: string | null, prefersDark: boolean): ColorTheme {
	if (stored === 'light' || stored === 'dark') {
		return stored;
	}
	return prefersDark ? 'dark' : 'light';
}

class ThemeState {
	theme = $state<ColorTheme>('light');

	private mediaQuery: MediaQueryList | undefined;
	private started = false;

	start(): void {
		if (this.started) {
			return;
		}
		this.started = true;
		this.mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
		this.sync();
		this.mediaQuery.addEventListener('change', this.handleSystemChange);
		window.addEventListener('storage', this.handleStorage);
	}

	stop(): void {
		this.started = false;
		this.mediaQuery?.removeEventListener('change', this.handleSystemChange);
		window.removeEventListener('storage', this.handleStorage);
		this.mediaQuery = undefined;
	}

	toggle(): void {
		const next = this.theme === 'dark' ? 'light' : 'dark';
		localStorage.setItem(themeStorageKey, next);
		this.apply(next);
	}

	private sync(): void {
		this.apply(
			resolveTheme(localStorage.getItem(themeStorageKey), this.mediaQuery?.matches ?? false)
		);
	}

	private apply(theme: ColorTheme): void {
		this.theme = theme;
		document.documentElement.dataset.theme =
			theme === 'dark' ? 'gjemmekontor-dark' : 'gjemmekontor';
	}

	private readonly handleSystemChange = (): void => {
		if (localStorage.getItem(themeStorageKey) === null) {
			this.sync();
		}
	};

	private readonly handleStorage = (event: StorageEvent): void => {
		if (event.key === themeStorageKey || event.key === null) {
			this.sync();
		}
	};
}

export const themeState = new ThemeState();
