import type { RequestHandler } from './$types';

export const PUT: RequestHandler = () => new Response(null, { status: 204 });
