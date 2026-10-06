# ADR 0007 — Own the personalized photo-editing solution

**Status:** Accepted scope decision; implementation and model quality unproven.
**Date:** 2026-09-26.
**Source:** Nino's direction in Codex task `01a0df2b-ccb7-7c82-9e55-28805528446f`.

Build our own solution that learns Nino's editing preferences and applies editable adjustments to new galleries. Services and software found during research are prior art to reference. They are not the proposed product or its editing engine.

Nino explicitly accepts a Lightroom Classic helper. He subsequently installed Classic 15.5.1 and asked to make the cloud library available there. The proposed adapter uses Adobe's plugin interface to read and apply settings and obtain Adobe-rendered previews. Its actual coverage remains to be tested. Native Adobe sync is the supported route to test for the cloud library; account access, capacity, and the one-sync-catalog constraint must be checked before starting. Acceptance of a helper does not settle a permanent workflow across two Lightroom catalogs. Before a real-gallery pilot, prove how edits return to the existing cloud photos or obtain an explicit decision to finish those galleries in Classic.

The owned solution is responsible for:

- Extracting original/settings/render pairs with stable photo identity.
- Organizing approved examples by style, shot conditions, and gallery context.
- Retrieving examples and learning per-photo corrections.
- Validating and applying edit recipes through our own Classic adapter.
- Reviewing results and learning from Nino's accepted corrections.

Imagen, Aftershoot, LrGeniusAI, OSLR, JarvisArt, and similar work may inform architecture, failure analysis, or reference comparisons. Do not turn the project into adopting an external editing service or plugin. General-purpose libraries and models may support our implementation. A specialized third-party dependency needs a concrete explanation of the capability that cannot reasonably be provided by the owned solution.

The current candidate is example retrieval plus a compact local correction model, with optional frontier-model comparison of difficult cases. That architecture is a hypothesis to test, not an accepted performance claim. First recover five edited RAWs with their settings, through cloud export or verified native sync, and compare them with the cloud references. Only then build the small Classic settings round-trip experiment on detached copies in an unsynced test catalog. Preserve every companion file, including any ACR sidecars. Keep wins, ties, and losses separate when judging output; matching the look with less work is a different claim from preferred output. The experiment and its provisional gates live in the [feasibility plan](../research/2026-09-26-photo-editing/REPORT.md).

This record uses the decision log established by [ADR 0005](0005-co-located-initiative-root.md). It replaces the uncommitted duplicate-number draft under `docs/adr`; ADR 0002 in this log continues to mean the KNOW-vs-INFER domain model.

This decision authorizes the design direction. It does not assert that a model has been trained, a catalog integration works, cloud synchronization works, or a gallery has been edited.

## Workflow amendment — 2026-10-06

Nino uses Lightroom cloud desktop by default and explicitly directed: "skip the classic to cloud helper. i don't use classic by default". This supersedes the proposed Classic bridge as the default route. Use cloud desktop computer use for authorized review and edits, with the shared `lightroom-cloud-review` skill. Do not require Classic, enable Classic sync, or schedule its bridge experiment as the next step. Retain the existing helper and results as historical work. A direct cloud API adapter is optional and requires a separate request and capability check; excluding Classic does not authorize an API investigation. The owned-solution and human-acceptance principles above remain in force.
