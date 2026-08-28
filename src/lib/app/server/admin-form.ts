import type { MapMode } from '$lib/modules/map/domain/types';
import { BringServiceError } from '$lib/modules/shopping-list/server/bring';

export function formText(form: FormData, name: string): string {
	const value = form.get(name);
	return typeof value === 'string' ? value : '';
}

export function formMapMode(form: FormData): MapMode {
	const value = formText(form, 'mapDefaultMode');
	return value === 'nautical' || value === 'satellite' ? value : 'normal';
}

const bringMessages: Record<BringServiceError['code'], string> = {
	BRING_NOT_CONFIGURED: 'Bring-legitimasjon mangler på serveren.',
	BRING_AUTH_FAILED: 'Bring-legitimasjonen ble avvist.',
	BRING_LIST_NOT_FOUND: 'Bring-listen finnes ikke eller kontoen har ikke tilgang.',
	BRING_LIST_NAME_CONFLICT: 'Det finnes allerede en Bring-liste med dette navnet.',
	BRING_LIST_CREATE_FAILED: 'Bring klarte ikke å opprette listen.',
	BRING_UNAVAILABLE: 'Bring er ikke tilgjengelig akkurat nå.',
	BRING_MUTATION_FAILED: 'Bring lagret ikke endringen.'
};

export function bringErrorMessage(
	cause: unknown,
	overrides: Partial<typeof bringMessages> = {}
): string | undefined {
	return cause instanceof BringServiceError
		? (overrides[cause.code] ?? bringMessages[cause.code])
		: undefined;
}
