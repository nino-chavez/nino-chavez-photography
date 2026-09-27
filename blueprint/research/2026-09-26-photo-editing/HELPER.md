# Lightroom round-trip helper

The owned helper can read, apply, render, and restore edits in Lightroom Classic 15.5.1. A live test on the five recovered examples preserved their full recipes and left the source masters unchanged. Separate cloud tests changed and restored an SDR portrait and an HDR sports photo using Adaptive B&W; both have two user mask groups. Cloud Lightroom's view and exports confirmed both steps. The preparation tool now inventories learning examples and separates evaluation inputs from saved edits. Learned taste remains untested.

## Install and run

The plugin is at `tools/lightroom/photo-editing-roundtrip.lrplugin`.

1. In Lightroom Classic 15.5.1, open the detached `Photo Editing Recovery Test.lrcat` catalog.
2. Open **File > Plug-in Manager**, choose **Add**, then select that `.lrplugin` folder.
3. In the Recovery Test catalog, select one to five of `DSC06706`, `DSC09233`, `DSC09234`, `DSC09430`, and `DSC09442` in the existing pilot originals folder.
4. Choose **Library > Plug-in Extras > Photo Editing: Export selected recipes** first. It reads only.
5. Review the receipt, then choose **Photo Editing: Run bounded round-trip probe**. Lightroom leaves named virtual copies in the test catalog for inspection.

Receipts and rendered JPEGs are written outside Git under `~/Pictures/Photo Editing Pilot/2026-09-26/plugin-receipts/<run-id>/`. They include complete nested recipe snapshots, stable identities, stage readback, output paths, application/plugin versions, and errors. Numeric Lua table keys are encoded as JSON object keys. Restoration uses the original table held in memory; loading a saved receipt after a crash is not implemented. Do not add receipts or photo data to Git.

## Limits enforced in v0

The original recipe-export and round-trip commands fail closed unless the active catalog is exactly `~/Pictures/Photo Editing Pilot/2026-09-26/Photo Editing Recovery Test/Photo Editing Recovery Test.lrcat`. They accept only one to five selected image masters, only from `~/Pictures/Photo Editing Pilot/2026-09-26/originals`, and only the five named pilot files. Videos, virtual copies, unavailable originals, missing stable identity, changed selection, stale virtual-copy identity, and an edited source master stop the run. It rechecks the active catalog and current recipe inside the write gate. A concurrent helper run is refused.

The probe saves the full settings table. It does not reduce the baseline to sliders. It creates virtual copies, renders a 2,048-pixel JPEG baseline, reapplies the unchanged settings, renders again, applies only `Exposure2012 +0.25`, renders, restores the full saved settings, and renders once more. It checks source-master recipes after each write and restores virtual copies during cleanup if rendering fails. It does not delete the copies.

`getDevelopSettings()` is explicitly experimental in the supplied SDK reference. Its table is therefore stored and compared as an opaque full recipe, including nested data such as profiles, `AILook`, masks, HDR-related fields, curves, and future fields returned by this host. The plugin does not use `load` or `loadstring`.

The export values come from a preset saved through Classic 15.5.1 after the recovery comparison: JPEG quality 100, HDR sRGB (Rec. 709), HDR Output, Maximize Compatibility, a 2,048-by-2,048 bounding box, and no enlargement or output sharpening. The SDK uses prefixed keys such as `LR_export_colorSpace = "sRGB_hdr"` and a JPEG quality value of `1`. The saved preset is private evidence beside the pilot files. Successful export alone does not establish correct HDR rendering; the file and visual comparison below is separate evidence.

## Sources and checks

Adobe’s [Lightroom Classic developer page](https://developer.adobe.com/lightroom-classic/) was fetched on 2026-09-26. It says Lightroom plugins use Lua and can add menu items and customize rendering/export. The local method references used here are `.temp/lightroom-sdk-reference/LrPhoto.html`, `LrCatalog.html`, `LrExportSession.html`, and `LrExportRendition.html`.

`.temp/lightroom-sdk-reference/SOURCE.json` records that those local pages were redistributed from `lrc.mcor.dev`. They are not an Adobe Console download and do not prove the newest SDK. Adobe Console required sign-in, so the latest official SDK archive was not obtained. The observed host behavior below is independent evidence for this installed version.

Run the focused unit evidence from the repository root:

```
lua tools/lightroom/test/CoreTests.lua
luac -p tools/lightroom/photo-editing-roundtrip.lrplugin/Core.lua tools/lightroom/photo-editing-roundtrip.lrplugin/Runtime.lua tools/lightroom/photo-editing-roundtrip.lrplugin/Info.lua
```

The tests intentionally make bad targets and stale virtual-copy recipes fail. They cover target restrictions, nested recipe serialization, the bounded exposure rule, stale selection and recipe refusal before and inside the write gate, restoration after a simulated render failure, and an SDK error after applying exposure. Runtime error handling uses `LrTasks.pcall`, which permits yielding; ordinary Lua `pcall` is used only by the mock adapter. They are mock evidence only. They do not install the plugin or prove Lightroom SDK runtime, rendering, HDR, source integrity, restoration, or undo.

Current local result: all nine focused tests pass with Lua and LuaJIT, and `luac -p` accepts each plugin Lua file. Classic 15.5.1 has loaded the helper and exported all five complete SDK recipes. The live results below are separate from those mock tests.


## Live result, September 26

Classic loaded the plugin from the `codex/photo-editing-helper` worktree. The recipe export returned all five full SDK recipes, including three active `AILook` blocks, three photos with masks, and four HDR recipes. The parent corrected the worker’s asynchronous error handling, export settings, missing-file checks, in-gate stale-recipe check, and partial-write cleanup before running the probe. An initial read-only attempt then exposed a host detail: batch metadata reports a numeric `masterPhoto` value for masters. The adapter now requests that object only for virtual copies. That failed attempt made no edits.

Run `lr-20260927T004102Z-700802` completed all four stages on five virtual copies: baseline, full-recipe reapply, exposure increased by 0.25, and full-recipe restoration. Its SDK readbacks matched the intended state; the receipt reported no errors. An independent read-only catalog comparison found all five source-master recipe strings and identities unchanged against the pre-install baseline. The twenty JPEGs are an execution diagnostic, not an editing-quality score.

`tools/lightroom/compare_renders.py` compares stored base pixels, ICC profiles, HDR gain-map pixels, and gain-map metadata. It creates an SDR-base contact sheet. It requires Pillow and NumPy and refuses to overwrite an existing comparison folder. Pass the private job folder and `--reference <reference-folder>`; optional `--output` names a new result folder.

| Render diagnostic | Mean absolute channel difference, 0–255 scale |
|---|---:|
| Cloud reference to helper baseline | 0.000009–0.000196 |
| Baseline to unchanged-recipe render | 0.000002–0.000160 |
| Baseline to exposure-adjusted render | 9.625–14.796 |
| Baseline to restored HDR-photo base images | 0.000024–0.000131 |
| Baseline to restored SDR image, DSC06706 | 0.071788 |
| Baseline to restored HDR gain maps | 0.000164–0.000562 |

All restored ICC profiles and HDR gain-map parameters match the baseline. For the SDR example, the 99th-percentile channel difference is 1 and the maximum is 5; its cause remains unknown. The parent opened the comparison sheet: the adjustment row is brighter and the restored row appears consistent with the references at the displayed size. This does not certify bit-identical rendering, HDR monitor appearance, or full-resolution delivery.

The comparator also detected the real earlier Adaptive-profile import defect: it measured differences of 9.307–16.198 against those broken exports. A second probe invocation with generated virtual copies selected was rejected before a new job or write, exercising a real Classic input guard. The catalog retains five masters and five restored virtual copies, with zero synced photos.

Lightroom grouped the SDK edits into one Undo entry. Undo moved to the preceding Create Virtual Copies entry, and Redo returned to the probe entry. Both left the recipes at the saved state because the grouped operation has zero net change. **Individual-adjustment Undo was not demonstrated.** Normal recipe restoration was demonstrated by the adjustment, readback, and restored-render stages. Cleanup after a real host export failure and recovery after an app crash remain untested.

Private evidence is under the run folder: `receipt.json`, `verification/metrics.json`, `verification/comparison.jpg`, `verification/master-integrity.json`, `verification/undo-evidence.json`, `verification/acceptance.json`, and `verification-negative-control/`. The independent baseline is `helper-preflight-recipes.json` in the pilot root. The acceptance receipt records hashes of the plugin files tested.

Operator dispatch `671c32ae-e8bb-465f-ac9a-0eeb0da2c533` completed successfully. The parent reviewed, corrected, installed, and exercised its output. The requested route was Terra/high; the host did not report the observed child model or effort, so actual model selection remains unverified. The plugin is installed from this worktree on this Mac. Keep it available while Lightroom loads the plugin from it.

## The cloud copy was edited and restored

Version `0.1.0.3` provides three separate commands under **Library > Plug-in Extras**:

1. **Capture cloud test baseline** saves complete recipes without editing a photo.
2. **Apply cloud test exposure** changes only `Exposure2012` by `+0.25` and leaves the result available for cloud observation.
3. **Restore cloud test baseline** restores the full saved recipe and checks readback.

These commands use a separate guard from the detached-catalog probe. A private, non-executable permit must name one exact catalog, an evidence folder, and one to three exact photo UUIDs. Capture resolves those UUIDs directly through the SDK; the UI selection grants no edit access. Apply and restore resolve the saved UUIDs again and check identity, file availability, catalog, and the entire current recipe before writing. They repeat the recipe check inside Lightroom's write gate. Repeated apply does not increase exposure again. Unexpected intervening edits stop restoration instead of being overwritten.

A permitted target can be a master or a virtual copy. For a virtual copy, capture also saves its source master's UUID, path, and complete recipe. The master cannot be another permitted edit target. Its identity and recipe are checked before, inside, and after each write. The helper never writes that protected master. Copy/master relationships must remain stable across commands.

An active permit must live at `~/Pictures/Photo Editing Pilot/2026-09-26/cloud-return-permit.txt`. Each line is `catalogPath=<absolute path>`, `evidenceRoot=<absolute path>`, or `uuid=<observed UUID>`. There is one catalog line, one evidence line, and one to three UUID lines. The parent creates this file only after observing disposable assets in both apps; a filename or album name never grants write access. The completed test's permit has been moved into its evidence folder, so it no longer authorizes another write.

Full recipes are stored as nested tables through `LrPrefs`, with a root-table reassignment on each progress update. JSON files are evidence, not a restoration input. The redistributed `LrPrefs` reference documents table storage and the root-reassignment requirement; it was fetched in this session. A normal Classic quit and reopen between capture and apply preserved the saved job and its nested recipes. This does not prove crash recovery. The commands always report cloud observation as unverified. A local SDK readback cannot establish that Adobe synchronized an edit.

The cloud module has fourteen focused tests passing under Lua and LuaJIT. They cover stale recipes, a failed second write, restoration, retry behavior, nested settings across separate adapter instances, incorrect SDK identity, virtual-copy/master relationships, and a source-master change inside the write gate. Parent review added a failing test for a later stale target after an earlier successful edit. The original code reported that run as refused; the corrected code reports and saves the partial result. This is mock recovery evidence, not proof of app-crash recovery.

Classic loaded the new menu entries. Reloading the plugin alone initially produced `No script by the name CaptureCloudBaseline.lua`; a normal Classic restart made the command executable. A live invocation with no permit then stopped with `Cloud-return permit is absent` before any edit or capture job. A permit has since been issued for only the independently verified disposable UUID.

Cloud Lightroom's **Edit > Duplicate 1 Photo** created a separate `DSC06706.ARW` asset. It belongs to `Photo Editing Cloud Return Test 2026-09-26`; the source belongs to `Shuff 2025`. Read-only catalog evidence records distinct asset IDs and album membership. The duplicate preserves the original creation timestamp, so that timestamp alone cannot distinguish the two. Private identity evidence is under `cloud-return-preflight/` in the pilot folder. The operator resumed the existing synced Classic catalog. At 01:41 UTC on September 27, it held 1,765 cloud mappings and 310 pending documents; the test album had arrived but its RAW was still queued. These are transfer diagnostics, not a reconciled library inventory. No cloud-test photo edit had been applied at that checkpoint.

The one-photo test album was opened in cloud Lightroom and its baseline exported at 2,048 pixels. The editing panel showed Adobe Color and exposure `+0.06`; the JPEG retained two mask groups. Compared with the earlier source reference, its mean absolute channel difference was `0.0000179` on the 0–255 scale, with matching ICC data. Private evidence is `cloud-return-preflight/baseline-comparison.json` and `pre-apply-observation/`. That folder also saves independent source-recipe evidence before any test edit.

The RAW arrived at 01:50 UTC and matched its cloud SHA-256. At 01:51 UTC, Classic mapped the disposable cloud asset to a virtual copy of the already-synced original, sharing its source path. A first capture attempt failed its UI-selection check before saving a job or changing edits. Version `0.1.0.3` removes that selection dependency and adds the master protection described above. Read-only database checks established this relationship; the plugin still performs every edit through Adobe's SDK.

Job `lr-20260927T015618Z-796448` captured the copy and protected master, then survived a normal Classic restart. Its baseline render differs from the cloud baseline by mean `0.071784`, 99th percentile `1`, and maximum `5` on the 0–255 channel scale; ICC data matches. Apply then changed only the copy's `Exposure2012` from `0.06` to `0.31` and passed the complete SDK readback. Adobe delivered a new edit revision to the same cloud asset at 01:57:49 UTC. Its cloud mask digests are unchanged. Independent checks found the source's Classic recipe hash and cloud Develop record unchanged. Classic's incoming-document queue was empty at that checkpoint; this is not a reconciled full-library inventory.

After the Mac was unlocked, cloud Lightroom showed exposure `+0.31` in the one-photo test album. Its exported JPEG recorded the same value and has identical decoded pixels to the Classic edited export. **Restore cloud test baseline** completed at 02:13:48 UTC on September 27. Cloud Lightroom then showed `+0.06`; a second cloud export confirmed restoration. All exported Camera Raw fields match the initial cloud baseline. Both mask digests and their auxiliary resources remain unchanged. An independent read-only check again found the original's Classic recipe hash and cloud Develop record unchanged.

| Cloud render comparison | Mean absolute channel difference, 0–255 scale |
|---|---:|
| Initial cloud baseline to cloud adjustment | 11.971143 |
| Initial cloud baseline to cloud restoration | 0.071788 |
| Classic baseline to Classic restoration | 0, identical decoded pixels |
| Classic adjustment to cloud adjustment | 0, identical decoded pixels |
| Classic restoration to cloud restoration | 0.0000043 |

ICC data matches in all comparisons. The baseline-to-restored cloud difference has 99th percentile `1` and maximum `5`; its cause remains unknown. The parent opened `verification/cloud-comparison.jpg`: the adjustment is visibly brighter and the restored appearance is consistent with the baseline at the displayed size. The copy's private Classic recipe text gained an `orientation = "DA"` entry; the helper's full SDK restoration check passed and the cloud export's Camera Raw fields match the baseline. These observations support this bounded test, not bit-identical rendering, HDR display acceptance, or archive-wide coverage.

The test permit is retired at `retired-cloud-return-permit.txt` under the job folder. Full saved recipes and receipts remain available. Final evidence is `verification/acceptance.json`, `verification/metrics.json`, and `verification/restoration-observation.json`. `cloud-export-provenance.json` records that **Export with Previous** saved the restored JPEG with a `-2` suffix in the edited folder; the verified restored export was then moved to `cloud-restored/`. The edited export was preserved. The incoming-document queue was empty at the final check. Sync remains as Nino resumed it; it was not paused by this test.

Operator dispatch `9ad86637-4b39-47f4-a0ed-bd17e1e7b1c2` completed its two owned files. The parent reviewed the code, corrected partial-result reporting, added the Lightroom adapter and menus, and tested the installed missing-permit guard. The route requested Terra/high; observed model and effort remain absent from the runtime receipt. Both photo-editing branch tips stayed unchanged. Other branches moved during concurrent work; the dispatch trace contains no branch-mutating command.

## The HDR sports copy also returned to its saved edit

Job `lr-20260927T024522Z-362220` repeated the cloud test on a disposable `DSC09234.ARW` copy with Adaptive B&W, HDR, and two user mask groups. The copy appeared as a separate cloud asset and as a Classic virtual copy of the protected source. Its local RAW hash matched the recovered original. Cloud Lightroom and exported Camera Raw fields showed `+0.18 → +0.43 → +0.18`. The helper restored the complete SDK recipe. Independent checks found the original's Classic recipe and cloud Develop record unchanged, and the copy's mask digests and auxiliary resources unchanged.

The restored cloud JPEG's Camera Raw fields match its initial baseline. The mean channel difference is `0.0000713` for the stored base image and `0.0004253` for its HDR gain map, on the 0–255 scale. Both have a 99th-percentile difference of zero. ICC data and gain-map parameters match. The deliberate exposure change produced a base-image difference of `12.235552`, so the comparison detected the edit. These are rendering diagnostics, not a taste score or bit-identical result. The parent opened the comparison sheet: the changed exposure is visibly brighter, and the restored base image appears consistent with the baseline at the displayed size. Full-resolution delivery and HDR monitor appearance remain untested.

Private evidence is under `cloud-hdr-receipts/lr-20260927T024522Z-362220/` in the pilot root. It includes all three SDK receipts, cloud edited/restored exports, `verification/metrics.json`, `verification/acceptance.json`, source-integrity observations, and the retired permit. `cloud-hdr-preflight/` preserves independent source/copy baselines and the initial cloud export. The copy now belongs only to `Photo Editing HDR Return Test 2026-09-26`; it was removed from `jca`. The source remains in `jca` and `Dump`. No active write permit remains. This run does not cover Adaptive Color cloud return.

## Prepare learning examples without exposing the saved answers

`tools/lightroom/prepare_pairs.py` accepts `--inventory <JSON>` and `--output <new directory>`. Its `--help` and module docstring define `lightroom-learning-pairs/v1`. It uses Python's standard library, hashes only listed files, and makes no Lightroom, network, or image-decoding calls. Missing inputs remain visible as inventory-only rows; it never invents neutral settings.

The private `manifest.json` retains identities, original/settings/companion hashes, approval, provenance, facts, and missing-input reasons. Related rows form one group through shared source gallery, original hash, capture date, or declared burst, including transitive links. Conflicting train/validation/test assignments stop publication. An unmapped gallery keeps its entire connected group unassigned. Gallery IDs are curated source galleries; catch-all containers such as `Dump` are retained in the source receipt rather than treated as independent shoots.

For ready test rows, `editor-inputs.json` contains only the sample/group IDs, controlled pre-edit preview and hash, fixed input-recipe reference/version, camera, and source type. The saved profile, process version, HDR choice, XMP, ACR, final preview, and original-file path stay out. `evaluator-targets.json` holds the saved settings and previews for later scoring. The full manifest is also private. These files provide logical separation, not operating-system access control: the editor must receive only its allowlisted inputs. This tool does not validate preview pixels, strip metadata, or certify that a claimed pre-edit recipe was used.

The parent reproduced and fixed two leaks in the worker's first version: final profile/HDR facts were exposed as camera context, and another row's final preview could masquerade as an input. Checks now reject source/target aliases across the full inventory by resolved path and content hash. Approval needs a reference; `ai_suggested` is not a ready human target. `human_accepted` remains separately labeled. Fourteen synthetic-fixture tests pass, including deliberate failures for leakage, missing information, malformed inputs, split conflicts, overwrite refusal, and publication failure. No image-quality conclusion comes from these tests.

The real five-package inventory is under `learning-pairs/` in the private pilot root. All originals, settings, companions, and final reference previews were found and hashed. The tool produced **zero ready examples**: approval/provenance and controlled pre-edit previews remain missing. No split has been assigned. Their three source galleries are `Shuff 2025`, `jca`, and `millikin`; full cloud membership is preserved separately. Unknown burst IDs remain explicit.

Operator dispatch `be5adfc5-1a91-4224-b9cb-bec971360e9b` produced the two new Python files. The parent reviewed, corrected, tested, and ran them on the real inventory. The first launch failed at Jev classification with a deadline error; the required dispatcher retry completed. It requested Terra/high, but runtime model and effort were not reported. Inherited files and all photo-editing branch tips stayed unchanged. Another branch moved during concurrent work; none of the worker's 38 recorded commands mutated branch refs. The worker worktree remains because Codex reports it protected by a pinned task or workspace.

## Next boundary

Create controlled pre-edit previews on detached copies and obtain approval for the chosen learning galleries. Then collect enough separate galleries for development and held-out evaluation. Adaptive Color cloud return, Smart Preview operation, a larger sample, crash recovery, and the human-review workflow remain separate checks. No model training, stochastic editing, or automated taste decision is implemented here. The [experiment plan](REPORT.md) keeps held-out targets hidden until scoring and treats Jev as an optional decision component.
