---
name: gallery-debugger
description: Debug and performance test the Nino Chavez Gallery using agent-browser. Use when asked to debug pages, check performance, verify image loading, test navigation, audit accessibility, or capture screenshots for visual regression.
---

# Gallery Debugger

Debug and performance test the Nino Chavez Gallery using agent-browser CLI.

## Prerequisites

```bash
# Verify agent-browser is installed
agent-browser --version

# If not installed:
npm install -g agent-browser
agent-browser install
```

## Gallery URLs

| Environment | URL |
|-------------|-----|
| Production | https://ninochavez.co/photography |
| Local Dev | http://localhost:5173 |
| Preview | Check Vercel deployment URL |

## Quick Commands

### Page Debugging

```bash
# Open page and get AI-friendly snapshot
agent-browser open https://ninochavez.co/photography/explore --wait-until=networkidle
agent-browser snapshot

# Check console and errors
agent-browser console
agent-browser errors

# View network requests
agent-browser network requests

# Close when done
agent-browser close
```

### Screenshot Capture

```bash
# Full page screenshot
agent-browser open https://ninochavez.co/photography/explore --wait-until=networkidle
agent-browser screenshot .temp/screenshots/explore-$(date +%Y%m%d).png --full

# Specific viewport (mobile)
agent-browser set viewport 375 812
agent-browser screenshot .temp/screenshots/explore-mobile.png
```

### Performance Testing

```bash
# Measure page load
agent-browser open https://ninochavez.co/photography/explore --wait-until=networkidle
agent-browser eval "performance.timing.loadEventEnd - performance.timing.navigationStart"

# Check image loading status
agent-browser eval "Array.from(document.images).filter(img => !img.complete).length"

# Get all image sources for verification
agent-browser eval "JSON.stringify(Array.from(document.images).map(img => ({src: img.src, loaded: img.complete, width: img.naturalWidth})))"
```

## Debugging Workflows

### 1. Debug Photo Grid Loading

Check if photos are loading correctly on the explore page:

```bash
# Step 1: Open explore page
agent-browser open https://ninochavez.co/photography/explore --wait-until=networkidle

# Step 2: Get page structure
agent-browser snapshot > .temp/analysis/explore-snapshot.txt

# Step 3: Check for broken images
agent-browser eval "JSON.stringify(Array.from(document.querySelectorAll('img')).filter(img => !img.complete || img.naturalWidth === 0).map(img => ({ src: img.src, alt: img.alt })))"

# Step 4: Check for errors
agent-browser errors

# Step 5: Screenshot for visual verification
agent-browser screenshot .temp/screenshots/photo-grid-debug.png --full

agent-browser close
```

### 2. Debug Lightbox Functionality

Test lightbox opens and displays correctly:

```bash
# Step 1: Open explore page
agent-browser open https://ninochavez.co/photography/explore --wait-until=networkidle

# Step 2: Get snapshot to find photo cards
agent-browser snapshot -i  # Interactive elements only

# Step 3: Click first photo card (use @ref from snapshot)
agent-browser click @e10  # Adjust ref based on snapshot

# Step 4: Wait for lightbox animation
agent-browser wait 500

# Step 5: Verify lightbox opened
agent-browser snapshot > .temp/analysis/lightbox-snapshot.txt

# Step 6: Screenshot lightbox state
agent-browser screenshot .temp/screenshots/lightbox-open.png

# Step 7: Close lightbox (Escape key)
agent-browser press Escape

agent-browser close
```

### 3. Debug Filter Functionality

Test sport/category filters work:

```bash
# Step 1: Open explore page
agent-browser open https://ninochavez.co/photography/explore --wait-until=networkidle

# Step 2: Snapshot to find filter elements
agent-browser snapshot -i

# Step 3: Click a sport filter (e.g., volleyball)
agent-browser click @e5  # Adjust ref based on snapshot

# Step 4: Wait for filter to apply
agent-browser wait 1000

# Step 5: Verify URL changed
agent-browser get url

# Step 6: Verify photo count
agent-browser eval "document.querySelectorAll('[data-photo-card]').length"

# Step 7: Screenshot filtered state
agent-browser screenshot .temp/screenshots/filtered-volleyball.png

agent-browser close
```

### 4. Performance Audit

Comprehensive performance check:

```bash
# Step 1: Open with performance tracking
agent-browser open https://ninochavez.co/photography/explore --wait-until=networkidle

# Step 2: Get Core Web Vitals approximation
agent-browser eval "JSON.stringify({
  pageLoad: performance.timing.loadEventEnd - performance.timing.navigationStart,
  domContentLoaded: performance.timing.domContentLoadedEventEnd - performance.timing.navigationStart,
  firstPaint: performance.getEntriesByType('paint').find(p => p.name === 'first-paint')?.startTime,
  firstContentfulPaint: performance.getEntriesByType('paint').find(p => p.name === 'first-contentful-paint')?.startTime,
  resourceCount: performance.getEntriesByType('resource').length
})"

# Step 3: Check image sizes (for optimization opportunities)
agent-browser eval "JSON.stringify(Array.from(document.images).filter(img => img.complete).map(img => ({
  src: img.src.split('/').pop(),
  displaySize: img.width + 'x' + img.height,
  naturalSize: img.naturalWidth + 'x' + img.naturalHeight,
  oversized: img.naturalWidth > img.width * 2
})).filter(img => img.oversized))"

# Step 4: Network analysis
agent-browser network requests

agent-browser close
```

### 5. Accessibility Audit

Check accessibility using the accessibility tree:

```bash
# Step 1: Open page
agent-browser open https://ninochavez.co/photography/explore --wait-until=networkidle

# Step 2: Get accessibility tree snapshot
agent-browser snapshot > .temp/analysis/a11y-tree.txt

# Step 3: Check for images without alt text
agent-browser eval "JSON.stringify(Array.from(document.images).filter(img => !img.alt || img.alt.trim() === '').map(img => img.src.split('/').pop()))"

# Step 4: Check for focusable elements
agent-browser eval "document.querySelectorAll('a, button, input, [tabindex]').length"

# Step 5: Test keyboard navigation
agent-browser press Tab
agent-browser snapshot -i  # Check focus moved correctly

agent-browser close
```

### 6. Mobile Responsiveness Check

Test mobile viewport:

```bash
# Step 1: Set mobile viewport (iPhone 14)
agent-browser set device "iPhone 14"

# Step 2: Open page
agent-browser open https://ninochavez.co/photography/explore --wait-until=networkidle

# Step 3: Screenshot mobile view
agent-browser screenshot .temp/screenshots/explore-mobile-iphone14.png --full

# Step 4: Check if elements are visible
agent-browser snapshot -i

# Step 5: Test touch interactions (tap photo)
agent-browser click @e8  # First photo card

# Step 6: Screenshot lightbox on mobile
agent-browser wait 500
agent-browser screenshot .temp/screenshots/lightbox-mobile.png

agent-browser close
```

## Visual Regression Workflow

For comparing before/after changes:

```bash
# Before changes - capture baseline
agent-browser open https://ninochavez.co/photography/explore --wait-until=networkidle
agent-browser screenshot .temp/screenshots/baseline/explore.png --full
agent-browser set viewport 390 844
agent-browser screenshot .temp/screenshots/baseline/explore-mobile.png
agent-browser close

# After changes - capture current (local dev)
agent-browser open http://localhost:5173/explore --wait-until=networkidle
agent-browser screenshot .temp/screenshots/current/explore.png --full
agent-browser set viewport 390 844
agent-browser screenshot .temp/screenshots/current/explore-mobile.png
agent-browser close

# Compare manually or with image diff tool
```

## Common Issues & Solutions

### Images Not Loading
```bash
# Check for failed network requests
agent-browser network requests
agent-browser errors

# Check if Supabase URLs are correct
agent-browser eval "document.images[0]?.src"
```

### Slow Page Load
```bash
# Find large resources
agent-browser eval "JSON.stringify(performance.getEntriesByType('resource').filter(r => r.transferSize > 100000).map(r => ({ name: r.name.split('/').pop(), size: Math.round(r.transferSize/1024) + 'KB' })))"
```

### Filter Not Working
```bash
# Check URL params after filter click
agent-browser get url

# Check if photos updated
agent-browser eval "document.querySelectorAll('[data-photo-card]').length"
```

### Lightbox Not Opening
```bash
# Check for JavaScript errors
agent-browser errors

# Verify click target is correct
agent-browser snapshot -i  # Find correct @ref
```

## Output Directory

All debugging output goes to `.temp/` (gitignored):

```
.temp/
├── screenshots/
│   ├── baseline/       # Before changes
│   └── current/        # After changes
├── analysis/
│   ├── explore-snapshot.txt
│   └── a11y-tree.txt
└── logs/
```

## Integration with Development

### Before PR Submission
```bash
# Quick sanity check
agent-browser open http://localhost:5173/explore --wait-until=networkidle
agent-browser errors  # Should be empty or minimal
agent-browser eval "Array.from(document.images).filter(i => !i.complete).length"  # Should be 0
agent-browser screenshot .temp/screenshots/pr-preview.png --full
agent-browser close
```

### After Vercel Deployment
```bash
# Verify production deployment
agent-browser open https://ninochavez.co/photography --wait-until=networkidle
agent-browser errors
agent-browser screenshot .temp/screenshots/prod-$(date +%Y%m%d).png --full
agent-browser close
```

## Command Reference

| Command | Purpose |
|---------|---------|
| `agent-browser open <url>` | Navigate to URL |
| `agent-browser snapshot` | Get accessibility tree with @refs |
| `agent-browser snapshot -i` | Interactive elements only |
| `agent-browser click @e5` | Click element by ref |
| `agent-browser eval "<js>"` | Run JavaScript |
| `agent-browser get url` | Get current URL |
| `agent-browser get title` | Get page title |
| `agent-browser console` | View console logs |
| `agent-browser errors` | View page errors |
| `agent-browser network requests` | View network requests |
| `agent-browser screenshot <path>` | Take screenshot |
| `agent-browser screenshot <path> --full` | Full page screenshot |
| `agent-browser set viewport <w> <h>` | Set viewport size |
| `agent-browser set device "<name>"` | Set device emulation |
| `agent-browser press <key>` | Press keyboard key |
| `agent-browser wait <ms>` | Wait milliseconds |
| `agent-browser close` | Close browser |
