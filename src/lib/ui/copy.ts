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
