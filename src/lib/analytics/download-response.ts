/** A ZIP entry must be a successful image response, never a 200 HTML/error payload. */
export function isDownloadableImageResponse(response: Pick<Response, 'ok' | 'headers'>): boolean {
	const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
	return response.ok && contentType.startsWith('image/');
}
