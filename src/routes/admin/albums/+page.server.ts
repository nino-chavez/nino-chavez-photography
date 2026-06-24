import { base } from '$app/paths';
import { error, redirect, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { createSupabaseServerClient, createSupabaseAdminClient } from '$lib/supabase/server-ssr';
import { isAllowedAdmin } from '$lib/server/admin-auth';

export const load: PageServerLoad = async ({ cookies }) => {
	// Check authentication
	const supabase = createSupabaseServerClient(cookies);
	const {
		data: { user }
	} = await supabase.auth.getUser();

	if (!user) {
		throw redirect(302, `${base}/login`);
	}

	if (!isAllowedAdmin(user.email)) {
		throw error(403, 'Admin access required');
	}

	// Use admin client for album_settings (RLS may block anon reads)
	const adminClient = createSupabaseAdminClient();

	// Fetch albums and settings in parallel. albums_summary is a matview (anon REVOKE'd) →
	// use the service_role adminClient (already created for album_settings).
	const [albumsResult, settingsResult] = await Promise.all([
		adminClient
			.from('albums_summary')
			.select('album_key, album_name, photo_count')
			.order('photo_count', { ascending: false }),
		adminClient
			.from('album_settings')
			.select('*')
	]);

	if (albumsResult.error) {
		console.error('[Admin Albums] Error fetching albums:', albumsResult.error);
		throw error(500, 'Failed to load albums');
	}

	// Build a map of album settings keyed by album_key
	const settingsMap = new Map(
		(settingsResult.data || []).map((s: any) => [s.album_key, s])
	);

	// Merge albums with their settings
	const albums = (albumsResult.data || []).map((album: any) => {
		const settings = settingsMap.get(album.album_key);
		return {
			albumKey: album.album_key,
			albumName: album.album_name || 'Unknown Album',
			photoCount: parseInt(album.photo_count) || 0,
			visibility: (settings?.visibility || 'public') as 'public' | 'unlisted',
			shareToken: settings?.share_token || null
		};
	});

	return {
		albums,
		user: { id: user.id, email: user.email }
	};
};

export const actions = {
	toggleVisibility: async ({ request, cookies }) => {
		const supabase = createSupabaseServerClient(cookies);
		const {
			data: { user }
		} = await supabase.auth.getUser();

		if (!user) {
			return fail(401, { error: 'Unauthorized' });
		}

		if (!isAllowedAdmin(user.email)) {
			return fail(403, { error: 'Admin access required' });
		}

		const formData = await request.formData();
		const albumKey = formData.get('albumKey')?.toString();
		const currentVisibility = formData.get('currentVisibility')?.toString();

		if (!albumKey) {
			return fail(400, { error: 'Album key required' });
		}

		const adminClient = createSupabaseAdminClient();

		if (currentVisibility === 'unlisted') {
			// Switch back to public: delete the settings row
			const { error: deleteError } = await adminClient
				.from('album_settings')
				.delete()
				.eq('album_key', albumKey);

			if (deleteError) {
				console.error('[Admin Albums] Error making album public:', deleteError);
				return fail(500, { error: 'Failed to update album' });
			}
		} else {
			// Switch to unlisted: upsert settings row
			const { error: upsertError } = await adminClient
				.from('album_settings')
				.upsert(
					{ album_key: albumKey, visibility: 'unlisted', updated_at: new Date().toISOString() },
					{ onConflict: 'album_key' }
				);

			if (upsertError) {
				console.error('[Admin Albums] Error making album unlisted:', upsertError);
				return fail(500, { error: 'Failed to update album' });
			}
		}

		return { success: true };
	},

	regenerateToken: async ({ request, cookies }) => {
		const supabase = createSupabaseServerClient(cookies);
		const {
			data: { user }
		} = await supabase.auth.getUser();

		if (!user) {
			return fail(401, { error: 'Unauthorized' });
		}

		if (!isAllowedAdmin(user.email)) {
			return fail(403, { error: 'Admin access required' });
		}

		const formData = await request.formData();
		const albumKey = formData.get('albumKey')?.toString();

		if (!albumKey) {
			return fail(400, { error: 'Album key required' });
		}

		const adminClient = createSupabaseAdminClient();

		// Generate new UUID for share token using crypto
		const newToken = crypto.randomUUID();

		const { error: updateError } = await adminClient
			.from('album_settings')
			.update({ share_token: newToken, updated_at: new Date().toISOString() })
			.eq('album_key', albumKey);

		if (updateError) {
			console.error('[Admin Albums] Error regenerating token:', updateError);
			return fail(500, { error: 'Failed to regenerate link' });
		}

		return { success: true };
	}
} satisfies Actions;
