import { moduleCatalog } from '$lib/app/modules/catalog';

export const knownAppShellPaths = moduleCatalog.map((module) => module.primaryPath);

export function relativeAppPath(pathname: string, base: string): string | undefined {
	if (!base) {
		return pathname;
	}
	if (pathname === base) {
		return '/';
	}
	if (!pathname.startsWith(`${base}/`)) {
		return undefined;
	}
	return pathname.slice(base.length);
}

export function isApiPath(pathname: string, base: string): boolean {
	const relative = relativeAppPath(pathname, base);
	return relative === '/api' || relative?.startsWith('/api/') === true;
}

export function isAppShellPath(
	pathname: string,
	base: string,
	appShellPaths: readonly string[] = knownAppShellPaths
): boolean {
	const relative = relativeAppPath(pathname, base);
	return appShellPaths.some((path) => path === relative);
}
