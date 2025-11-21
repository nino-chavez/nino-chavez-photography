# Conversational Agent Audit & Implementation Strategy

## Executive Summary
**Verdict: YES, proceed immediately.**
The "Tier 3: AI Visionary" approach is not only feasible but **already partially built**. Your existing infrastructure (`enrich-local-photos.ts` + Supabase `photo_metadata`) solves the hardest part of an AI search agent: structured data.

## Technical Fit Analysis

### 1. Existing Infrastructure (The "Hidden" Advantage)
You are not starting from zero. You have a massive head start:
*   **Data Pipeline**: Your `enrich-local-photos.ts` script already uses Gemini to tag photos with `sport_type`, `play_type`, `emotion`, and `intensity`.
*   **Database**: Supabase is already storing this rich metadata.
*   **Stack**: SvelteKit + Vercel is the ideal home for the Vercel AI SDK.

### 2. Feasibility by Tier

| Tier | Proposal | Feasibility | Assessment |
| :--- | :--- | :--- | :--- |
| **Tier 1** | **Smart Assistant** (Intercom/Chatwoot) | 🟢 High | **Not Recommended.** It feels "bolted on" and generic. It clashes with your "Systems Architect" brand. |
| **Tier 2** | **Visual Navigator** (Vercel AI SDK) | 🟢 High | **Good starting point.** Can be built natively in SvelteKit without external monthly fees (unlike Intercom). |
| **Tier 3** | **AI Visionary** (Structured Query) | 🟢 **High (Surprisingly)** | **RECOMMENDED.** You already have the data. We just need to give an LLM access to query your Supabase `photo_metadata` table. |

## Recommended Implementation Plan: "The Hybrid"

We should skip Tier 1 entirely. It's too generic for your brand. Instead, we will build a **Native SvelteKit AI Assistant** that combines Tier 2 (Chat UI) and Tier 3 (Data Querying).

### Phase 1: The Foundation (Tier 2+)
*   **Tech**: Vercel AI SDK (`useChat`) + Gemini Flash (fast/cheap).
*   **UI**: A sleek, "Glassmorphism" chat interface that floats on the bottom right or lives in the `/explore` page.
*   **Knowledge**: System prompt aware of your pricing, bio, and navigation structure.

### Phase 2: The "Visionary" Search (Tier 3)
*   **Mechanism**: **RAG (Retrieval Augmented Generation)** or **Tool Calling**.
*   **Workflow**:
    1.  User asks: *"Show me intense volleyball blocks from last week."*
    2.  LLM calls a tool: `searchPhotos({ sport: 'volleyball', action: 'block', intensity: 'high' })`.
    3.  App queries Supabase `photo_metadata`.
    4.  App displays a grid of matching photos *inside* the chat bubble.

## Why this wins
1.  **Cost**: You pay pennies for Gemini API calls vs $79/mo for Intercom.
2.  **Brand**: It proves your "Systems Thinking" + "Art" value proposition.
3.  **UX**: It solves the "Parent Problem" (finding their kid) better than any filter bar could.

## Next Steps
1.  **Approve this plan.**
2.  **Scaffold the Chat Component**: Create a `ChatWidget.svelte` using Vercel AI SDK.
3.  **Connect to Gemini**: Set up the API route handler.
