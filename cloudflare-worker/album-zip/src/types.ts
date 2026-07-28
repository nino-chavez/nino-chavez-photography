export interface Env {
	ZIP_CACHE: R2Bucket;
	ZIP_RATE_LIMITER: RateLimit;
	CF_ACCOUNT_HASH: string;
	/** Inbound CORS. The browser origin allowed to call this worker — unrelated to the below. */
	ALLOWED_ORIGIN: string;
	/**
	 * Outbound. The gallery app's Pages origin, which owns the album manifest. Off-zone on
	 * purpose: the public hostname's bot protection refuses non-browser clients, this one
	 * included. See manifest.ts.
	 */
	PHOTOGRAPHY_ORIGIN: string;
	/** HMAC secret for the download URL. Not a database key, deliberately — see index.ts. */
	ZIP_SIGNING_SECRET: string;
	/** The outgoing secret during a rotation. Optional, and normally unset. */
	ZIP_SIGNING_SECRET_PREVIOUS?: string;
}

export interface AlbumPhoto {
	cf_image_id: string;
	image_key: string;
}
