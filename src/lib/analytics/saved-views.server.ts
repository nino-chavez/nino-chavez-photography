import type { SupabaseClient } from '@supabase/supabase-js';
import { fail } from '@sveltejs/kit';
import { parseReportQuery } from './report-contract';
import { savedQueryState, viewName } from './saved-views';

/**
 * Saving, updating, renaming and deleting a view, for the owner. Settings and the photo explorer both write through here. A view is a name and the filters in the address of the page
 * it was made on; nothing about the numbers is stored. The caller has already sent a visitor to sign in; the
 * functions still refuse when they are given no owner, so a missing check upstream is a refusal and not a write.
 *
 * Names: two views may not share a name (compared ignoring case and surrounding spaces), because "Update" and "Open"
 * would then point at two things called the same. The table has no unique constraint, so the check is made here.
 */

/** The filters the address carries: exactly what the page parsed, in the stored shape. */
export function filtersFromAddress(url: URL, now = new Date()) {
	return savedQueryState(parseReportQuery(url.searchParams, now));
}

const NEEDS_SIGN_IN = 'Sign in to save views. Nothing was saved.';

/** True when the owner already has another view by this name. Null when the names could not be read. */
async function nameTaken(admin: SupabaseClient, ownerId: string, name: string, exceptId: string | null = null): Promise<boolean | null> {
	const existing = await admin.from('analytics_saved_reports').select('id, name').eq('owner_id', ownerId);
	if (existing.error) return null;
	return (existing.data ?? []).some((row: { id: string; name: string }) => row.id !== exceptId && row.name.trim().toLowerCase() === name.trim().toLowerCase());
}

const taken = (name: string) => `You already have a view named "${name}". Choose another name, or update that one.`;

/** Stores a new view for the owner. Both the photo explorer and settings save through here, so both refuse a taken name. */
export async function insertView(admin: SupabaseClient, ownerId: string | null, name: string, query: ReturnType<typeof savedQueryState>) {
	if (!ownerId) return fail(401, { saveError: NEEDS_SIGN_IN });
	const clash = await nameTaken(admin, ownerId, name);
	if (clash === null) return fail(503, { saveError: 'The view could not be saved, because your saved views could not be read. Nothing was created.' });
	if (clash) return fail(409, { saveError: taken(name) });
	const { error } = await admin.from('analytics_saved_reports').insert({ owner_id: ownerId, name, query });
	return error ? fail(503, { saveError: 'The view could not be saved. Nothing was created.' }) : { saved: true as const };
}

export async function saveViewFromPage(admin: SupabaseClient, ownerId: string | null, rawName: FormDataEntryValue | null, url: URL) {
	if (!ownerId) return fail(401, { saveError: NEEDS_SIGN_IN });
	const name = viewName(rawName);
	if (!name) return fail(400, { saveError: 'Give this view a name of 1–100 characters.' });
	return insertView(admin, ownerId, name, filtersFromAddress(url));
}

/** Renames one of the owner's views. A taken name, or a view that is not theirs or not there, changes nothing and says so. */
export async function renameView(admin: SupabaseClient, ownerId: string | null, id: string, name: string) {
	if (!ownerId) return fail(401, { renameError: 'Sign in to rename views. Nothing changed.', renameId: id });
	const clash = await nameTaken(admin, ownerId, name, id);
	if (clash === null) return fail(503, { renameError: 'The view could not be renamed, because your saved views could not be read. Its name is unchanged.', renameId: id });
	if (clash) return fail(409, { renameError: taken(name), renameId: id });
	const { data, error } = await admin.from('analytics_saved_reports').update({ name, updated_at: new Date().toISOString() }).eq('id', id).eq('owner_id', ownerId).select('id');
	if (error) return fail(503, { renameError: 'The view could not be renamed. Its name is unchanged.', renameId: id });
	if (!data || data.length === 0) return fail(404, { renameError: 'That view was not found among your saved views. Nothing changed.', renameId: id });
	return { renamed: true as const };
}

/** Deletes one of the owner's views. One that is not theirs, or already gone, is reported, not counted as deleted. */
export async function deleteView(admin: SupabaseClient, ownerId: string | null, id: string) {
	if (!ownerId) return fail(401, { deleteError: 'Sign in to delete views. Nothing was deleted.' });
	const { data, error } = await admin.from('analytics_saved_reports').delete().eq('id', id).eq('owner_id', ownerId).select('id');
	if (error) return fail(503, { deleteError: 'The view could not be deleted. It is still saved.' });
	if (!data || data.length === 0) return fail(404, { deleteError: 'That view was not found among your saved views. Nothing was deleted.' });
	return { deleted: true as const };
}

export async function updateViewFromPage(admin: SupabaseClient, ownerId: string | null, rawId: FormDataEntryValue | null, url: URL) {
	if (!ownerId) return fail(401, { updateError: 'Sign in to update views. Nothing changed.' });
	const id = typeof rawId === 'string' ? rawId.trim() : '';
	if (!id) return fail(400, { updateError: 'Choose a view to update.' });
	// A view that is someone else's, or not there, matches no row: that is a refusal, not a success.
	const { data, error } = await admin.from('analytics_saved_reports').update({ query: filtersFromAddress(url), updated_at: new Date().toISOString() }).eq('id', id).eq('owner_id', ownerId).select('id');
	if (error) return fail(503, { updateError: 'The view could not be updated. Its filters are unchanged.' });
	if (!data || data.length === 0) return fail(404, { updateError: 'That view was not found among your saved views. Nothing changed.' });
	return { updated: true as const, updatedId: id };
}
