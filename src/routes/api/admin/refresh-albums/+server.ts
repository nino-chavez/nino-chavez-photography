/**
 * API endpoint to refresh albums_summary materialized view
 *
 * Usage: POST /api/admin/refresh-albums
 * (Can be called from browser console or curl)
 */

import { supabaseServer } from '$lib/supabase/server';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async () => {
	try {
		console.log('🔄 Refreshing albums_summary materialized view...');

		// Use the refresh function from the database
		const { error } = await supabaseServer.rpc('refresh_albums_summary');

		if (error) {
			console.error('❌ Failed to refresh view:', error);
			return json(
				{
					success: false,
					error: error.message,
					message: 'Failed to refresh albums view. The view might be in use or need manual refresh.'
				},
				{ status: 500 }
			);
		}

		console.log('✅ Materialized view refreshed successfully!');
		return json({
			success: true,
			message: 'Albums view refreshed successfully. Reload the albums page to see changes.'
		});
	} catch (err) {
		console.error('❌ Error:', err);
		return json(
			{
				success: false,
				error: err instanceof Error ? err.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};

// Allow GET for easy testing in browser
export const GET: RequestHandler = async () => {
	return json({
		message: 'Use POST to refresh the albums view',
		usage: 'curl -X POST /api/admin/refresh-albums'
	});
};
