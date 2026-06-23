import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { PHOTOS_READ } from '$lib/supabase/columns';
import { streamText, tool } from 'ai';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';
import { embedText } from '$lib/ai/embeddings';
import type { RequestHandler } from './$types';
import { checkRateLimit, getClientIdentifier } from './rate-limit';

// Create Supabase client with fallback for build time
function getSupabaseClient() {
	const supabaseUrl = env.SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
	const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder-key';
	return createClient(supabaseUrl, supabaseKey);
}

const SYSTEM_PROMPT = `You are Shot Bot, the AI assistant for Nino Chavez's photography gallery.

**Your Role:**
- Help users discover and explore volleyball action photography
- Use natural language to search Nino's extensive photo collection
- Embody "Intensity • Determination" - be energetic yet precise
- Reflect "Systems Thinking + Art" - analytical but creative

**Photo Search Capabilities:**
You can search photos by:
- **Sport**: volleyball, basketball
- **Action**: spike, block, serve, dig, set, celebration, huddle
- **Category**: action, portrait, celebration, warmup, candid
- **Intensity**: low, medium, high, peak
- **Emotion**: triumph, determination, focus, joy, intensity
- **Jersey Number**: Search for specific players by their number
- **Lighting**: natural, backlit, dramatic, soft, artificial
- **Color Temperature**: warm, cool, neutral
- **Time of Day**: golden_hour, midday, evening, night, blue_hour, dawn
- **Composition**: rule_of_thirds, leading_lines, centered, symmetry, frame_within_frame

**Search Examples:**
- "Show me powerful volleyball spikes"
- "Find celebration moments"
- "Photos with peak intensity"
- "Serves with determination"
- "Show me photos of player #12"
- "Find golden hour volleyball photos"
- "Photos with dramatic lighting"
- "Show me backlit action shots"
- "Find photos using rule of thirds composition"

**When Users Ask to See Photos:**
1. Understand their intent (action, emotion, sport, moment, aesthetic)
2. Use the searchPhotos tool with relevant parameters
3. Show enthusiasm while searching
4. Explain what you're looking for

**About Nino:**
Professional volleyball photographer with deep expertise in:
- High-intensity sports action
- Emotional storytelling through imagery
- Product Architecture & Commerce Platforms
- Premium quality, portfolio-worthy shots

**Site Navigation:**
- **Collections**: Curated galleries organized by theme
- **Timeline**: Chronological view of all work
- **Explore**: Advanced search and discovery
- **Favorites**: Save shots you love
- **About**: Nino's story and approach

**Pricing Questions:**
Ask: "Are you interested in individual player packages or full tournament coverage?"

**Tone:**
Conversational, helpful, and genuinely excited about great photography. Keep responses concise but informative.
`;

export const POST: RequestHandler = async ({ request }) => {
	try {
		// 1. Rate Limiting - Protect against cost attacks
		const clientId = getClientIdentifier(request);
		const rateCheck = checkRateLimit(clientId);

		if (!rateCheck.allowed) {
			console.warn(`Rate limit exceeded for ${clientId}: ${rateCheck.reason}`);
			return new Response(
				JSON.stringify({
					error: rateCheck.reason,
					retryAfter: rateCheck.retryAfter
				}),
				{
					status: 429,
					headers: {
						'Content-Type': 'application/json',
						'Retry-After': String(rateCheck.retryAfter || 60)
					}
				}
			);
		}

		console.log('Received chat request from', clientId);
		const { messages } = await request.json();

		// 2. Request Validation - Prevent abuse
		if (!Array.isArray(messages) || messages.length === 0) {
			return new Response(JSON.stringify({ error: 'Invalid messages array' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			});
		}

		// Limit conversation history to prevent token bloat
		if (messages.length > 50) {
			return new Response(
				JSON.stringify({ error: 'Conversation too long. Please start a new chat.' }),
				{
					status: 400,
					headers: { 'Content-Type': 'application/json' }
				}
			);
		}

		// Validate individual message sizes
		const totalChars = messages.reduce((sum, msg) => sum + (msg.content?.length || 0), 0);
		if (totalChars > 50000) {
			return new Response(
				JSON.stringify({ error: 'Message content too large' }),
				{
					status: 400,
					headers: { 'Content-Type': 'application/json' }
				}
			);
		}

		const googleApiKey = env.GOOGLE_API_KEY || env.GEMINI_API_KEY;
		console.log('API Key present:', !!googleApiKey);

		if (!googleApiKey) {
			console.error('Missing GOOGLE_API_KEY or GEMINI_API_KEY');
			return new Response('Missing GOOGLE_API_KEY or GEMINI_API_KEY environment variable', {
				status: 500
			});
		}

		// Create Google AI provider with API key
		const google = createGoogleGenerativeAI({
			apiKey: googleApiKey
		});

		const result = streamText({
			model: google('gemini-2.5-flash'),
			system: SYSTEM_PROMPT,
			messages,
			temperature: 0.7, // Balanced creativity vs consistency
			tools: {
				searchPhotos: tool({
					description:
						'Search photos. For descriptive / natural-language requests (a scene, a moment, a jersey color, "diving save near the sideline") pass `query` — it matches AI-generated captions via semantic embeddings. For exact attribute filters use the structured fields (sport, play type, category, jersey number). `query` takes precedence when provided.',
					parameters: z.object({
						query: z.string().optional().describe('Free-text natural-language description of the photo(s) to find — scene, action, jersey color, named moment — matched against AI-generated photo captions via semantic embeddings. Use this for anything the structured filters do not cover, e.g. "diving save near the sideline" or "player in a red jersey".'),
						sport_type: z.string().optional().describe('The type of sport, e.g., volleyball, basketball.'),
						play_type: z.string().optional().describe('The specific action, e.g., spike, block, serve, dig.'),
						photo_category: z.string().optional().describe('The category of photo, e.g., action, portrait, celebration.'),
						jersey_number: z.number().optional().describe('Player jersey number visible in the photo.')
					}),
					// @ts-ignore - Tool typing is complex, but runtime execution works correctly
					execute: async ({
						query,
						sport_type,
						play_type,
						photo_category,
						jersey_number
					}: {
						query?: string;
						sport_type?: string;
						play_type?: string;
						photo_category?: string;
						jersey_number?: number;
					}) => {
						try {
							const supabase = getSupabaseClient();

							// Semantic path: embed the natural-language query and match against caption
							// embeddings via match_photos. Must use the SAME embedder as the write path
							// (embedText → OpenRouter text-embedding-3-large @768).
							if (query && query.trim()) {
								const embedding = await embedText(query, env.OPENROUTER_API_KEY);
								if (embedding) {
									const { data, error } = await supabase.rpc('match_photos', {
										query_embedding: embedding,
										match_threshold: 0.2,
										match_count: 12
									});
									if (!error && Array.isArray(data)) {
										console.log(`Semantic caption search "${query}" → ${data.length} photos.`);
										return { photos: data };
									}
									console.error('match_photos RPC error (falling back to structured filters):', error);
								} else {
									console.warn('Caption embedding unavailable (no OPENROUTER_API_KEY?) — falling back to structured filters.');
								}
							}

							// Jersey lookups resolve via photo_jersey_sightings (comprehensive, multi-player,
							// privacy-safe — excludes unlisted albums) through the find_photos_by_jersey RPC,
							// NOT the sparse legacy photo_metadata.jersey_number column (~10x fewer hits).
							// We take the RPC's privacy-filtered image_keys, then hydrate full rows below so
							// caption + the other facets still apply.
							let jerseyImageKeys: string[] | null = null;
							if (jersey_number !== undefined) {
								const { data: jr, error: jErr } = await supabase.rpc('find_photos_by_jersey', {
									p_jersey: String(jersey_number), p_album_key: null, p_team_color: null,
									p_sport: null, p_limit: 100, p_offset: 0
								});
								if (jErr) console.error('find_photos_by_jersey RPC error:', jErr.message);
								const keys = (jr ?? []).map((r: { image_key: string }) => r.image_key);
								if (keys.length === 0) return { photos: [] };
								jerseyImageKeys = keys;
							}

							// Structured path: filterable enum fields, ranked by the weighted quality blend.
							let dbQuery = supabase
								.from(PHOTOS_READ)
								.select('image_key, cf_image_id, sport_type, play_type, photo_category, caption')
								.not('sharpness', 'is', null)
								.order('quality_score', { ascending: false, nullsFirst: false })
								.limit(12);

							// Only live facets remain; the vanity columns (action_intensity/emotion/lighting/
							// color_temperature/time_of_day/composition) were dropped in the cleanup.
							if (jerseyImageKeys) dbQuery = dbQuery.in('image_key', jerseyImageKeys);
							if (sport_type) dbQuery = dbQuery.eq('sport_type', sport_type);
							if (play_type) dbQuery = dbQuery.eq('play_type', play_type);
							if (photo_category) dbQuery = dbQuery.eq('photo_category', photo_category);

							const { data, error } = await dbQuery;

							if (error) {
								console.error('Supabase query error:', error);
								return { photos: [], error: 'Failed to fetch photos.' };
							}

							console.log(`Found ${data?.length || 0} photos.`);
							return { photos: data || [] };
						} catch (err) {
							console.error('Error executing searchPhotos tool:', err);
							return { photos: [], error: 'Internal error in search tool' };
						}
					}
				})
			}
		});

		return result.toTextStreamResponse();
	} catch (error) {
		console.error('Error in chat API:', error);
		return new Response(JSON.stringify({ error: 'Internal Server Error', details: error instanceof Error ? error.message : String(error) }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}
};
