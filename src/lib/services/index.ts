/**
 * Services Layer
 *
 * This directory contains business logic extracted from routes.
 * Services should be pure functions that:
 * - Take data as input
 * - Return transformed/computed data
 * - Have no side effects (database operations stay in supabase/)
 *
 * Pattern:
 * - Routes handle HTTP (params, forms, responses)
 * - Supabase handles database operations
 * - Services handle business logic and transformations
 *
 * @example
 * // In a route:
 * import { calculatePhotoQualityScore } from '$lib/services/photo-scoring'
 * const score = calculatePhotoQualityScore(photo.metadata)
 */

// Photo scoring and quality calculations
export * from './photo-scoring';

// Photo filtering and sorting logic
export * from './photo-filtering';
