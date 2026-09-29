import type { EventV2Properties } from './events-v2';

export interface AnalyticsPreferenceState {
	linkedAnalytics: boolean;
	excludeThisBrowser: boolean;
}

export interface VisitContext {
	anonymous_browser_id: string | null;
	visit_id: string | null;
}

const IDENTITY_KEY = 'gallery-analytics-browser-v2';
const VISIT_KEY = 'gallery-analytics-visit-v2';
const PREFERENCE_KEY = 'gallery-analytics-preferences-v2';
const BROWSER_MAX_AGE = 90 * 24 * 60 * 60 * 1000;
const VISIT_IDLE = 30 * 60 * 1000;
const VISIT_MAX_AGE = 24 * 60 * 60 * 1000;

type StoredIdentity = { id: string; createdAt: number };
type StoredVisit = { id: string; startedAt: number; lastInteractionAt: number };

function newId(): string {
	return crypto.randomUUID();
}

function readJson<T>(key: string): T | null {
	try { return JSON.parse(localStorage.getItem(key) ?? 'null') as T | null; } catch { return null; }
}

function writeJson(key: string, value: unknown): boolean {
	try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}

export function defaultAnalyticsPreferences(): AnalyticsPreferenceState {
	return { linkedAnalytics: false, excludeThisBrowser: false };
}

export function getAnalyticsPreferences(): AnalyticsPreferenceState {
	if (typeof window === 'undefined') return defaultAnalyticsPreferences();
	const stored = readJson<AnalyticsPreferenceState>(PREFERENCE_KEY);
	return {
		linkedAnalytics: stored?.linkedAnalytics === true,
		excludeThisBrowser: stored?.excludeThisBrowser === true
	};
}

export function saveAnalyticsPreferences(preferences: AnalyticsPreferenceState): void {
	if (typeof window === 'undefined') return;
	writeJson(PREFERENCE_KEY, preferences);
	if (!preferences.linkedAnalytics || preferences.excludeThisBrowser) {
		try { localStorage.removeItem(IDENTITY_KEY); localStorage.removeItem(VISIT_KEY); } catch { /* Storage may be disabled. */ }
	}
}

/** Returns no persistent identity when the visitor has not opted into linked analytics. */
export function getVisitContext(now = Date.now()): VisitContext {
	if (typeof window === 'undefined' || (!getAnalyticsPreferences().linkedAnalytics || getAnalyticsPreferences().excludeThisBrowser)) {
		return { anonymous_browser_id: null, visit_id: null };
	}
	const priorIdentity = readJson<StoredIdentity>(IDENTITY_KEY);
	const identity = priorIdentity && now - priorIdentity.createdAt < BROWSER_MAX_AGE
		? priorIdentity : { id: newId(), createdAt: now };
	if (!writeJson(IDENTITY_KEY, identity)) return { anonymous_browser_id: null, visit_id: null };
	const priorVisit = readJson<StoredVisit>(VISIT_KEY);
	const active = priorVisit && now - priorVisit.lastInteractionAt < VISIT_IDLE && now - priorVisit.startedAt < VISIT_MAX_AGE
		? priorVisit : { id: newId(), startedAt: now, lastInteractionAt: now };
	active.lastInteractionAt = now;
	if (!writeJson(VISIT_KEY, active)) return { anonymous_browser_id: null, visit_id: null };
	return { anonymous_browser_id: identity.id, visit_id: active.id };
}

export function createCorrelationProperties(properties: EventV2Properties = {}): EventV2Properties {
	return { ...properties, view_id: properties.view_id ?? newId() };
}
