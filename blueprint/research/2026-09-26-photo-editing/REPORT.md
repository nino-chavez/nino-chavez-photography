# Learning Nino's Lightroom editing style

Research and proposed experiment, 2026-09-26. No model has been trained, no photo settings changed, and no Lightroom integration tested in this investigation.

**Recommendation:** Prove that five edited cloud RAWs can supply usable originals, settings, and reference renders before building a plugin or training a model. If they can, build our own assistant around approved examples and a small local correction model. Lightroom Classic is the proposed editing and rendering helper; a frontier vision model can compare difficult candidates. Nino accepts a Classic helper and wants discovered services/software used as prior art. He has now installed Classic and asked to make the cloud library available there. Adobe's native sync is the supported transport to test. Prove the return path on test assets before adopting the automated workflow, and measure total finishing time.

The reader is Nino, deciding whether this is worth trying and which first experiment will settle the largest uncertainty. The proposal assumes photography and Lightroom knowledge; ML terms are explained where they affect the decision. All sample sizes and success thresholds below are proposed experimental choices, not measured results or established minimums.

**The remembered service probably was Imagen.** Its current Personal AI Profile documentation requires at least 2,000 edited photos with a consistent style and camera profile. Training covers global adjustments; crops, masks, and removal are outside that profile's learning scope. This is a product-specific requirement, not a universal law about training data. [Imagen profile documentation](https://support.imagen-ai.com/hc/en-us/articles/6069711141009-What-is-a-Personal-AI-Profile).

Aftershoot describes a comparable personal-profile workflow, conditioned on examples of the lighting and shooting conditions it will encounter. [Aftershoot's training guidance](https://support.aftershoot.com/en/articles/6673009-what-images-to-use-when-training-a-professional-ai-profile).

**We have a starting machine and useful infrastructure; the training set is still unverified.**

- Lightroom 9.5.1 is installed as `com.adobe.lightroomCC`. The initial September 26 inventory found no Classic installation. After Nino installed it, its application plist confirmed Lightroom Classic 15.5.1, bundle `com.adobe.LightroomClassicCC7`; the app inventory also reports it running. Its account, open catalog, and sync state have not been inspected because Computer Use access is denied. The supplied screenshot shows the cloud app's Cloud/Local interface and both color and monochrome treatments.
- A read-only hardware query returned Apple M3 Max, 14 CPU cores, and 38,654,705,664 bytes of memory (36 GiB). This is a reasonable machine for a compact model experiment. No throughput or training-memory benchmark was run.
- A September 26 `df -h ~/Pictures` query reported 77 GiB available on the data volume. `/Volumes` lists only Macintosh HD and Recovery. The cloud library's full download size remains unknown; check capacity before starting a complete sync.
- A bounded walk of the local Lightroom library found 173 cached `.ARW` files and eight XMP files under `cr_settings`, plus two defaults files. Those XMP files are preset/settings resources; they are not proof of 173 paired final edits. Cache contents are not the full cloud or archive inventory.
- The checked photo import folder contains no RAW/XMP training pairs. A follow-up immutable, read-only query of `~/Pictures/Lightroom/Lightroom Catalog.lrcat` found 24 image records and 24 `.ARW` file records. Recorded capture times run from `2026-07-14T11:19:35.334` to `2026-07-14T11:25:06.665`. That small, single-session catalog does not establish a useful training corpus. Other archives and the other Mac were not inventoried; this does not prove that every past edit lives in the cloud.
- The current website ingest accepts JPEGs and writes image identifiers, camera metadata, captions, search vectors, and quality scores. It does not capture source RAW identity or Lightroom develop recipes. See [accepted inputs](../../../scripts/ingest-album.ts#L854) and [stored fields](../../../scripts/ingest-album.ts#L683).
- The current [image embeddings](../../../src/lib/ai/embeddings.ts#L10) describe finished photos for search. They could help browse reference images, but they are neither edit instructions nor a validated representation of editing taste.
- Searches of current `src`, `scripts`, and package metadata found no implemented Lightroom/XMP bridge or Adobe callback. Existing OAuth setup or partner enrollment does not establish working catalog access.

This means the first data task is recovering approved examples with their originals and settings, not uploading the website's JPEG collection to a training job.

**Lightroom integration has three distinct routes.**

| Route | Evidence available now | Implication |
|---|---|---|
| Current Lightroom app, Local tab | Adobe documents non-destructive metadata/XMP storage. Imagen documents XMP delivery and folder refresh in Local. | Fallback that retains the current app. Existing cloud copies will not automatically receive those edits. |
| Lightroom Classic plugin with native Adobe sync | Classic 15.5.1 is installed. Adobe supplies a Lua SDK and documents cloud originals and Develop settings syncing into Classic. Public plugins call `getDevelopSettings` and `applyDevelopSettings`. | Preferred candidate after data recovery. Account entitlement, SDK coverage, complete edit fidelity, and safe write-back through the same cloud assets still need a live test. |
| Lightroom cloud catalog API | Current public specification exposes GET and PUT for external XMP develop files. | Worth a capability test, but current documentation alone does not prove readout of latest internal edits or arbitrary replacement of existing edits. |

Sources: [Adobe Local editing](https://helpx.adobe.com/ie/lightroom/desktop/add-import-and-capture-photos/access-photos.html), [Imagen's actual delivery path](https://support.imagen-ai.com/hc/en-us/articles/36055702902045-Edits-not-showing-after-downloading-for-Lightroom-Bridge-and-Photoshop-Adobe-Camera-Raw), [Adobe Classic SDK](https://developer.adobe.com/lightroom-classic), and [Adobe's catalog API specification](https://raw.githubusercontent.com/AdobeDocs/lightroom-public-apis/main/static/swagger.json).

The cloud specification describes PUT `/v2/catalogs/{catalog_id}/assets/{asset_id}/xmp/develop` as creation of an external settings resource and includes an already-exists error. GET is described as returning external XMP. Neither should be promoted into a proven general-purpose catalog editor without a live round trip on a duplicate test asset.

Adobe's Photoshop v2 `/edit` surface processes supplied images and XMP into explicit outputs. It is a possible renderer, subject to entitlement and cost, rather than proof of catalog synchronization. The July 31, 2026 EOL notice is published under the Firefly Lightroom image-processing documentation; it should not be used by itself to declare the separate `lr.adobe.io` catalog API retired. [Current edit migration guide](https://developer.adobe.com/firefly-services/docs/photoshop/guides/photoshop-v2/v1-to-v2/edit-operations), [EOL notice](https://developer.adobe.com/firefly-services/docs/lightroom/getting-started/deprecation-announcement/).

The assistant should not modify Lightroom's private database directly. Store proposed edits as data and let a verified Lightroom import/plugin/API mechanism apply them.

**Native sync gives the helper a documented connection to the cloud library.** Adobe documents that cloud-to-Classic sync downloads originals and Develop settings; albums appear as collections. Only one Classic catalog can sync at a time. The FAQ also advises against using the two desktop apps together as a parallel editing workflow. These are product capabilities and constraints, not a successful test on Nino's library. [Adobe sync FAQ](https://helpx.adobe.com/lightroom-classic/desktop/technical-support/workflow-issues/sync-issues/sync-faq.html).

Nino's current next step is to make the cloud library available in Classic. Inspect the signed-in account and current catalog first. Check cloud storage use against local capacity, then set the download location before starting sync. Stop if a catalog-switch dialog would displace another active catalog. Adobe documents the cloud icon's `Start Syncing` control and the destination under `Preferences > Lightroom Sync`. Verify incoming originals, collections, and current settings before calling the library available. [Adobe sync setup](https://helpx.adobe.com/lightroom-classic/desktop/help/lightroom-mobile-desktop-features.html).

The helper still adds a local catalog and workflow overhead. Native sync may avoid repeated manual imports, but complete edit fidelity and return to the same cloud asset remain device tests. Keep experimental edits on detached copies in an unsynced test catalog. Before a real-gallery pilot, either prove the cloud return path on disposable test assets or settle a Classic-only finishing workflow explicitly. Include all transfers, reconciliation, and review in the time measurement.

**Compare three model designs on the same galleries.**

| Design | What it learns or uses | Best role | Main uncertainty |
|---|---|---|---|
| Frontier vision model with rendered feedback | Reference examples, the current image, an explicit edit request, and a restricted settings schema | First experiments and difficult cases | Numerical precision, repeatability, cost, and time per photo need measurement. A convincing critique does not establish taste fidelity. |
| Compact local predictor | Original-image features and camera/context mapped to chosen settings | Fast batch corrections after enough clean examples exist | Generalization to new lighting and dependence on camera/profile coverage |
| Similar-example retrieval plus small learned corrections | Approved examples provide the style baseline; a local predictor estimates the remaining adjustment | Recommended starting architecture | Retrieval must match light and intent, rather than merely a jersey color or gym background. |

Keep the useful part of each alternative: frontier candidate comparison, local batch prediction, and traceable examples. Defer large-model fine-tuning until simpler methods fail on a named behavior. Avoid a generative image-output model as the core editor: editable photographic adjustments should preserve the recorded subject and scene.

```text
Approved original + chosen settings + finished render
                         |
                 Local example library
                         |
New RAWs -> group by light/shot -> select a style and examples
                         |
             predict bounded per-photo corrections
                         |
               Lightroom applies and renders
                         |
            Nino accepts, adjusts, or rejects
                         |
             versioned feedback for later runs
                         |
           approved JPEG export -> existing ingest
```

**Model taste at three levels.** A reusable style controls curves and color treatment. Lighting groups within the album establish a common starting point for white balance and tone. Per-photo corrections handle exposure and subject variation. The album supplies known event facts; the model does not guess sport, team, date, or identity.

A handful of deliberately selected anchor edits from a new gallery could calibrate an unfamiliar venue. A proposed trial would use roughly 5-10 anchors selected to cover different lighting and shot conditions. This is adaptation from examples, not retraining the whole system for every album.

Black-and-white is an explicit style branch, initially selected by Nino. Averaging monochrome and color targets would teach an unwanted compromise. Crops and masks are separate stages. A subject mask must be recomputed for each photograph, rather than copied as fixed geometry. Poor mask reuse could darken a face or miss a moving arm even when global color looks consistent.

**Make each learning example reproducible.** Store original identity/hash, album and burst group, source file type, camera/lens/exposure metadata, camera profile, processing version, denoise/HDR state, a standard pre-edit render, final settings, final render, and human approval/provenance. Adobe's [Lightroom export tutorial](https://pages.adobe.com/creativecloud/en/photography-plan/lightroom/sharing) describes `Original + Settings` as retaining RAW format and edit metadata. Its [current desktop export help](https://helpx.adobe.com/lightroom/desktop/save-share-and-export/save-share-photos.html) labels the option `Original`. The exact files and completeness of settings from this installed version remain a device test.

Retain every companion file. Adobe documents that Classic 15 can put heavy edits, masks, and AI settings in an additional `.acr` sidecar. An XMP file alone cannot establish that the complete edit was recovered. This is documented Classic behavior; do not assume the cloud app exports the same file set without inspecting it. [Adobe sidecar documentation](https://helpx.adobe.com/lightroom-classic/desktop/organize-photos-in-lightroom-classic/create-xmp-acr-files.html).

Use Adobe to judge the final appearance. A generic RAW preview can be a consistent feature input, but it must not be mistaken for Adobe's rendering of the same slider values. Pin the preview recipe during training and inference. Pin the target renderer/profile during evaluation. RAW temperature and JPEG temperature have different meanings, so do not pool their numerical targets blindly.

Start with white balance and basic tone corrections around an approved style. Leave lens corrections, denoise, crop, and mask behavior fixed or manual. If existing target images contain local edits, create a separately labeled global-only reference on copies for the first model test; retain the full final reference for assessing total finishing time.

Keep `human_original`, `ai_suggested`, `human_corrected`, `human_accepted`, and `unreviewed` provenance distinct. Acceptance is useful feedback but is not an independent hand-edited example. Preserve edit dates and style versions so older preferences do not overwhelm current taste. Snapshot recipes before application, check asset identity and current recipe hash, and make repeated jobs idempotent so exposure deltas do not accumulate.

**Existing projects are prior art only.** Their code and papers help identify useful patterns and mistakes. The proposed implementation owns data capture, retrieval, learning, edit schemas, orchestration, review, and feedback. No external editing plugin or trained editing service is a planned dependency. The accepted ownership boundary is recorded in [ADR 0007](../../decisions/0007-own-photo-editing-assistant.md). Adobe Lightroom Classic is the proposed host and renderer because the target is editable Adobe adjustments. General-purpose libraries can support our implementation without outsourcing its editing decisions.

- LrGeniusAI's current source retrieves and re-scores similar training examples, interpolates settings, and adds bounded exposure/contrast compensation. Its plugin reads and applies Classic develop settings. This is a concrete reference for the retrieval design. Its reported match confidence is a similarity score, not demonstrated error calibration. [Inspected style engine](https://raw.githubusercontent.com/LrGenius/LrGeniusAI/6afa4f6ce00805d5d943e038a84d48e04d3097ce/server-rs/crates/lrg-analysis/src/style_engine.rs).
- OSLR contains a local supervised implementation, but inspected ingest code fabricates neutral targets when XMP is missing; training initializes its vision backbone without pretrained weights and randomly splits individual images. Those choices are unsuitable defaults for this pilot. Treat it as reference code requiring changes. [Ingest](https://raw.githubusercontent.com/plymouthvan/OSLR/f85e3a7ffd36f51f662cdabedc087c789e7f6a27/src/osl/ingest.py), [training](https://raw.githubusercontent.com/plymouthvan/OSLR/f85e3a7ffd36f51f662cdabedc087c789e7f6a27/src/osl/train.py).
- JarvisArt demonstrates an agent connected to Lightroom Classic and provides relevant research. Its documented setup uses a trained vision-language model and a Classic plugin. Its shipped license is explicitly for non-commercial, non-production use, so it is not the default dependency for a working photography business. [Paper](https://arxiv.org/html/2506.17612v1), [integration guide](https://github.com/LYL1015/JarvisArt/blob/main/docs/README_Inference.md), [license](https://raw.githubusercontent.com/LYL1015/JarvisArt/32a7e5845ba635a7caba480197c61df91df03796/LICENSE).

**Run the experiment in this order.**

0. **Recover five real examples before plugin work.** Select five edited RAWs from a known finished cloud album. Include different global treatments and at least one photo with a local mask when available. Record album, original identity, visible slider values, and mask state without changing them. The smallest test is cloud `Original + Settings` export (or its current `Original` equivalent) to a new folder, plus matching finished JPEG references. If native sync has already made those photos available in Classic, export the five pairs there and compare them with the cloud app's settings and appearance. Parse the XMP develop fields and compare selected values with the app. Keep any additional sidecars. File presence or nonzero values alone do not pass. Record which edits are represented and which need a rendered round trip. Resolve missing or stale settings before building the model. These five pairs seed the later test; they do not prove archive-wide coverage or how much masks contribute to the look.
1. **Prove editable write-back in Classic.** After step 0, verify that Classic's installation is complete and that entitlement permits use. Obtain Adobe's SDK reference and verify the needed methods against it. Use a separate test catalog with copied RAWs and their companion files, expanding the initial five to about ten varied examples. Build our own minimal Lua plugin to read settings, reapply unchanged settings, change one setting on a virtual copy, and export a preview. Compare the initial render with the cloud reference, confirm editable values and the intended change, then recover the previous state. Use inspected plugins only as prior art. Prove the cloud return path, or settle the alternative workflow explicitly, before the real-gallery pilot. Stop model work if the necessary integration does not work.
2. **Assemble approved pairs.** Begin with roughly 300-500 deliberate examples across several completed volleyball galleries, treating this as an experimental starting size. Remove missing targets rather than guessing them. Group duplicate originals, alternate versions, and bursts. Identify what is unavailable and how much of the real edit depends on masks.
3. **Compare the current workflow with two challengers.** Baseline: the preset/sync process Nino actually uses. Challenger A: retrieved examples with simple exposure correction. Challenger B: the same baseline with a compact local predictor. Evaluate a frontier-assisted variant on difficult cases to learn whether it earns its extra processing.
4. **Hold out entire galleries and dates.** Use at least two complete galleries as an initial pilot, including different lighting. Add an unfamiliar venue when possible. Keep each original's duplicates, alternate versions, and neighboring burst frames together in one split. Freeze retrieval, model, prompts, and thresholds before evaluation. Tuning from a held-out result requires fresh held-out galleries. Select settings without looking at held-out final targets.
5. **Judge the finished work blind.** Randomize candidate labels and comparison order. Measure complete workflows from the same starting assets to the same delivery state. Counterbalance which method is used first to reduce practice effects. Include setup, transfers between catalogs, review, crops, masks, and corrections, even when the assistant leaves them manual. Report time for each gallery and across the pilot. Inspect comparable color-managed Adobe views and final exports. Group bursts into independent comparison units. Record wins, ties, losses, serious failures, and sequence consistency. Slider error and image-distance scores are supporting diagnostics, not the result.
6. **Expand only after a useful gain.** Apply the provisional gate below, then keep whichever simpler method delivers the gain. Also record total machine time, memory, and cloud cost per gallery. No quality or time result has been measured yet.

**Count ties separately from preference.** The goal is less finishing work with preserved taste. The following thresholds are proposed pilot choices, not statistical proof or measured results:

| Check | Proposed gate |
|---|---|
| Hands-on time | At least 25% lower total time: `1 - total_assistant_time / total_baseline_time >= 0.25`. No held-out gallery may take more than 10% longer. |
| Blind comparisons | At least 30 independent units across the held-out galleries. Report wins `W`, ties `T`, and losses `L` separately, overall and by gallery. Losses must be at most 20% of units in each gallery. |
| Preference among non-ties | Compute `W / (W + L)`, excluding ties. With at least 10 non-tied units, require at least 50% wins as a provisional non-worsening screen. With 1-9 non-ties, the preference result is inconclusive and the pilot does not pass yet. |
| All ties | Report preference as undefined. At least 30 tied independent units may support only “no visible difference observed in this pilot”; advancement still requires the time and defect gates. Ties alone never establish a gain. |
| Serious visible defects | No increase in any held-out gallery. An assistant-introduced severe error blocks expansion until addressed and tested on fresh held-out work. |

This gate cannot certify equivalent quality across all future galleries. All ties with no time saved fails. All ties with real savings can support useful automation, but cannot support a claim that Nino prefers the output. Moving the old 80% threshold directly onto non-tied wins would instead demand strong subjective superiority, which is not the stated goal. A small number of decisive judgments cannot establish a stable preference rate.

**What would change the recommendation:** inability to recover original/settings pairs; a hard requirement for cloud-only updates that the API cannot satisfy; a style dominated by custom masks rather than global controls; failure on held-out venues; or maintenance cost outweighing the measured time saved. A commercial service can supply a reference comparison, but adopting it is outside the stated direction. If retrieval alone wins, there is no reason to add a trained model. If the local predictor only works in familiar gyms, scope it to those conditions and ask for anchor edits elsewhere.

**Review corrections and evidence, September 26:** The supplied peer review flagged the missing Classic prerequisite, experiment order, duplicate ADR numbering, and tie-based quality score. The current application inventory and immutable catalog queries above were checked directly. `blueprint/decisions` contains ADRs 0001-0006; [ADR 0005](../../decisions/0005-co-located-initiative-root.md) owns the existing placement rule. This plan now lives in dated research beside that decision log. Adobe's export and sidecar pages were fetched and read for this revision. The Classic SDK method names remain corroborated by public plugin source, not yet checked against the downloaded SDK reference.

Two earlier read-only workers examined repository reuse and model design. A further bounded read-only review challenged the revised evaluation gate; its useful correction is to distinguish matching quality with saved work from a preference claim. The parent checked its edge cases and owns the thresholds above. No test result is implied by those reviews.

**Investigation limits:** The investigation sent no source photos to editing services and started no photo-model inference or training run. Nino installed Classic during the review; installation is verified, account access and sync are not. Full Adobe entitlement, complete archive size, actual edit quality, and savings remain unmeasured. Step 0 is still unrun: Codex's Computer Use tool refused access to both Adobe Lightroom and Lightroom Classic. The current action is to inspect the account, catalog, and storage, then make the cloud library available through native sync and verify five original/settings/render pairs. Plugin work follows only after usable pairs are established.
