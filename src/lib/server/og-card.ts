/**
 * Branded Open Graph card builders.
 *
 * Renders 1200×630 PNG share cards on the Cloudflare Workers runtime via
 * @cf-wasm/og (Satori + resvg under the hood). Mirrors the proven rally-hq
 * pattern: React.createElement trees (no JSX compile), default sans-serif font
 * (custom font loading hangs on workerd — see rally-hq recap/og.png header).
 *
 * Visual language matches the live site theme (src/app.css): charcoal-950
 * (#18181b) surfaces, gold-500 (#eab308) accent, uppercase wordmark.
 */

import React from 'react';
import { cfImageUrl } from '$lib/utils/cloudflare-images';

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

// Brand tokens (kept in sync with @theme in src/app.css)
const CHARCOAL_950 = '#18181b';
const CHARCOAL_900 = '#27272a';
const GOLD_500 = '#eab308';
const GOLD_400 = '#facc15';
const WHITE = '#ffffff';

// Crawlers refetch unfurl images; the WASM render is not free.
export const OG_CACHE_CONTROL =
	'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800';

/**
 * Fetch a Cloudflare Images photo as a base64 JPEG data URI for embedding in the
 * card. We fetch ourselves (rather than letting Satori fetch) so we can:
 *   1. send `Accept: image/jpeg` and reject any webp/avif the variant might
 *      negotiate — Satori/resvg cannot decode those and would throw mid-render;
 *   2. degrade gracefully (return null → gradient-only card) instead of 500ing
 *      the whole endpoint when an image is missing or wrongly formatted.
 * Uses the `large` (1600px) variant: sized for a 1200px card, fast to decode.
 */
export async function fetchImageDataUri(cfImageId: string): Promise<string | null> {
	try {
		const res = await fetch(cfImageUrl(cfImageId, 'large'), {
			headers: { accept: 'image/jpeg' }
		});
		if (!res.ok) return null;
		const contentType = res.headers.get('content-type') ?? '';
		// Only JPEG/PNG are safe to hand to Satori's image decoder.
		if (!/image\/(jpeg|png)/.test(contentType)) return null;
		const buf = await res.arrayBuffer();
		return `data:image/jpeg;base64,${arrayBufferToBase64(buf)}`;
	} catch {
		return null;
	}
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
	const bytes = new Uint8Array(buf);
	let binary = '';
	const CHUNK = 0x8000;
	for (let i = 0; i < bytes.length; i += CHUNK) {
		binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
	}
	return btoa(binary);
}

const h = React.createElement;

/** Reusable "NINO CHAVEZ PHOTOGRAPHY" wordmark line. */
function wordmark(color: string, fontSize: number) {
	return h(
		'div',
		{
			style: {
				display: 'flex',
				fontSize: `${fontSize}px`,
				fontWeight: 700,
				letterSpacing: '0.18em',
				textTransform: 'uppercase',
				color
			}
		},
		'Nino Chavez Photography'
	);
}

/**
 * General site card. Photo-led when a hero data URI is supplied, with a strong
 * left-to-right charcoal gradient for legibility; otherwise a charcoal→gold
 * gradient brand card with a radial gold glow. Always renders.
 */
export function buildSiteCard(heroDataUri: string | null) {
	const children: React.ReactNode[] = [];

	if (heroDataUri) {
		children.push(
			h('img', {
				key: 'hero',
				src: heroDataUri,
				style: {
					position: 'absolute',
					top: 0,
					left: 0,
					width: `${OG_WIDTH}px`,
					height: `${OG_HEIGHT}px`,
					objectFit: 'cover'
				}
			}),
			h('div', {
				key: 'scrim',
				style: {
					position: 'absolute',
					top: 0,
					left: 0,
					width: `${OG_WIDTH}px`,
					height: `${OG_HEIGHT}px`,
					display: 'flex',
					background:
						'linear-gradient(90deg, rgba(24,24,27,0.97) 0%, rgba(24,24,27,0.86) 42%, rgba(24,24,27,0.4) 100%)'
				}
			})
		);
	} else {
		children.push(
			h('div', {
				key: 'glow',
				style: {
					position: 'absolute',
					top: '-120px',
					right: '-120px',
					width: '520px',
					height: '520px',
					borderRadius: '50%',
					display: 'flex',
					background: `radial-gradient(circle, ${GOLD_500}33 0%, transparent 66%)`
				}
			})
		);
	}

	// Content column (vertically centered, left aligned)
	children.push(
		h(
			'div',
			{
				key: 'content',
				style: {
					position: 'relative',
					display: 'flex',
					flexDirection: 'column',
					justifyContent: 'center',
					height: '100%',
					padding: '0 80px',
					zIndex: 1
				}
			},
			h(
				'div',
				{
					key: 'eyebrow',
					style: {
						display: 'flex',
						fontSize: '22px',
						fontWeight: 700,
						letterSpacing: '0.32em',
						textTransform: 'uppercase',
						color: GOLD_500,
						marginBottom: '24px'
					}
				},
				'Action Sports Photography'
			),
			h(
				'div',
				{
					key: 'name',
					style: {
						display: 'flex',
						fontSize: '92px',
						fontWeight: 800,
						lineHeight: '0.98',
						letterSpacing: '0.02em',
						textTransform: 'uppercase',
						color: WHITE,
						marginBottom: '28px'
					}
				},
				'Nino Chavez'
			),
			h(
				'div',
				{
					key: 'tagline',
					style: { display: 'flex', alignItems: 'baseline', gap: '14px' }
				},
				h(
					'div',
					{
						key: 't1',
						style: { display: 'flex', fontSize: '34px', fontWeight: 700, color: WHITE }
					},
					'Motion. Emotion.'
				),
				h(
					'div',
					{
						key: 't2',
						style: { display: 'flex', fontSize: '34px', fontWeight: 300, color: GOLD_400 }
					},
					'Frame by Frame.'
				)
			)
		)
	);

	return h(
		'div',
		{
			style: {
				display: 'flex',
				position: 'relative',
				width: `${OG_WIDTH}px`,
				height: `${OG_HEIGHT}px`,
				background: `linear-gradient(135deg, ${CHARCOAL_950} 0%, ${CHARCOAL_900} 55%, ${CHARCOAL_950} 100%)`,
				fontFamily: 'sans-serif',
				overflow: 'hidden'
			}
		},
		...children
	);
}

export interface AlbumCardData {
	albumName: string;
	photoDataUri: string | null;
	photoCount: number;
	sport?: string | null;
}

/**
 * Album card. Full-bleed cover photo (when available) with a bottom charcoal
 * scrim, a gold accent bar, the album name, photo-count meta, and the wordmark —
 * matching the chosen "photo + branded overlay" treatment.
 */
export function buildAlbumCard({ albumName, photoDataUri, photoCount, sport }: AlbumCardData) {
	const children: React.ReactNode[] = [];

	if (photoDataUri) {
		children.push(
			h('img', {
				key: 'cover',
				src: photoDataUri,
				style: {
					position: 'absolute',
					top: 0,
					left: 0,
					width: `${OG_WIDTH}px`,
					height: `${OG_HEIGHT}px`,
					objectFit: 'cover'
				}
			}),
			h('div', {
				key: 'scrim',
				style: {
					position: 'absolute',
					top: 0,
					left: 0,
					width: `${OG_WIDTH}px`,
					height: `${OG_HEIGHT}px`,
					display: 'flex',
					background:
						'linear-gradient(180deg, rgba(24,24,27,0.05) 0%, rgba(24,24,27,0.15) 45%, rgba(24,24,27,0.92) 100%)'
				}
			})
		);
	}

	// Title length → size ramp so long event names stay on the card.
	const nameSize = albumName.length > 42 ? 48 : albumName.length > 26 ? 60 : 72;

	const metaParts = [`${photoCount.toLocaleString('en-US')} photo${photoCount === 1 ? '' : 's'}`];
	if (sport) metaParts.push(sport);

	children.push(
		h(
			'div',
			{
				key: 'band',
				style: {
					position: 'absolute',
					left: 0,
					bottom: 0,
					display: 'flex',
					flexDirection: 'row',
					alignItems: 'stretch',
					padding: '0 72px 64px 72px',
					width: `${OG_WIDTH}px`,
					zIndex: 1
				}
			},
			// Gold accent bar
			h('div', {
				key: 'bar',
				style: {
					display: 'flex',
					width: '8px',
					borderRadius: '4px',
					background: GOLD_500,
					marginRight: '28px'
				}
			}),
			h(
				'div',
				{
					key: 'text',
					style: { display: 'flex', flexDirection: 'column' }
				},
				h('div', { key: 'wm', style: { display: 'flex', marginBottom: '16px' } }, wordmark(GOLD_500, 20)),
				h(
					'div',
					{
						key: 'title',
						style: {
							display: 'flex',
							fontSize: `${nameSize}px`,
							fontWeight: 800,
							lineHeight: '1.0',
							letterSpacing: '0.01em',
							textTransform: 'uppercase',
							color: WHITE,
							maxWidth: '1000px'
						}
					},
					albumName
				),
				h(
					'div',
					{
						key: 'meta',
						style: {
							display: 'flex',
							marginTop: '18px',
							fontSize: '24px',
							fontWeight: 500,
							letterSpacing: '0.06em',
							textTransform: 'uppercase',
							color: '#c0c2c8'
						}
					},
					metaParts.join('  ·  ')
				)
			)
		)
	);

	return h(
		'div',
		{
			style: {
				display: 'flex',
				position: 'relative',
				width: `${OG_WIDTH}px`,
				height: `${OG_HEIGHT}px`,
				background: `linear-gradient(135deg, ${CHARCOAL_950} 0%, ${CHARCOAL_900} 60%, ${CHARCOAL_950} 100%)`,
				fontFamily: 'sans-serif',
				overflow: 'hidden'
			}
		},
		...children
	);
}
