import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { streamText, tool } from 'ai';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

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

**Search Examples:**
- "Show me powerful volleyball spikes"
- "Find celebration moments"
- "Photos with peak intensity"
- "Serves with determination"

**When Users Ask to See Photos:**
1. Understand their intent (action, emotion, sport, moment)
2. Use the searchPhotos tool with relevant parameters
3. Show enthusiasm while searching
4. Explain what you're looking for

**About Nino:**
Professional volleyball photographer with deep expertise in:
- High-intensity sports action
- Emotional storytelling through imagery
- Enterprise Architecture & AI systems
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
		console.log('Received chat request');
		const { messages } = await request.json();

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
			tools: {
				searchPhotos: tool({
					description:
						'Search for photos based on criteria like sport, action, emotion, intensity, or composition.',
					parameters: z.object({
						sport_type: z.string().optional().describe('The type of sport, e.g., volleyball, basketball.'),
						play_type: z.string().optional().describe('The specific action, e.g., spike, block, serve.'),
						photo_category: z.string().optional().describe('The category of photo, e.g., action, portrait, celebration.'),
						action_intensity: z.string().optional().describe('The intensity of the action, e.g., low, medium, high, peak.'),
						emotion: z.string().optional().describe('The emotion conveyed, e.g., triumph, determination, focus.')
					}),
					// @ts-ignore - Tool typing is complex, but runtime execution works correctly
					execute: async ({
						sport_type,
						play_type,
						photo_category,
						action_intensity,
						emotion
					}: {
						sport_type?: string;
						play_type?: string;
						photo_category?: string;
						action_intensity?: string;
						emotion?: string;
					}) => {
						console.log('Tool call: searchPhotos', {
							sport_type,
							play_type,
							photo_category,
							action_intensity,
							emotion
						});
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
