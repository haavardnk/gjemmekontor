const mapErrors: Record<string, string> = {
	MAP_ACCESS_DENIED: 'Google-kartet er ikke delt med alle som har lenken.',
	MAP_NOT_FOUND: 'Finner ikke Google-kartet.',
	MAP_TIMEOUT: 'Google brukte for lang tid på å svare.',
	MAP_TOO_LARGE: 'Google-kartet er for stort til å lastes inn.',
	MAP_INVALID_RESPONSE: 'Google sendte kartdata som ikke kunne leses.',
	MAP_UNAVAILABLE: 'Google-kartet er ikke tilgjengelig nå.',
	UNAUTHENTICATED: 'Økten er utløpt. Logg inn på nytt.'
};

export function mapErrorMessage(code: string | undefined): string {
	return code
		? (mapErrors[code] ?? 'Kartet kunne ikke lastes inn.')
		: 'Kartet kunne ikke lastes inn.';
}

const handlelisteErrors: Record<string, string> = {
	BRING_NOT_CONFIGURED: 'Handlelisten er ikke koblet til Bring ennå.',
	BRING_AUTH_FAILED: 'Bring-kontoen kunne ikke kobles til.',
	BRING_LIST_NOT_FOUND: 'Finner ikke den valgte listen i Bring.',
	BRING_UNAVAILABLE: 'Bring er ikke tilgjengelig akkurat nå.',
	BRING_MUTATION_FAILED: 'Bring lagret ikke endringen. Vi hentet listen på nytt.',
	INVALID_REQUEST: 'Varen kunne ikke lagres.',
	UNAUTHENTICATED: 'Økten er utløpt. Logg inn på nytt.'
};

export function handlelisteErrorMessage(code: string | undefined): string {
	return code
		? (handlelisteErrors[code] ?? 'Handlelisten kunne ikke oppdateres.')
		: 'Handlelisten kunne ikke oppdateres.';
}
