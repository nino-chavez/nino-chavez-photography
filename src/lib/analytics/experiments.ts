/** Shared, browser-safe shape for the one intentionally bounded gallery experiment surface. */
export const PHOTOGRAPHY_EXPERIMENT_VARIANTS = ['control', 'album_card_cta'] as const;

export type PhotographyExperimentVariant = (typeof PHOTOGRAPHY_EXPERIMENT_VARIANTS)[number];

/** No browser identity, provider response, or guardrail detail crosses this boundary. */
export interface PhotographyExperimentAssignment {
	key: string;
	variant: PhotographyExperimentVariant;
	release: string;
}

export const ALBUM_CARD_EXPERIMENT_SURFACE = 'albums_album_card';

export function isPhotographyExperimentVariant(value: string): value is PhotographyExperimentVariant {
	return (PHOTOGRAPHY_EXPERIMENT_VARIANTS as readonly string[]).includes(value);
}

/** Control retains the existing card; the treatment adds one clear link cue to the same destination. */
export function hasAlbumCardCta(assignment: PhotographyExperimentAssignment | null | undefined): boolean {
	return assignment?.variant === 'album_card_cta';
}
