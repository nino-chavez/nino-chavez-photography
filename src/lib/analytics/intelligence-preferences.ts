export type OperatorRetention = 'undecided' | 'until_deleted' | '90_days' | 'one_year';
export interface IntelligencePreferences {
	retention: OperatorRetention;
	externalEnabled: boolean;
	destination: string | null;
	destinationVerified: boolean;
}

/**
 * Visitor retention is a separate contract; this choice applies to private operator records.
 * Launch recaps replaced the daily and weekly toggles. A recap has no owner choice beyond retention and email, so
 * the only thing this form can save is how long private records are kept. A request that still carries a `daily`
 * or `weekly` field is refused rather than ignored, so an old client cannot believe it turned a review on.
 */
export function parseIntelligencePreferences(value: unknown): Pick<IntelligencePreferences, 'retention'> | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	const row = value as Record<string, unknown>;
	if (Object.keys(row).some(key => key !== 'retention')
		|| !['until_deleted', '90_days', 'one_year'].includes(String(row.retention))) return null;
	return { retention: row.retention as OperatorRetention };
}

export function retentionDays(retention: OperatorRetention): number | null {
	return retention === '90_days' ? 90 : retention === 'one_year' ? 365 : null;
}

/** When a recap is due, said once for every place that describes it. */
export const RECAP_SCHEDULE_COPY = 'Each album gets a recap on day 3 and day 7 after it is first public, at 8:00 AM Chicago time.';

export interface RecapSettingsLines {
	schedule: string;
	/** Whether a recap is written and stored for this owner. */
	storage: string;
	/** What email will and will not do, from the saved choice; never a claim that anything was sent. */
	email: string;
}

/**
 * What the owner's settings say about recaps, from the saved choices only. Recaps are stored per owner once private
 * record retention is chosen, so until then none is written; saying so is the point of this text.
 */
export function recapSettingsLines(preferences: IntelligencePreferences | null): RecapSettingsLines {
	if (!preferences) return { schedule: RECAP_SCHEDULE_COPY, storage: 'Whether recaps are being written could not be read.', email: 'Whether recap email is on could not be read.' };
	const storage = preferences.retention === 'undecided'
		? 'No recap is being written yet. Recaps are written for you once you choose how long to keep private records. A recap that came due before then is not written later.'
		: 'Recaps are written for you and listed on each album report, under Recaps. Only a complete one can be emailed.';
	const email = !preferences.externalEnabled
		? `Email is off, so no recap is emailed.${preferences.destinationVerified ? '' : ' There is no verified address yet.'}`
		: preferences.destinationVerified && preferences.destination
			? `Email is on for ${preferences.destination}. Only a complete recap is emailed; an incomplete one stays in the dashboard. Nothing is sent from this page.`
			: 'Email is on but has no verified address, so no recap is emailed.';
	return { schedule: RECAP_SCHEDULE_COPY, storage, email };
}
