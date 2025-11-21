# Implementation Plan - Foundational Chat UI

## Goal Description
Implement the "Foundational Chat UI" (Initiative 1.1) to enable a conversational agent on the site. This involves setting up the Vercel AI SDK, creating a chat widget component, and establishing a backend API route for streaming responses from Google Gemini.

## Proposed Changes

### Dependencies
#### [NEW]
- `ai` (Vercel AI SDK Core)
- `@ai-sdk/google` (Google Gemini Provider)

### Components
#### [NEW] [ChatWidget.svelte](file:///Users/nino/Workspace/02-local-dev/sites/nino-chavez-gallery/src/lib/components/ai/ChatWidget.svelte)
- A floating chat widget using `useChat` from the AI SDK.
- Features:
    - Collapsible/Expandable state.
    - Message history display.
    - Input field with auto-resize.
    - "Glassmorphism" design to match site aesthetics.

### API Routes
#### [NEW] [+server.ts](file:///Users/nino/Workspace/02-local-dev/sites/nino-chavez-gallery/src/routes/api/chat/+server.ts)
- POST handler to process chat messages.
- Uses `streamText` with `google('gemini-1.5-flash')`.
- Includes a system prompt with context about Nino Chavez (Bio, Pricing, Navigation).

### Layout
#### [MODIFY] [+layout.svelte](file:///Users/nino/Workspace/02-local-dev/sites/nino-chavez-gallery/src/routes/+layout.svelte)
- Import and mount `<ChatWidget />` so it appears globally.

## Verification Plan

### Manual Verification
- **UI Testing**:
    - Verify the widget opens/closes smoothly.
    - Check responsiveness on mobile vs desktop.
    - Validate "Glassmorphism" styling matches the theme.
- **Functional Testing**:
    - Send a message (e.g., "Hi, who is Nino?").
    - Verify the response streams in real-time.
    - Check if the bot answers correctly based on the system prompt.
