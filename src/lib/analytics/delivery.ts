export type DeliveryResponse = { status: number; accepted?: boolean; duplicate?: boolean };

/** One bounded retry preserves the original payload and therefore its event ID. */
export async function deliverWithSingleRetry(payload: string, send: (payload: string) => Promise<DeliveryResponse>): Promise<'accepted' | 'duplicate' | 'failed'> {
	for (let attempt = 0; attempt < 2; attempt++) {
		try {
			const result = await send(payload);
			if (result.duplicate) return 'duplicate';
			if (result.accepted) return 'accepted';
			if (result.status < 500 || attempt === 1) return 'failed';
		} catch { if (attempt === 1) return 'failed'; }
	}
	return 'failed';
}
