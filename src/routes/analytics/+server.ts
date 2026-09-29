import { base } from '$app/paths';
import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Existing bookmarks and shared filters now open the current dashboard.
export const GET: RequestHandler = ({ url }) => {
	redirect(308, `${base}/analytics/operator${url.search}`);
};
