export interface Env {
	ZIP_CACHE: R2Bucket;
	ZIP_RATE_LIMITER: RateLimit;
	CF_ACCOUNT_HASH: string;
	ALLOWED_ORIGIN: string;
	SUPABASE_URL: string;
	/** Reads photo_metadata past RLS so album-key-scoped downloads cover unlisted albums. */
	SUPABASE_SERVICE_ROLE_KEY: string;
	/** HMAC secret for the download URL. Deliberately NOT the Supabase key — see index.ts. */
	ZIP_SIGNING_SECRET: string;
	/** The outgoing secret during a rotation. Optional, and normally unset. */
	ZIP_SIGNING_SECRET_PREVIOUS?: string;
}

export interface AlbumPhoto {
	cf_image_id: string;
	image_key: string;
}
