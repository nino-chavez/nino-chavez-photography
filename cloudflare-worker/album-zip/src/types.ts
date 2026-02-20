export interface Env {
	ZIP_CACHE: R2Bucket;
	CF_ACCOUNT_HASH: string;
	ALLOWED_ORIGIN: string;
	SUPABASE_URL: string;
	SUPABASE_SERVICE_ROLE_KEY: string;
	ZIP_SIGNING_SECRET: string;
}

export interface AlbumPhoto {
	cf_image_id: string;
	image_key: string;
}
