# Project Roadmap: The AI-Powered Photography Experience

## 1. Vision

Our goal is to create a next-generation user experience that transcends traditional photo galleries. By leveraging our sophisticated, AI-driven data pipeline, we will build an intelligent conversational agent and dynamic gallery features that embody the brand's identity of merging "Systems Thinking" with "Art." This roadmap outlines the key themes and initiatives to achieve this vision.

---

## 2. Theme 1: The "AI Visionary" Conversational Agent

This is the primary new feature, moving beyond generic chatbots to a deeply integrated, data-aware assistant that can actively help users find content. We will skip a generic "Tier 1" agent and build this directly.

### 🔹 Initiative 1.1: Foundational Chat UI
*   **Goal:** Implement a native SvelteKit chat component.
*   **Tasks:**
    *   Scaffold `ChatWidget.svelte` and associated UI components.
    *   Integrate the Vercel AI SDK for state management (`useChat`).
    *   Develop a backend API route in SvelteKit that connects to a streaming LLM (Google Gemini).
    *   Create a system prompt that gives the agent knowledge of the site's structure, your bio, and general pricing/contact information.

### 🔹 Initiative 1.2: Intelligent Photo Search (Tool Calling)
*   **Goal:** Enable the AI agent to search for photos using natural language.
*   **Tasks:**
    *   Develop a `searchPhotos` "tool" that the LLM can call.
    *   This tool will accept parameters like `sport`, `play_type`, `emotion`, and `intensity`.
    *   The tool's function will be to translate these parameters into a structured SQL query against the Supabase `photo_metadata` table.
    *   Design and implement a UI component to render a grid of the returned photo results directly within the chat interface, providing a seamless search-and-discover experience.

---

## 3. Theme 2: Data Pipeline & CV Enhancements

To power the AI Visionary agent and future features, we must evolve the data pipeline to be more automated, efficient, and comprehensive.

### 🔹 Initiative 2.1: Pipeline Automation & Efficiency
*   **Goal:** Eliminate the manual, multi-step nature of the current enrichment process.
*   **Tasks:**
    *   **Refactor API Calls:** Modify the `sync-smugmug-album.ts` script to use SmugMug API `_expand` parameters, eliminating the inefficient N+1 query pattern and dramatically speeding up the sync process.
    *   **Automate the Workflow:** Consolidate the `enrich`, `upload`, and `sync` steps into a single, automated workflow managed by a Supabase Edge Function. This function could be triggered on a schedule or manually from a simple admin interface.

### 🔹 Initiative 2.2: Closing the Data Gaps (Next-Gen CV)
*   **Goal:** Enrich our data with high-value metadata currently overlooked by the process.
*   **Tasks:**
    *   **Jersey Number Recognition:**
        1.  Update the `enrich-local-photos.ts` script and its `COMBINED_PROMPT` to instruct Gemini to extract jersey numbers into a new `jersey_number: number | null` field.
        2.  Add the corresponding `jersey_number` column to the `photo_metadata` table in Supabase.
        3.  Create a backfill script to run this targeted analysis on existing photos, enabling queries like "find all photos of #12".
    *   **Vector Similarity Search:**
        1.  Enable the `pgvector` extension in your Supabase project.
        2.  Create a new script to generate vector embeddings for each photo using a Google Gemini embedding model.
        3.  Store these embeddings in a new `vector` column in the `photo_metadata` table, preparing for a "find similar photos" feature.

---

## 4. Theme 3: Dynamic Gallery Experiences

This theme focuses on leveraging our rich, structured data to create curated and personalized gallery experiences that go far beyond static albums.

### 🔹 Initiative 3.1: Curated Collections
*   **Goal:** Automatically generate "best of" and narrative-driven collections.
*   **Tasks:**
    *   **"Best Of" Galleries:** Create new pages or database views that display photos matching "portfolio-worthy" criteria (e.g., `sharpness > 8.5 AND emotional_impact > 8.0`).
    *   **The "Story Engine":** Build UI components that leverage the subjective `Bucket 2` metadata. For example, create a "Clutch Moments" collection by filtering for `emotion: "determination"` and `time_in_game: "final_5_min"`.

### 🔹 Initiative 3.2: Similarity-Powered Exploration
*   **Goal:** Allow users to explore the gallery in a non-linear fashion.
*   **Tasks:**
    *   Implement a "Find similar photos" button on the photo detail page.
    *   This feature will use the vector embeddings (from Initiative 2.2) to perform a similarity search in Supabase, showing the user photos with a similar style, composition, or emotional tone.
