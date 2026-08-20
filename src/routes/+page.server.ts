import { redirect } from '@sveltejs/kit';

export function load(): never {
	redirect(303, '/map');
}
