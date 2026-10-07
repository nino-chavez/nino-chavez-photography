import type { SupabaseClient } from '@supabase/supabase-js';
import { fail } from '@sveltejs/kit';
import { deletedNote, editedNote, newNote, NOTES_LIMIT, type SharingNote } from './sharing-notes';

/**
 * The owner's sharing notes for one album. The caller has already proved the owner. Every read and write is
 * scoped to that owner and that album, so a note id from another album, or another owner, changes nothing.
 */

export async function loadSharingNotes(admin: SupabaseClient, albumKey: string, ownerId: string): Promise<{ notes: SharingNote[]; available: boolean }> {
	const { data, error } = await admin.from('analytics_sharing_annotations').select('id, activity_date, channel, note, updated_at')
		.eq('album_key', albumKey).eq('created_by', ownerId).order('activity_date', { ascending: false }).order('id', { ascending: false }).limit(NOTES_LIMIT);
	if (error) {
		console.error('[sharing notes] unavailable:', error.message);
		return { notes: [], available: false };
	}
	return { notes: (data ?? []).map((row) => ({ id: String(row.id), activityDate: String(row.activity_date), channel: String(row.channel), note: String(row.note), updatedAt: row.updated_at ? String(row.updated_at) : null })), available: true };
}

export async function addSharingNote(admin: SupabaseClient, albumKey: string, ownerId: string, form: FormData) {
	const parsed = newNote(form);
	if (!parsed.ok) return fail(400, { noteError: parsed.error });
	// The note is for an album that exists, so a note never points at a key nobody can open.
	const album = await admin.from('albums_summary').select('album_key').eq('album_key', albumKey).maybeSingle();
	if (album.error || !album.data) return fail(album.error ? 503 : 404, { noteError: album.error ? 'The note could not be saved. Nothing was created.' : 'That album does not exist. Nothing was created.' });
	const { error } = await admin.from('analytics_sharing_annotations').insert({ album_key: albumKey, activity_date: parsed.activityDate, channel: parsed.channel, note: parsed.note, created_by: ownerId });
	return error ? fail(503, { noteError: 'The note could not be saved. Nothing was created.' }) : { noteAdded: true as const };
}

export async function updateSharingNote(admin: SupabaseClient, albumKey: string, ownerId: string, form: FormData) {
	const parsed = editedNote(form);
	if (!parsed.ok) return fail(400, { noteError: parsed.error });
	const { error } = await admin.from('analytics_sharing_annotations').update({ channel: parsed.channel, note: parsed.note, updated_at: new Date().toISOString() })
		.eq('id', parsed.id).eq('created_by', ownerId).eq('album_key', albumKey);
	return error ? fail(503, { noteError: 'The note could not be updated. It is unchanged.' }) : { noteUpdated: true as const };
}

export async function deleteSharingNote(admin: SupabaseClient, albumKey: string, ownerId: string, form: FormData) {
	const parsed = deletedNote(form);
	if (!parsed.ok) return fail(400, { noteError: parsed.error });
	const { error } = await admin.from('analytics_sharing_annotations').delete().eq('id', parsed.id).eq('created_by', ownerId).eq('album_key', albumKey);
	return error ? fail(503, { noteError: 'The note could not be deleted. It is still saved.' }) : { noteDeleted: true as const };
}
