type CacheEntry = {
	value: unknown;
	until: number;
	bytes: number;
};

export type ProviderCache = ReturnType<typeof createProviderCache>;

export class ProviderCacheCapacityError extends Error {
	constructor() {
		super('Provider read capacity is full');
		this.name = 'ProviderCacheCapacityError';
	}
}

function normalized(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(normalized);
	if (!value || typeof value !== 'object') return value;
	return Object.fromEntries(Object.entries(value as Record<string, unknown>)
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([key, child]) => [key, normalized(child)]));
}

function encoded(value: unknown): string {
	const result = JSON.stringify(normalized(value));
	if (typeof result !== 'string') throw new TypeError('Provider cache keys and values must be serializable');
	return result;
}

function byteLength(value: string): number {
	return new TextEncoder().encode(value).byteLength;
}

/** Opaque identity for a server credential. The credential itself is never used as a cache key. */
export async function credentialIdentity(credential: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(credential));
	return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

export function createProviderCache(options: {
	ttlMs: number;
	maxEntries: number;
	maxInFlight: number;
	maxBytes: number;
	now?: () => number;
}) {
	const now = options.now ?? Date.now;
	const entries = new Map<string, CacheEntry>();
	const inFlight = new Map<string, Promise<unknown>>();
	let storedBytes = 0;

	function remove(key: string): void {
		const entry = entries.get(key);
		if (!entry) return;
		storedBytes -= entry.bytes;
		entries.delete(key);
	}

	function removeExpired(at: number): void {
		for (const [key, entry] of entries) {
			if (entry.until <= at) remove(key);
		}
	}

	function store(key: string, value: unknown): void {
		let valueJson: string;
		try {
			valueJson = encoded(value);
		} catch {
			return;
		}
		const bytes = byteLength(key) + byteLength(valueJson);
		if (bytes > options.maxBytes) return;
		removeExpired(now());
		remove(key);
		while (entries.size >= options.maxEntries || storedBytes + bytes > options.maxBytes) {
			const oldest = entries.keys().next().value as string | undefined;
			if (oldest === undefined) break;
			remove(oldest);
		}
		entries.set(key, { value, until: now() + options.ttlMs, bytes });
		storedBytes += bytes;
	}

	return {
		async getOrLoad<T>(
			keyParts: unknown,
			load: () => Promise<T>,
			loadOptions: { cacheWhen?: (value: T) => boolean } = {}
		): Promise<T> {
			const key = encoded(keyParts);
			if (byteLength(key) > options.maxBytes) throw new ProviderCacheCapacityError();
			const at = now();
			const hit = entries.get(key);
			if (hit && hit.until > at) {
				entries.delete(key);
				entries.set(key, hit);
				return hit.value as T;
			}
			if (hit) remove(key);
			const pending = inFlight.get(key);
			if (pending) return pending as Promise<T>;
			if (inFlight.size >= options.maxInFlight) throw new ProviderCacheCapacityError();

			const started = load().then((value) => {
				if (loadOptions.cacheWhen?.(value) ?? true) store(key, value);
				return value;
			});
			inFlight.set(key, started);
			try {
				return await started;
			} finally {
				if (inFlight.get(key) === started) inFlight.delete(key);
			}
		},
		clear(): void {
			entries.clear();
			inFlight.clear();
			storedBytes = 0;
		},
		stats(): { entries: number; inFlight: number; bytes: number } {
			removeExpired(now());
			return { entries: entries.size, inFlight: inFlight.size, bytes: storedBytes };
		}
	};
}
