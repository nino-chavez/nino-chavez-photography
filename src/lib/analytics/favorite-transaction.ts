export type FavoriteTransition = 'add' | 'remove' | null;

/** A no-op is not an analytics action: it must not produce another send. */
export function favoriteTransition(isSaved: boolean, requested: 'add' | 'remove'): FavoriteTransition {
	if (requested === 'add') return isSaved ? null : 'add';
	return isSaved ? 'remove' : null;
}
