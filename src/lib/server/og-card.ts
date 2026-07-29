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

/**
 * Crawlers refetch unfurl images and the WASM render is not free — but these responses
 * encode an authorization decision, so the edge TTL is a bound on how long a revoked
 * album stays visible, not just a performance knob.
 *
 * This was `s-maxage=86400`. When the unlisted gate was added to the album card, two
 * already-cached private albums kept serving their cover photo, and could not be evicted:
 * the router reaches the app via a subrequest to nino-chavez-photography.pages.dev, and
 * Cloudflare caches under the SUBREQUEST hostname, which is a zone we do not own and
 * therefore cannot purge. A day is far too long to wait for a privacy change to take hold
 * when there is no override.
 *
 * Ten minutes bounds that. Cards are fetched by a handful of crawlers per album, Facebook
 * and LinkedIn cache them again on their side, and a re-render is one Satori pass — so the
 * saving from a longer TTL was small and the exposure it bought was not.
 *
 * `stale-while-revalidate` is dropped because it never applied: per Cloudflare's cache
 * docs, `s-maxage` disables it.
 */
export const OG_CACHE_CONTROL = 'public, max-age=300, s-maxage=600';

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

export interface PhotoCardData {
	/** Usually the album name — the same string the photo page uses as its title. */
	title: string;
	photoDataUri: string | null;
	/** Rendered under the title as "SPORT · CATEGORY · DATE"; empty parts are dropped. */
	sport?: string | null;
	category?: string | null;
	/** ISO date; only the YYYY-MM-DD portion is used. */
	photoDate?: string | null;
}

/**
 * Single-photo card. A split layout, NOT the album card's full-bleed cover.
 *
 * WHY THE PHOTO IS CONTAINED RATHER THAN CROPPED
 *
 * 16,140 of the 19,767 photos in this gallery are portrait — 82%. Cover-cropping
 * a 2:3 action shot into a 1.91:1 card keeps a horizontal band through the middle,
 * which is where a volleyball player's torso is and where their arms and the ball
 * are not. The album card can crop because its subject is an event, not a frame;
 * a photo card whose whole purpose is that one photo cannot.
 *
 * So the photo sits in a left panel at its own aspect ratio and the branding moves
 * beside it. A landscape photo letterboxes in the same panel and still reads.
 *
 * The card exists at all because the photo page previously advertised the raw
 * `thumbnail` variant — 150×224 — as its og:image. That is under Facebook's
 * documented 200×200 minimum, so a shared photo unfurled with no image or a
 * postage stamp, on a page whose entire subject is a photograph.
 */
export function buildPhotoCard({ title, photoDataUri, sport, category, photoDate }: PhotoCardData) {
	const PANEL_WIDTH = 620;

	const metaParts = [sport, category, photoDate?.slice(0, 10)].filter(Boolean) as string[];
	// Long event names wrap into the narrower text column, so the ramp starts smaller
	// than the album card's.
	const titleSize = title.length > 46 ? 34 : title.length > 28 ? 42 : 52;

	const photoPanel = h(
		'div',
		{
			key: 'panel',
			style: {
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				width: `${PANEL_WIDTH}px`,
				height: `${OG_HEIGHT}px`,
				background: CHARCOAL_950,
				overflow: 'hidden'
			}
		},
		photoDataUri
			? h('img', {
					key: 'photo',
					src: photoDataUri,
					style: {
						maxWidth: `${PANEL_WIDTH}px`,
						maxHeight: `${OG_HEIGHT}px`,
						objectFit: 'contain'
					}
				})
			: // No decodable image: say which photo this is rather than showing an
				// anonymous brand tile. See fetchImageDataUri for when that happens.
				h(
					'div',
					{
						key: 'placeholder',
						style: {
							display: 'flex',
							fontSize: '26px',
							fontWeight: 600,
							letterSpacing: '0.08em',
							textTransform: 'uppercase',
							color: GOLD_500,
							padding: '0 48px',
							textAlign: 'center'
						}
					},
					title
				)
	);

	const textPanel = h(
		'div',
		{
			key: 'text',
			style: {
				display: 'flex',
				flexDirection: 'column',
				justifyContent: 'center',
				width: `${OG_WIDTH - PANEL_WIDTH}px`,
				height: `${OG_HEIGHT}px`,
				padding: '0 56px'
			}
		},
		h('div', {
			key: 'bar',
			style: { display: 'flex', width: '64px', height: '8px', borderRadius: '4px', background: GOLD_500 }
		}),
		h(
			'div',
			{
				key: 'title',
				style: {
					display: 'flex',
					marginTop: '28px',
					fontSize: `${titleSize}px`,
					fontWeight: 800,
					lineHeight: '1.05',
					letterSpacing: '0.01em',
					textTransform: 'uppercase',
					color: WHITE
				}
			},
			title
		),
		...(metaParts.length
			? [
					h(
						'div',
						{
							key: 'meta',
							style: {
								display: 'flex',
								marginTop: '20px',
								fontSize: '20px',
								fontWeight: 500,
								letterSpacing: '0.06em',
								textTransform: 'uppercase',
								color: '#c0c2c8'
							}
						},
						metaParts.join('  ·  ')
					)
				]
			: []),
		h('div', { key: 'wm', style: { display: 'flex', marginTop: '36px' } }, wordmark(GOLD_500, 18))
	);

	return h(
		'div',
		{
			style: {
				display: 'flex',
				flexDirection: 'row',
				width: `${OG_WIDTH}px`,
				height: `${OG_HEIGHT}px`,
				background: `linear-gradient(135deg, ${CHARCOAL_950} 0%, ${CHARCOAL_900} 60%, ${CHARCOAL_950} 100%)`,
				fontFamily: 'sans-serif',
				overflow: 'hidden'
			}
		},
		photoPanel,
		textPanel
	);
}

export interface AlbumCardData {
	albumName: string;
	photoDataUri: string | null;
	photoCount: number;
	/** Omitted or 0 renders no video segment. Some albums are videos only. */
	videoCount?: number;
	sport?: string | null;
}

/**
 * Album card. Full-bleed cover photo (when available) with a bottom charcoal
 * scrim, a gold accent bar, the album name, photo-count meta, and the wordmark —
 * matching the chosen "photo + branded overlay" treatment.
 */
export function buildAlbumCard({
	albumName,
	photoDataUri,
	photoCount,
	videoCount = 0,
	sport
}: AlbumCardData) {
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

	// A zero count is omitted rather than printed. A video-only album card read
	// "0 photos", which is the same defect the album header carried.
	const metaParts: string[] = [];
	if (photoCount > 0) {
		metaParts.push(`${photoCount.toLocaleString('en-US')} photo${photoCount === 1 ? '' : 's'}`);
	}
	if (videoCount > 0) {
		metaParts.push(`${videoCount.toLocaleString('en-US')} video${videoCount === 1 ? '' : 's'}`);
	}
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
