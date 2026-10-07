import type { SupabaseClient } from '@supabase/supabase-js';
import { fail } from '@sveltejs/kit';
import { parseReportQuery } from './report-contract';
import { savedQueryState, viewName } from './saved-views';

/**
 * Saving a view and updating its filters, for the owner. A view is a name and the filters in the address of the page
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

export async function saveViewFromPage(admin: SupabaseClient, ownerId: string | null, rawName: FormDataEntryValue | null, url: URL) {
	if (!ownerId) return fail(401, { saveError: NEEDS_SIGN_IN });
	const name = viewName(rawName);
	if (!name) return fail(400, { saveError: 'Give this view a name of 1–100 characters.' });
	const existing = await admin.from('analytics_saved_reports').select('id, name').eq('owner_id', ownerId);
	if (existing.error) return fail(503, { saveError: 'The view could not be saved, because your saved views could not be read. Nothing was created.' });
	if ((existing.data ?? []).some((row: { name: string }) => row.name.trim().toLowerCase() === name.toLowerCase())) {
		return fail(409, { saveError: `You already have a view named "${name}". Choose another name, or update that one.` });
	}
	const { error } = await admin.from('analytics_saved_reports').insert({ owner_id: ownerId, name, query: filtersFromAddress(url) });
	return error ? fail(503, { saveError: 'The view could not be saved. Nothing was created.' }) : { saved: true as const };
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
