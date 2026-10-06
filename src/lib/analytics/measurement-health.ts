/** Collection and provider-delivery health as `analytics_posthog_delivery_health` returns it, parsed once for every page that shows it. */
export type MeasurementHealth = {
	available:boolean; schemaVersion:number | null; pending:number | null; submitted:number | null; confirmed:number | null; failed:number | null;
	controlPending:number | null; oldestPendingAt:string | null; oldestSubmittedAt:string | null; confirmedWatermark:string | null;
	accepted:number | null; rejected:number | null; duplicate:number | null; quotaBillingState:'unknown'; eligibleObservations:number | null; eligibleDays:number | null;
	forecast30Days:number | null; forecastLimit:string;
};

function numberOrNull(value: unknown): number | null {
	return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

export function parseMeasurementHealth(value: unknown): MeasurementHealth {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return { available:false, schemaVersion:null, pending:null, submitted:null, confirmed:null, failed:null, controlPending:null, oldestPendingAt:null, oldestSubmittedAt:null, confirmedWatermark:null, accepted:null, rejected:null, duplicate:null, quotaBillingState:'unknown', eligibleObservations:null, eligibleDays:null, forecast30Days:null, forecastLimit:'Delivery health is unavailable. This is not a zero or healthy result.' };
	const source=value as Record<string,unknown>;
	const collection=source.collection && typeof source.collection==='object' && !Array.isArray(source.collection) ? source.collection as Record<string,unknown> : {};
	const eligibleObservations=numberOrNull(source.eligible_observations_14d);
	const eligibleDays=numberOrNull(source.eligible_days_observed);
	const forecast30Days=eligibleObservations !== null && eligibleDays !== null && eligibleDays > 0 ? Math.round((eligibleObservations / eligibleDays) * 30) : null;
	return {
		available:true, schemaVersion:numberOrNull(source.schema_version), pending:numberOrNull(source.pending), submitted:numberOrNull(source.submitted), confirmed:numberOrNull(source.confirmed), failed:numberOrNull(source.failed), controlPending:numberOrNull(source.control_pending),
		oldestPendingAt:typeof source.oldest_pending_at==='string'?source.oldest_pending_at:null, oldestSubmittedAt:typeof source.oldest_submitted_at==='string'?source.oldest_submitted_at:null, confirmedWatermark:typeof source.confirmed_watermark==='string'?source.confirmed_watermark:null,
		accepted:numberOrNull(collection.accepted), rejected:numberOrNull(collection.rejected), duplicate:numberOrNull(collection.duplicate), quotaBillingState:'unknown', eligibleObservations, eligibleDays, forecast30Days,
		forecastLimit:forecast30Days === null ? 'No forecast is available until eligible observations cover at least one measured day. This does not imply zero traffic.' : `A simple 30-day estimate from ${(eligibleObservations ?? 0).toLocaleString()} eligible observations across ${eligibleDays ?? 0} days with eligible activity. Days with no eligible events are excluded, so this active-day estimate may overstate a calendar-month total; partial days and traffic changes add uncertainty.`
	};
}
