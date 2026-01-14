import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { streamText, tool } from 'ai';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';
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
						'Search for photos based on criteria like sport, action, emotion, intensity, composition, lighting, time of day, or player jersey number.',
					parameters: z.object({
						sport_type: z.string().optional().describe('The type of sport, e.g., volleyball, basketball.'),
						play_type: z.string().optional().describe('The specific action, e.g., spike, block, serve, dig.'),
						photo_category: z.string().optional().describe('The category of photo, e.g., action, portrait, celebration.'),
						action_intensity: z.string().optional().describe('The intensity of the action, e.g., low, medium, high, peak.'),
						emotion: z.string().optional().describe('The emotion conveyed, e.g., triumph, determination, focus.'),
						jersey_number: z.number().optional().describe('Player jersey number visible in the photo.'),
						lighting: z.string().optional().describe('The lighting type, e.g., natural, backlit, dramatic, soft, artificial.'),
						color_temperature: z.string().optional().describe('The color temperature, e.g., warm, cool, neutral.'),
						time_of_day: z.string().optional().describe('When the photo was taken, e.g., golden_hour, midday, evening, night.'),
						composition: z.string().optional().describe('The composition pattern, e.g., rule_of_thirds, leading_lines, centered, symmetry.')
					}),
					// @ts-ignore - Tool typing is complex, but runtime execution works correctly
					execute: async ({
						sport_type,
						play_type,
						photo_category,
						action_intensity,
						emotion,
						jersey_number,
						lighting,
						color_temperature,
						time_of_day,
						composition
					}: {
						sport_type?: string;
						play_type?: string;
						photo_category?: string;
						action_intensity?: string;
						emotion?: string;
						jersey_number?: number;
						lighting?: string;
						color_temperature?: string;
						time_of_day?: string;
						composition?: string;
					}) => {
						try {
							const supabase = getSupabaseClient();
							let query = supabase
								.from('photo_metadata')
								.select('image_key, thumbnail_url, sport_type, play_type, photo_category')
								.order('emotional_impact', { ascending: false })
								.limit(12);

							if (sport_type) query = query.eq('sport_type', sport_type);
							if (play_type) query = query.eq('play_type', play_type);
							if (photo_category) query = query.eq('photo_category', photo_category);
							if (action_intensity) query = query.eq('action_intensity', action_intensity);
							if (emotion) query = query.eq('emotion', emotion);
							if (jersey_number !== undefined) query = query.eq('jersey_number', jersey_number);
							if (lighting) query = query.eq('lighting', lighting);
							if (color_temperature) query = query.eq('color_temperature', color_temperature);
							if (time_of_day) query = query.eq('time_of_day', time_of_day);
							if (composition) query = query.eq('composition', composition);

							const { data, error } = await query;

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
