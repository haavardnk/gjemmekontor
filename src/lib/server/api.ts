export function apiError(code: string, status: number): Response {
	return Response.json({ error: code }, { status });
}

export function apiSuccess<T>(body: T, status = 200): Response {
	return Response.json(body, { status });
}
