import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	return json({
		pong: true,
		ts: Date.now(),
		env_check: {
			has_zip_secret: 'ZIP_SIGNING_SECRET' in process.env,
			has_zip_url: 'ZIP_WORKER_URL' in process.env,
			zip_url_val: process.env.ZIP_WORKER_URL || '(empty)',
			zip_secret_len: (process.env.ZIP_SIGNING_SECRET || '').length
		}
	});
};
