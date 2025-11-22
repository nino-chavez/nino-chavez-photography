/**
 * Rate Limiting for Chat API
 *
 * Protects against:
 * - Cost exhaustion attacks
 * - Bot spam
 * - Accidental infinite loops
 *
 * Implementation: In-memory rate limiting with IP-based tracking
 */

interface RateLimitEntry {
	count: number;
	resetAt: number;
}

// In-memory store (production: use Redis/Vercel KV)
const rateLimitStore = new Map<string, RateLimitEntry>();

const RATE_LIMITS = {
	// Per IP address
	perMinute: 10,      // 10 requests per minute
	perHour: 50,        // 50 requests per hour
	perDay: 200,        // 200 requests per day

	// Global limits (all users)
	globalPerMinute: 100,
	globalPerHour: 1000
};

export function checkRateLimit(identifier: string): {
	allowed: boolean;
	retryAfter?: number;
	reason?: string;
} {
	const now = Date.now();
	const minuteKey = `${identifier}:minute:${Math.floor(now / 60000)}`;
	const hourKey = `${identifier}:hour:${Math.floor(now / 3600000)}`;
	const dayKey = `${identifier}:day:${Math.floor(now / 86400000)}`;

	// Check per-minute limit
	const minuteEntry = rateLimitStore.get(minuteKey) || { count: 0, resetAt: now + 60000 };
	if (minuteEntry.count >= RATE_LIMITS.perMinute) {
		return {
			allowed: false,
			retryAfter: Math.ceil((minuteEntry.resetAt - now) / 1000),
			reason: 'Rate limit: Too many requests per minute'
		};
	}

	// Check per-hour limit
	const hourEntry = rateLimitStore.get(hourKey) || { count: 0, resetAt: now + 3600000 };
	if (hourEntry.count >= RATE_LIMITS.perHour) {
		return {
			allowed: false,
			retryAfter: Math.ceil((hourEntry.resetAt - now) / 1000),
			reason: 'Rate limit: Too many requests per hour'
		};
	}

	// Check per-day limit
	const dayEntry = rateLimitStore.get(dayKey) || { count: 0, resetAt: now + 86400000 };
	if (dayEntry.count >= RATE_LIMITS.perDay) {
		return {
			allowed: false,
			retryAfter: Math.ceil((dayEntry.resetAt - now) / 1000),
			reason: 'Rate limit: Daily quota exceeded'
		};
	}

	// Increment counters
	minuteEntry.count++;
	hourEntry.count++;
	dayEntry.count++;

	rateLimitStore.set(minuteKey, minuteEntry);
	rateLimitStore.set(hourKey, hourEntry);
	rateLimitStore.set(dayKey, dayEntry);

	// Clean up old entries (prevent memory leak)
	if (rateLimitStore.size > 10000) {
		const cutoff = now - 86400000; // 24 hours ago
		for (const [key, entry] of rateLimitStore.entries()) {
			if (entry.resetAt < cutoff) {
				rateLimitStore.delete(key);
			}
		}
	}

	return { allowed: true };
}

export function getClientIdentifier(request: Request): string {
	// Use Vercel's real IP header
	const forwardedFor = request.headers.get('x-forwarded-for');
	const realIp = request.headers.get('x-real-ip');

	return forwardedFor?.split(',')[0].trim() ||
	       realIp ||
	       'unknown';
}
