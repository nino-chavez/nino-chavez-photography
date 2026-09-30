type Entry<T> = { value: T; expiresAt: number; bytes: number; touchedAt: number };

export class BoundedSingleFlightCache<T> {
	private readonly entries = new Map<string, Entry<T>>();
	private readonly flights = new Map<string, Promise<T>>();
	private bytes = 0;

	constructor(private readonly options: { ttlMs: number; maxEntries: number; maxBytes: number; maxInFlight?: number; now?: () => number }) {}

	async get(key: string, load: () => Promise<T>): Promise<T> {
		const now = this.options.now?.() ?? Date.now();
		this.prune(now);
		const cached = this.entries.get(key);
		if (cached && cached.expiresAt > now) {
			cached.touchedAt = now;
			return cached.value;
		}
		const active = this.flights.get(key);
		if (active) return active;
		if (this.flights.size >= (this.options.maxInFlight ?? 2)) throw new Error('Analytics evidence capacity is full; retry shortly.');
		const flight = load().then((value) => {
			const storedAt = this.options.now?.() ?? Date.now();
			const bytes = new TextEncoder().encode(JSON.stringify(value)).byteLength;
			if (bytes <= this.options.maxBytes) {
				this.entries.set(key, { value, bytes, expiresAt: storedAt + this.options.ttlMs, touchedAt: storedAt });
				this.bytes += bytes;
				this.enforceBounds();
			}
			return value;
		}).finally(() => this.flights.delete(key));
		this.flights.set(key, flight);
		return flight;
	}

	private prune(now: number): void {
		for (const [key, entry] of this.entries) if (entry.expiresAt <= now) this.remove(key, entry);
	}

	private enforceBounds(): void {
		while (this.entries.size > this.options.maxEntries || this.bytes > this.options.maxBytes) {
			const oldest = [...this.entries.entries()].sort((a, b) => a[1].touchedAt - b[1].touchedAt)[0];
			if (!oldest) return;
			this.remove(oldest[0], oldest[1]);
		}
	}

	private remove(key: string, entry: Entry<T>): void {
		this.entries.delete(key);
		this.bytes -= entry.bytes;
	}
}
