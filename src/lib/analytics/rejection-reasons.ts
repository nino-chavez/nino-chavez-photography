/* Pure and dependency-free: the browser reads these through the data page, so nothing server-only may be imported here. */

/**
 * Why the collector refused an event. The counter table's CHECK holds the same list, plus `not_recorded` for
 * refusals counted before reasons were kept (2026-10-07).
 */
export const COLLECTION_REJECTION_REASONS = ['known_crawler', 'invalid_json', 'invalid_event', 'unknown_target', 'target_lookup_failed', 'album_lookup_failed', 'accept_failed'] as const;
export type CollectionRejectionReason = (typeof COLLECTION_REJECTION_REASONS)[number];
/** Refusals that answered 503: the event was not stored, and the browser retries it once. */
export const UNSTORED_REJECTION_REASONS: ReadonlySet<string> = new Set<CollectionRejectionReason>(['target_lookup_failed', 'album_lookup_failed', 'accept_failed']);
