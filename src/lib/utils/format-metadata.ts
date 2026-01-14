/**
 * Metadata Label Formatting
 *
 * Converts raw database values to human-readable labels.
 * Used throughout the gallery for displaying photo metadata.
 */

const COMPOSITION_LABELS: Record<string, string> = {
	rule_of_thirds: 'Rule of Thirds',
	leading_lines: 'Leading Lines',
	center_weighted: 'Center Weighted',
	symmetry: 'Symmetry',
	framing: 'Framing',
	diagonal: 'Diagonal',
	golden_ratio: 'Golden Ratio',
	fill_frame: 'Fill Frame',
	negative_space: 'Negative Space'
};

const SPORT_LABELS: Record<string, string> = {
	volleyball: 'Volleyball',
	basketball: 'Basketball',
	softball: 'Softball',
	track: 'Track & Field',
	baseball: 'Baseball',
	soccer: 'Soccer',
	football: 'Football',
	tennis: 'Tennis',
	swimming: 'Swimming',
	portrait: 'Portrait'
};

const CATEGORY_LABELS: Record<string, string> = {
	action: 'Action',
	candid: 'Candid',
	celebration: 'Victory Celebration',
	warmup: 'Warmup',
	portrait: 'Portrait',
	team: 'Team',
	emotion: 'Emotion',
	victory: 'Victory',
	defeat: 'Defeat',
	focus: 'Focus'
};

/**
 * Convert a string to title case
 */
function titleCase(str: string): string {
	return str
		.replace(/_/g, ' ')
		.replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Format composition value for display
 */
export function formatComposition(value: string | undefined): string {
	if (!value) return '';
	return COMPOSITION_LABELS[value.toLowerCase()] ?? titleCase(value);
}

/**
 * Format sport type for display
 */
export function formatSport(value: string | undefined): string {
	if (!value) return '';
	return SPORT_LABELS[value.toLowerCase()] ?? titleCase(value);
}

/**
 * Format photo category for display
 */
export function formatCategory(value: string | undefined): string {
	if (!value) return '';
	return CATEGORY_LABELS[value.toLowerCase()] ?? titleCase(value);
}

/**
 * Format any metadata value with fallback to title case
 */
export function formatMetadataValue(value: string | undefined): string {
	if (!value) return '';
	return titleCase(value);
}
