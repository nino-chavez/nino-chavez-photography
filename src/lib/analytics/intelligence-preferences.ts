export type OperatorRetention = 'undecided' | 'until_deleted' | '90_days' | 'one_year';
export interface IntelligencePreferences {
	retention: OperatorRetention;
	daily: boolean;
	weekly: boolean;
	externalEnabled: boolean;
	destination: string | null;
	destinationVerified: boolean;
}

/** Visitor retention is a separate contract; this choice applies to private operator records. */
export function parseIntelligencePreferences(value: unknown): Pick<IntelligencePreferences, 'retention' | 'daily' | 'weekly'> | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	const row = value as Record<string, unknown>;
	if (Object.keys(row).some(key => !['retention', 'daily', 'weekly'].includes(key))
		|| !['until_deleted', '90_days', 'one_year'].includes(String(row.retention))
		|| typeof row.daily !== 'boolean' || typeof row.weekly !== 'boolean') return null;
	return { retention: row.retention as OperatorRetention, daily: row.daily, weekly: row.weekly };
}

export function retentionDays(retention: OperatorRetention): number | null {
	return retention === '90_days' ? 90 : retention === 'one_year' ? 365 : null;
}
