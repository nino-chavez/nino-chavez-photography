// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}

		// Cloudflare Pages runtime surface (adapter-cloudflare). Structurally typed and all
		// optional — `caches`/`waitUntil` are undefined in local dev, so callers must guard.
		interface Platform {
			env?: Record<string, unknown>;
			cf?: unknown;
			context?: { waitUntil(promise: Promise<unknown>): void };
			ctx?: { waitUntil(promise: Promise<unknown>): void };
			caches?: {
				default: {
					match(request: Request): Promise<Response | undefined>;
					put(request: Request, response: Response): Promise<void>;
				};
			};
		}
	}
}

export {};
