export type EmailIntelligenceDeliveryState = {
	enabled: boolean;
	configured: boolean;
	retentionChosen: boolean;
	destination: string | null;
	emailVerified: boolean;
};

type PreferenceRow = {
	external_enabled?: unknown;
	destination_verified?: unknown;
	destination_verified_at?: unknown;
	destination?: unknown;
	sender?: unknown;
	retention_policy?: unknown;
};

export type EmailIntelligenceDeliveryChange = {
	enabled: boolean;
	confirm: 'activate_verified_email' | 'disable_email';
};

function validEmail(value: unknown): value is string {
	return typeof value === 'string' && value.length > 3 && value.length <= 320 && !/[\r\n]/.test(value);
}

function validInstant(value: unknown): value is string {
	return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function sameEmail(left: string, right: string): boolean {
	return left.localeCompare(right, undefined, { sensitivity: 'accent' }) === 0;
}

/** The route owns this narrow payload; addresses and credentials are never client input. */
export function parseEmailIntelligenceDeliveryChange(value: unknown): EmailIntelligenceDeliveryChange | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	const row = value as Record<string, unknown>;
	if (Object.keys(row).length !== 2 || Object.keys(row).some((key) => key !== 'enabled' && key !== 'confirm') || typeof row.enabled !== 'boolean') return null;
	if (row.enabled === true && row.confirm === 'activate_verified_email') return { enabled: true, confirm: row.confirm };
	if (row.enabled === false && row.confirm === 'disable_email') return { enabled: false, confirm: row.confirm };
	return null;
}

export function emailIntelligenceDeliveryConfigured(config: { enabled: unknown; from: unknown; token: unknown }): boolean {
	return config.enabled === 'true' && typeof config.from === 'string' && config.from.trim().length > 0
		&& !/[\r\n]/.test(config.from) && typeof config.token === 'string' && config.token.trim().length > 0;
}

/** Only a freshly authenticated, confirmed owner address can be shown or activated. */
export function emailIntelligenceDeliveryState(
	row: PreferenceRow | null | undefined,
	confirmedEmail: unknown,
	configured: boolean
): EmailIntelligenceDeliveryState {
	const destination = validEmail(confirmedEmail) ? confirmedEmail : null;
	const current = row ?? {};
	const storedDestinationMatches = !!destination && validEmail(current.destination) && sameEmail(current.destination, destination);
	const enabled = current.external_enabled === true && current.destination_verified === true
		&& validInstant(current.destination_verified_at) && storedDestinationMatches && current.sender === 'owned';
	return {
		enabled,
		configured,
		retentionChosen: typeof current.retention_policy === 'string' && current.retention_policy !== 'undecided',
		destination,
		emailVerified: destination !== null
	};
}

export function validEmailIntelligenceDeliveryState(value: unknown): value is EmailIntelligenceDeliveryState {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
	const row = value as Record<string, unknown>;
	return Object.keys(row).length === 5 && ['enabled', 'configured', 'retentionChosen', 'destination', 'emailVerified'].every((key) => key in row)
		&& typeof row.enabled === 'boolean' && typeof row.configured === 'boolean' && typeof row.retentionChosen === 'boolean'
		&& (row.destination === null || validEmail(row.destination)) && typeof row.emailVerified === 'boolean';
}
