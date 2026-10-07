import { UNSTORED_REJECTION_REASONS } from './rejection-reasons';

/** Collection and provider-delivery health as `analytics_posthog_delivery_health` returns it, parsed once for every page that shows it. */
export type MeasurementHealth = {
	available:boolean; schemaVersion:number | null; pending:number | null; submitted:number | null; confirmed:number | null; failed:number | null;
	controlPending:number | null; oldestPendingAt:string | null; oldestSubmittedAt:string | null; confirmedWatermark:string | null;
	accepted:number | null; rejected:number | null; duplicate:number | null; quotaBillingState:'unknown'; eligibleObservations:number | null; eligibleDays:number | null;
	forecast30Days:number | null; forecastLimit:string;
	/** Refused events by Chicago day and reason, last 30 days; null when the reading has no such list (before migration 20261007180000). */
	rejectedDays:RejectionDay[] | null;
};

export type RejectionDay = { day:string; reason:string; count:number };

function numberOrNull(value: unknown): number | null {
	return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

export function parseMeasurementHealth(value: unknown): MeasurementHealth {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return { available:false, schemaVersion:null, pending:null, submitted:null, confirmed:null, failed:null, controlPending:null, oldestPendingAt:null, oldestSubmittedAt:null, confirmedWatermark:null, accepted:null, rejected:null, duplicate:null, quotaBillingState:'unknown', eligibleObservations:null, eligibleDays:null, forecast30Days:null, forecastLimit:'Delivery health is unavailable. This is not a zero or healthy result.', rejectedDays:null };
	const source=value as Record<string,unknown>;
	const collection=source.collection && typeof source.collection==='object' && !Array.isArray(source.collection) ? source.collection as Record<string,unknown> : {};
	const eligibleObservations=numberOrNull(source.eligible_observations_14d);
	const eligibleDays=numberOrNull(source.eligible_days_observed);
	const rejectedDays=parseRejectionDays(source.collection_rejected_days);
	const forecast30Days=eligibleObservations !== null && eligibleDays !== null && eligibleDays > 0 ? Math.round((eligibleObservations / eligibleDays) * 30) : null;
	return {
		available:true, schemaVersion:numberOrNull(source.schema_version), pending:numberOrNull(source.pending), submitted:numberOrNull(source.submitted), confirmed:numberOrNull(source.confirmed), failed:numberOrNull(source.failed), controlPending:numberOrNull(source.control_pending),
		oldestPendingAt:typeof source.oldest_pending_at==='string'?source.oldest_pending_at:null, oldestSubmittedAt:typeof source.oldest_submitted_at==='string'?source.oldest_submitted_at:null, confirmedWatermark:typeof source.confirmed_watermark==='string'?source.confirmed_watermark:null,
		accepted:numberOrNull(collection.accepted), rejected:numberOrNull(collection.rejected), duplicate:numberOrNull(collection.duplicate), quotaBillingState:'unknown', eligibleObservations, eligibleDays, forecast30Days,
		forecastLimit:forecast30Days === null ? 'No forecast is available until eligible observations cover at least one measured day. This does not imply zero traffic.' : `A simple 30-day estimate from ${(eligibleObservations ?? 0).toLocaleString()} eligible observations across ${eligibleDays ?? 0} days with eligible activity. Days with no eligible events are excluded, so this active-day estimate may overstate a calendar-month total; partial days and traffic changes add uncertainty.`,
		rejectedDays
	};
}

/** The health reading's `collection_rejected_days`. Null when the list is absent or malformed: unknown, never zero. */
export function parseRejectionDays(value: unknown): RejectionDay[] | null {
	if (!Array.isArray(value)) return null;
	const days: RejectionDay[] = [];
	for (const row of value) {
		if (!row || typeof row !== 'object') return null;
		const { day, reason, count } = row as Record<string, unknown>;
		if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day) || typeof reason !== 'string' || numberOrNull(count) === null) return null;
		days.push({ day, reason, count: count as number });
	}
	return days;
}

/** The rejection reading from a raw health result; null when the result or its day list could not be read. */
export function rejectionsFromHealth(data: unknown, lastCompleteDay: string): RejectionReading | null {
	const days = data && typeof data === 'object' && !Array.isArray(data) ? parseRejectionDays((data as Record<string, unknown>).collection_rejected_days) : null;
	return days ? rejectionReading(days, lastCompleteDay) : null;
}

/** Complete days before the one being judged that set the usual rate. */
export const REJECTION_BASELINE_DAYS = 14;
/** Fewer earlier days than this and no usual rate is stated. */
const REJECTION_MIN_BASELINE_DAYS = 3;
/** A surge is at least this many times the usual rate, and at least `REJECTION_SURGE_FLOOR` more than it. */
const REJECTION_SURGE_RATIO = 5;
const REJECTION_SURGE_FLOOR = 500;

export interface RejectionReading {
	/** The last complete Chicago day, the one judged. */
	day: string;
	count: number;
	/**
	 * The usual refusals a day: the lower quartile of the complete days before, back to the first day with a record.
	 * A quartile, not the median, so a surge lasting several days does not become the usual rate. Null with fewer
	 * than three earlier days recorded.
	 */
	usual: number | null;
	surge: boolean;
	/** The judged day's refusals by kind: known crawlers, events that could not be stored, refusals counted before reasons were kept, and the rest (not valid, or an album or photo that does not exist). */
	crawler: number;
	unstored: number;
	notRecorded: number;
	other: number;
}

/** The last complete day's refusals against the usual rate, and what they were. Null when no refusal has ever been recorded. */
export function rejectionReading(days: RejectionDay[], lastCompleteDay: string): RejectionReading | null {
	if (!days.length) return null;
	const totals = new Map<string, number>();
	for (const row of days) totals.set(row.day, (totals.get(row.day) ?? 0) + row.count);
	const first = days.reduce((min, row) => (row.day < min ? row.day : min), days[0].day);
	const earlier: number[] = [];
	for (let back = 1; back <= REJECTION_BASELINE_DAYS; back++) {
		const day = shiftDay(lastCompleteDay, -back);
		if (day < first) break;
		earlier.push(totals.get(day) ?? 0);
	}
	const usual = earlier.length >= REJECTION_MIN_BASELINE_DAYS ? [...earlier].sort((a, b) => a - b)[Math.floor((earlier.length - 1) / 4)] : null;
	const count = totals.get(lastCompleteDay) ?? 0;
	const onDay = days.filter((row) => row.day === lastCompleteDay);
	const sum = (match: (reason: string) => boolean) => onDay.filter((row) => match(row.reason)).reduce((total, row) => total + row.count, 0);
	const crawler = sum((reason) => reason === 'known_crawler');
	const unstored = sum((reason) => UNSTORED_REJECTION_REASONS.has(reason));
	const notRecorded = sum((reason) => reason === 'not_recorded');
	return {
		day: lastCompleteDay, count, usual,
		surge: usual !== null && count >= usual * REJECTION_SURGE_RATIO && count - usual >= REJECTION_SURGE_FLOOR,
		crawler, unstored, notRecorded, other: count - crawler - unstored - notRecorded
	};
}

function shiftDay(day: string, by: number): string {
	const date = new Date(`${day}T12:00:00Z`);
	date.setUTCDate(date.getUTCDate() + by);
	return date.toISOString().slice(0, 10);
}
