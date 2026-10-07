/** An album key as the gallery writes it. Anything else is not an album address. */
const ALBUM_KEY = /^[A-Za-z0-9_-]{1,64}$/;
export function isAlbumKey(value: string): boolean {
	return ALBUM_KEY.test(value);
}
