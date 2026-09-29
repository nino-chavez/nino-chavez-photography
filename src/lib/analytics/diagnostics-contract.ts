export interface DownloadDiagnosticInput { type: 'download'; status: 'requested' | 'failed'; photo_id?: string; album_key?: string; source?: string; error_code?: string | null; result_count?: number | null; }

/** `null` is a normal optional error value from the browser client, not a rejected diagnostic. */
export function parseDownloadDiagnostic(input: unknown): DownloadDiagnosticInput | null {
	if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
	const value = input as Record<string, unknown>;
	if (value.type !== 'download' || (value.status !== 'requested' && value.status !== 'failed')) return null;
	if (typeof value.photo_id !== 'string' && typeof value.album_key !== 'string') return null;
	if (value.error_code !== undefined && value.error_code !== null && typeof value.error_code !== 'string') return null;
	if (value.result_count !== undefined && value.result_count !== null && (!Number.isInteger(value.result_count) || Number(value.result_count) < 0)) return null;
	return value as DownloadDiagnosticInput;
}
