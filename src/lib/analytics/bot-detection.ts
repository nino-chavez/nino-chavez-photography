/**
 * Bot filter for the engagement/popularity pipeline.
 *
 * isbot maintains its crawler-signature list against real-world UA drift (new
 * AI-agent crawlers, etc.) — hand-rolled regexes would need the same upkeep
 * without the upstream maintenance.
 */
import { isbot } from 'isbot';

export function isBotUserAgent(userAgent: string | null | undefined): boolean {
	return isbot(userAgent ?? '');
}
