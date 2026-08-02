import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { SITE_URL } from '$lib/site-url';

export const load: PageServerLoad = ({ url }) => {
	const destination = new URL(SITE_URL);
	destination.search = url.search;
	redirect(308, destination.toString());
};
