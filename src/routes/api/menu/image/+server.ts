import { handleMenuImage } from '$lib/modules/menu/server';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ request }) => handleMenuImage(request);
