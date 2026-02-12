import { dev } from '$app/environment';
import { injectAnalytics } from '@vercel/analytics/sveltekit';

// Initialize Vercel Web Analytics for SvelteKit
injectAnalytics({ mode: dev ? 'development' : 'production' });
