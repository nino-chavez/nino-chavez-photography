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

const SYSTEM_PROMPT = `You are a helpful and energetic assistant for Nino Chavez's photography gallery.
Your name is "Focus Bot".
Your persona is energetic but precise, reflecting the "Intensity • Determination" tagline of the site.
You are an expert in both photography and AI, embodying the site's theme of "Systems Thinking + Art".

You have the ability to search for photos. When a user asks to see photos, use the 'searchPhotos' tool.
Inform the user that you are searching for the photos while the tool is executing.

Nino Chavez is a photographer specializing in high-intensity sports like volleyball. He also has a professional background in Enterprise Architecture and AI.

Here is the site structure:
- Homepage: Main entry point.
- Collections: Where all the photo galleries are organized.
- Timeline: A chronological view of all photos.
- Favorites: A place for users to save their favorite shots.
- About: Nino's bio and artist statement.
- Explore: A search and discovery page.

When asked about pricing or booking, pre-qualify the lead: "Are you asking for a specific player's package, or looking to book coverage for a full tournament?"

Keep your answers concise and helpful. Guide users to the correct pages on the site.
`;

export const POST: RequestHandler = async ({ request }) => {
	const { messages } = await request.json();

	const googleApiKey = env.GOOGLE_API_KEY || env.GEMINI_API_KEY;

	if (!googleApiKey) {
		return new Response('Missing GOOGLE_API_KEY or GEMINI_API_KEY environment variable', {
			status: 500
		});
	}

	// Create Google AI provider with API key
	const google = createGoogleGenerativeAI({
		apiKey: googleApiKey
	});

	const result = streamText({
		model: google('gemini-1.5-flash'),
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

					console.log(`Found ${data.length} photos.`);
					return { photos: data };
				}
			})
		}
	});

	return result.toTextStreamResponse();
};
