/** Local reporting periods. 08:00 is deliberately away from DST transition hours. */
export const INTELLIGENCE_TIME_ZONE = 'America/Chicago';
export type IntelligenceBriefKind = 'daily' | 'weekly';

export type ScheduledIntelligencePeriod = {
	kind: IntelligenceBriefKind;
	/** The local date on which this brief was due, never the time it happened to run. */
	intendedPeriod: string;
	dueAt: string;
	late: boolean;
};

type ChicagoParts = { year: number; month: number; day: number; hour: number; minute: number; weekday: string };

function chicagoParts(now: Date): ChicagoParts {
	const values = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
		timeZone: INTELLIGENCE_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
		hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23'
	}).formatToParts(now).map((part) => [part.type, part.value]));
	return { year: Number(values.year), month: Number(values.month), day: Number(values.day), hour: Number(values.hour), minute: Number(values.minute), weekday: values.weekday };
}

function dateKey(parts: Pick<ChicagoParts, 'year' | 'month' | 'day'>): string {
	return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

/** Converts an ordinary Chicago wall time to UTC without assuming a fixed offset. */
export function chicagoWallTimeToUtc(day: string, hour = 8, minute = 0): string {
	let instant = Date.parse(`${day}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00Z`);
	for (let attempt = 0; attempt < 4; attempt += 1) {
		const local = chicagoParts(new Date(instant));
		const projected = Date.parse(`${dateKey(local)}T${String(local.hour).padStart(2, '0')}:${String(local.minute).padStart(2, '0')}:00Z`);
		const requested = Date.parse(`${day}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00Z`);
		instant += requested - projected;
	}
	return new Date(instant).toISOString();
}

/**
 * Returns due periods using the intended Chicago date. Persistence supplies
 * idempotency; this pure helper deliberately does not use a UTC cron key.
 */
export function dueIntelligencePeriods(now = new Date(), lateAfterMinutes = 15): ScheduledIntelligencePeriod[] {
	const local = chicagoParts(now);
	if (local.hour < 8) return [];
	const intendedPeriod = dateKey(local);
	const dueAt = chicagoWallTimeToUtc(intendedPeriod);
	const late = now.getTime() - Date.parse(dueAt) > lateAfterMinutes * 60_000;
	const daily: ScheduledIntelligencePeriod = { kind: 'daily', intendedPeriod, dueAt, late };
	return local.weekday === 'Mon' ? [daily, { kind: 'weekly', intendedPeriod, dueAt, late }] : [daily];
}

export function standardIntelligenceScopes(now = new Date()): Array<{ kind: 'gallery'; query: Record<string, unknown> } | { kind: 'sites'; period: 7 | 30 | 90; section: 'all' }> {
	const local = chicagoParts(now);
	const end = new Date(Date.UTC(local.year, local.month - 1, local.day));
	end.setUTCDate(end.getUTCDate() - 1);
	const endDay = end.toISOString().slice(0, 10);
	const start = new Date(`${endDay}T12:00:00Z`);
	start.setUTCDate(start.getUTCDate() - 29);
	return [
		{ kind: 'gallery', query: { start: start.toISOString().slice(0, 10), end: endDay, measure: 'photo_opens', scope: 'all', albumKeys: [], compare: 'previous', traffic: 'conservative' } },
		{ kind: 'sites', period: 7, section: 'all' },
		{ kind: 'sites', period: 30, section: 'all' },
		{ kind: 'sites', period: 90, section: 'all' }
	];
}
