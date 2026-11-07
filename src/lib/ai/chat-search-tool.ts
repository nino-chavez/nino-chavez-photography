/**
 * The chat's `searchPhotos` tool contract: what the model is told it can pass, and how many
 * search-then-answer steps one reply may take.
 *
 * Pure — no Supabase, no `$env` — so the contract runs under `tsx --test`. The route supplies
 * `execute`, which holds the queries.
 *
 * THE BUG THIS ENCODES AGAINST. AI SDK v5 reads a tool's arguments from `inputSchema`; the v4
 * name `parameters` is silently ignored, and a tool with no `inputSchema` is sent to the model
 * as `{ properties: {} }`. The route declared `parameters` behind a `@ts-ignore`, so the model
 * was offered a search tool that takes no arguments: every call ran the unfiltered quality
 * sort, whatever the user asked for. Building the tool here, typed, makes that a compile error.
 */

import { stepCountIs, tool } from 'ai';
import { z } from 'zod';
import type { ChatPhotoResult } from './chat-photo-result';

/**
 * Steps per reply: a search, one refined retry when the first comes back empty or off-target,
 * then the written answer. The retry is the point — a single-shot search cannot recover from a
 * query phrased differently from the captions it is matched against.
 */
export const CHAT_MAX_STEPS = 3;
export const chatStopWhen = stepCountIs(CHAT_MAX_STEPS);

export const searchPhotosInput = z.object({
	query: z
		.string()
		.optional()
		.describe(
			'Free-text description of the photo(s) to find — scene, action, jersey color, lighting, mood, named moment — matched against the photos by meaning. Use this for anything the structured filters do not cover, e.g. "diving save near the sideline", "player in a red jersey", "backlit serve".'
		),
	sport_type: z.string().optional().describe('The sport, e.g. volleyball, basketball.'),
	play_type: z.string().optional().describe('The specific action, e.g. spike, block, serve, dig.'),
	photo_category: z
		.string()
		.optional()
		.describe('The kind of photo, e.g. action, portrait, celebration.'),
	jersey_number: z.number().optional().describe('A player jersey number visible in the photo.')
});

export type SearchPhotosInput = z.infer<typeof searchPhotosInput>;

/** What every search branch hands back: the shaped photos, plus a message when it failed. */
export interface SearchPhotosResult {
	photos: ChatPhotoResult[];
	error?: string;
}

export const SEARCH_PHOTOS_DESCRIPTION =
	'Search photos. For descriptive / natural-language requests (a scene, a moment, a jersey color, "diving save near the sideline") pass `query` — it matches the photos by meaning. For exact attribute filters use the structured fields (sport, play type, category, jersey number). `query` takes precedence when provided. If a search returns no photos, try once more with a broader or rephrased query before answering.';

/** Build the tool around the route's `execute`, so the schema key is checked by the compiler. */
export function searchPhotosTool(
	execute: (input: SearchPhotosInput) => Promise<SearchPhotosResult>
) {
	return tool<SearchPhotosInput, SearchPhotosResult>({
		description: SEARCH_PHOTOS_DESCRIPTION,
		inputSchema: searchPhotosInput,
		execute
	});
}
