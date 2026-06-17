# Image Assets

## Open Graph / Share Images

Share cards are now **generated dynamically** (1200×630 PNG, charcoal + gold theme)
— there is no static `og-image.jpg` to maintain:

- **General site:** `/og.png` — branded card with a hero action photo + wordmark
  + "MOTION. EMOTION. Frame by Frame." tagline. Built by
  `src/routes/og.png/+server.ts` via the helpers in `src/lib/server/og-card.ts`.
- **Albums:** `/albums/[slug]/og.png` — cover photo + gold accent bar + album name
  + photo count + wordmark. Built by `src/routes/albums/[slug]/og.png/+server.ts`.
- **Photos:** the photo's own image (set in `photo/[id]/+page.server.ts`).

All og/twitter tags are emitted once by the root layout (`+layout.svelte`) from each
route's `data.seo`. Renderer: `@cf-wasm/og` (Satori + resvg) on the Cloudflare
Workers runtime — mirrors the rally-hq recap-card setup.

### Testing social unfurls:
- **Facebook Debugger:** https://developers.facebook.com/tools/debug/
- **Twitter Card Validator:** https://cards-dev.twitter.com/validator
- **LinkedIn Post Inspector:** https://www.linkedin.com/post-inspector/

## Favicon (Future)

Add your favicon here:
- `favicon.ico` (16x16, 32x32 multi-size)
- `favicon.svg` (vector, preferred)
- `apple-touch-icon.png` (180x180)
- `favicon-192.png` (192x192 for Android)
- `favicon-512.png` (512x512 for Android)
