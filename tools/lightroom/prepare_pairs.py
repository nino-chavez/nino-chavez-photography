#!/usr/bin/env python3
"""Prepare auditable Lightroom learning-pair manifests without reading image pixels.

Input schema (JSON, schema_version exactly ``lightroom-learning-pairs/v1``)::

  {
    "schema_version": "lightroom-learning-pairs/v1",
    "album_splits": {"album-2026-01": "train", "album-2026-02": "test"},
    "records": [{
      "sample_id": "stable-id", "album_ids": ["album-2026-01"],
      "capture_date": "2026-01-31", "burst_group_id": null,
      "provenance": "human_corrected", "approval_status": "approved",
      "approval_reference": "review-2026-02-01",
      "facts": {"camera": "Sony A1", "profile": "Adobe Color",
                "process": "Version 6", "hdr": false, "source_type": "raw"},
      "source_raw_path": "raw/IMG_1.ARW", "final_xmp_path": "final/IMG_1.xmp",
      "acr_companion": {"required": true, "path": "final/IMG_1.acr"},
      "final_reference_preview_path": "final/IMG_1.jpg",
      "pre_edit_preview_path": "inputs/IMG_1.jpg",
      "fixed_pre_edit_recipe": {"reference": "standard-preview-v1", "version": "1"}
    }]
  }

``capture_date: null`` and ``burst_group_id: null`` mean unknown. Relative paths are
resolved from the inventory file. ``album_splits`` values are ``train``, ``validation``,
``test``, or ``unassigned``; absent album IDs are unassigned. This tool hashes present
files but does not decode RAWs or previews, inspect metadata or pixels, use a network,
or contact Lightroom. Nullable paths, facts, and ``fixed_pre_edit_recipe`` explicitly
mean unavailable and make the row inventory-only; they are never filled from a filename,
JPEG appearance, or edit sliders. Output manifests are logical separation only, not
access control. ``facts.profile``, ``process``, and ``hdr`` describe the final edit
and never enter editor inputs. Album IDs name curated source galleries, not catch-all
containers such as Dump. Retain full cloud membership in the private source receipt.
An unmapped album holds its entire connected group as unassigned. Approval requires
an explicit reference; an AI suggestion is not a human-approved target.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import shutil
import sys
import tempfile
from collections import Counter, defaultdict
from typing import Any


SCHEMA_VERSION = "lightroom-learning-pairs/v1"
SPLITS = {"train", "validation", "test", "unassigned"}
PROVENANCE = {"human_original", "ai_suggested", "human_corrected", "human_accepted", "unreviewed"}
APPROVAL = {"approved", "unreviewed", "rejected"}
FACT_KEYS = ("camera", "profile", "process", "hdr", "source_type")
PATH_KEYS = ("source_raw_path", "final_xmp_path", "final_reference_preview_path", "pre_edit_preview_path")


class InputError(ValueError):
    """An input that must publish no manifests."""


def fail(message: str) -> None:
    raise InputError(message)


def expect_object(value: Any, label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        fail(f"{label} must be an object")
    return value


def expect_string(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        fail(f"{label} must be a non-empty string")
    return value


def validate_inventory(value: Any) -> dict[str, Any]:
    inventory = expect_object(value, "inventory")
    if set(inventory) != {"schema_version", "album_splits", "records"}:
        fail("inventory must contain exactly schema_version, album_splits, and records")
    if inventory["schema_version"] != SCHEMA_VERSION:
        fail(f"schema_version must be {SCHEMA_VERSION!r}")
    splits = expect_object(inventory["album_splits"], "album_splits")
    for album_id, split in splits.items():
        expect_string(album_id, "album_splits key")
        if not isinstance(split, str) or split not in SPLITS:
            fail(f"album_splits[{album_id!r}] has invalid split {split!r}")
    records = inventory["records"]
    if not isinstance(records, list):
        fail("records must be an array")
    seen: set[str] = set()
    for index, record_value in enumerate(records):
        label = f"records[{index}]"
        record = expect_object(record_value, label)
        required = {
            "sample_id", "album_ids", "capture_date", "burst_group_id", "provenance",
            "approval_status", "facts", "source_raw_path", "final_xmp_path",
            "acr_companion", "final_reference_preview_path", "pre_edit_preview_path",
            "fixed_pre_edit_recipe",
        }
        allowed = required | {"approval_reference"}
        unknown = set(record) - allowed
        missing = required - set(record)
        if missing or unknown:
            fail(f"{label} keys invalid (missing {sorted(missing)}, unknown {sorted(unknown)})")
        sample_id = expect_string(record["sample_id"], f"{label}.sample_id")
        if sample_id in seen:
            fail(f"duplicate sample_id {sample_id!r}")
        seen.add(sample_id)
        albums = record["album_ids"]
        if not isinstance(albums, list) or not albums or any(not isinstance(v, str) or not v.strip() for v in albums):
            fail(f"{label}.album_ids must be a non-empty array of strings")
        if len(set(albums)) != len(albums):
            fail(f"{label}.album_ids must not repeat an album")
        capture_date = record["capture_date"]
        if capture_date is not None:
            expect_string(capture_date, f"{label}.capture_date")
            try:
                if dt.date.fromisoformat(capture_date).isoformat() != capture_date:
                    raise ValueError('noncanonical date')
            except ValueError:
                fail(f"{label}.capture_date must be YYYY-MM-DD or null")
        burst = record["burst_group_id"]
        if burst is not None:
            expect_string(burst, f"{label}.burst_group_id")
        if not isinstance(record["provenance"], str) or record["provenance"] not in PROVENANCE:
            fail(f"{label}.provenance is invalid")
        if not isinstance(record["approval_status"], str) or record["approval_status"] not in APPROVAL:
            fail(f"{label}.approval_status is invalid")
        if "approval_reference" in record and record["approval_reference"] is not None:
            expect_string(record["approval_reference"], f"{label}.approval_reference")
        facts = expect_object(record["facts"], f"{label}.facts")
        if set(facts) != set(FACT_KEYS):
            fail(f"{label}.facts must contain exactly {', '.join(FACT_KEYS)}")
        for fact in ("camera", "profile", "process", "source_type"):
            if facts[fact] is not None and (not isinstance(facts[fact], str) or not facts[fact].strip()):
                fail(f"{label}.facts.{fact} must be a non-empty string or null for unknown")
        if facts["hdr"] is not None and not isinstance(facts["hdr"], bool):
            fail(f"{label}.facts.hdr must be a boolean or null for unknown")
        for key in ("source_raw_path", "final_xmp_path", "final_reference_preview_path"):
            if record[key] is not None:
                expect_string(record[key], f"{label}.{key}")
        if record["pre_edit_preview_path"] is not None:
            expect_string(record["pre_edit_preview_path"], f"{label}.pre_edit_preview_path")
        companion = expect_object(record["acr_companion"], f"{label}.acr_companion")
        if set(companion) != {"required", "path"} or not isinstance(companion["required"], bool):
            fail(f"{label}.acr_companion must contain boolean required and path")
        if companion["path"] is not None:
            expect_string(companion["path"], f"{label}.acr_companion.path")
        if record["fixed_pre_edit_recipe"] is not None:
            recipe = expect_object(record["fixed_pre_edit_recipe"], f"{label}.fixed_pre_edit_recipe")
            if set(recipe) != {"reference", "version"}:
                fail(f"{label}.fixed_pre_edit_recipe must contain exactly reference and version")
            expect_string(recipe["reference"], f"{label}.fixed_pre_edit_recipe.reference")
            expect_string(recipe["version"], f"{label}.fixed_pre_edit_recipe.version")
    return inventory


def resolve_path(base: Path, value: str | None) -> Path | None:
    return None if value is None else (base / value).resolve()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def inspect_files(inventory: dict[str, Any], base: Path) -> list[dict[str, Any]]:
    inspected: list[dict[str, Any]] = []
    for record in inventory["records"]:
        paths = {key: resolve_path(base, record[key]) for key in PATH_KEYS}
        paths["acr_companion_path"] = resolve_path(base, record["acr_companion"]["path"])
        present = {key: path for key, path in paths.items() if path is not None}
        reversed_paths: dict[Path, list[str]] = defaultdict(list)
        for key, path in present.items():
            reversed_paths[path].append(key)
        aliases = [keys for keys in reversed_paths.values() if len(keys) > 1]
        if aliases:
            fail(f"sample {record['sample_id']!r} has source/target path aliasing: {aliases[0]}")
        files: dict[str, dict[str, Any]] = {}
        for key, path in paths.items():
            if path is None:
                files[key] = {"path": None, "present": False, "sha256": None}
            elif not path.is_file():
                files[key] = {"path": str(path), "present": False, "sha256": None}
            else:
                files[key] = {"path": str(path), "present": True, "sha256": sha256(path)}
        pre = files["pre_edit_preview_path"]
        final = files["final_reference_preview_path"]
        if pre["present"] and final["present"] and pre["sha256"] == final["sha256"]:
            fail(f"sample {record['sample_id']!r} pre-edit preview aliases final preview by content hash")
        inspected.append({"record": record, "files": files})
    # Check the whole inventory: another row's final output is also a hidden target.
    target_paths = set()
    target_hashes = set()
    for item in inspected:
        for key in ('final_xmp_path', 'final_reference_preview_path', 'acr_companion_path', 'source_raw_path'):
            file = item['files'][key]
            if file['path']:
                target_paths.add(file['path'])
            if file['sha256']:
                target_hashes.add(file['sha256'])
    for item in inspected:
        pre = item['files']['pre_edit_preview_path']
        if (pre['path'] and pre['path'] in target_paths) or (pre['sha256'] and pre['sha256'] in target_hashes):
            fail(f"sample {item['record']['sample_id']!r} pre-edit preview aliases a source or target in the inventory")
    return inspected


class DisjointSet:
    def __init__(self, size: int) -> None:
        self.parents = list(range(size))

    def find(self, value: int) -> int:
        while self.parents[value] != value:
            self.parents[value] = self.parents[self.parents[value]]
            value = self.parents[value]
        return value

    def union(self, left: int, right: int) -> None:
        left, right = self.find(left), self.find(right)
        if left != right:
            self.parents[right] = left


def compute_groups(inspected: list[dict[str, Any]], album_splits: dict[str, str]) -> list[dict[str, Any]]:
    dsu = DisjointSet(len(inspected))
    by_key: dict[tuple[str, str], int] = {}
    for index, item in enumerate(inspected):
        record, files = item["record"], item["files"]
        keys = [("album", album) for album in record["album_ids"]]
        if record["capture_date"] is not None:
            keys.append(("date", record["capture_date"]))
        if record["burst_group_id"] is not None:
            keys.append(("burst", record["burst_group_id"]))
        raw_hash = files["source_raw_path"]["sha256"]
        if raw_hash:
            keys.append(("raw_sha256", raw_hash))
        for key in keys:
            if key in by_key:
                dsu.union(index, by_key[key])
            else:
                by_key[key] = index
    members: dict[int, list[int]] = defaultdict(list)
    for index in range(len(inspected)):
        members[dsu.find(index)].append(index)
    groups: list[dict[str, Any]] = []
    for member_indexes in sorted(members.values(), key=lambda values: min(inspected[i]["record"]["sample_id"] for i in values)):
        member_indexes.sort(key=lambda i: inspected[i]["record"]["sample_id"])
        album_ids = sorted({album for i in member_indexes for album in inspected[i]["record"]["album_ids"]})
        requested = {album_splits.get(album, "unassigned") for album in album_ids}
        assigned = requested - {"unassigned"}
        if len(assigned) > 1:
            names = [inspected[i]["record"]["sample_id"] for i in member_indexes]
            fail(f"leakage group {names} crosses explicit splits {sorted(assigned)}")
        groups.append({
            "group_id": f"group-{len(groups) + 1:04d}",
            "member_indexes": member_indexes,
            "sample_ids": [inspected[i]["record"]["sample_id"] for i in member_indexes],
            "album_ids": album_ids,
            "split": 'unassigned' if 'unassigned' in requested else next(iter(assigned), 'unassigned'),
        })
    return groups


def readiness(item: dict[str, Any]) -> list[str]:
    record, files = item["record"], item["files"]
    reasons: list[str] = []
    if record["approval_status"] != "approved":
        reasons.append(f"approval_status_{record['approval_status']}")
    elif not record.get('approval_reference'):
        reasons.append('missing_approval_reference')
    if record["provenance"] == "unreviewed":
        reasons.append("provenance_unreviewed")
    elif record['provenance'] == 'ai_suggested':
        reasons.append('ai_suggestion_not_human_target')
    for fact in ("camera", "profile", "process", "hdr", "source_type"):
        if record["facts"][fact] is None:
            reasons.append(f"unknown_fact_{fact}")
    if record["facts"]["source_type"] is not None and str(record["facts"]["source_type"]).lower() != "raw":
        reasons.append("source_type_not_raw")
    checks = {
        "source_raw_path": "missing_source_raw",
        "final_xmp_path": "missing_final_xmp",
        "final_reference_preview_path": "missing_final_reference_preview",
        "pre_edit_preview_path": "missing_pre_edit_preview",
    }
    for key, reason in checks.items():
        if not files[key]["present"]:
            reasons.append(reason)
    if record["acr_companion"]["required"] and not files["acr_companion_path"]["present"]:
        reasons.append("missing_required_acr_companion")
    if record["fixed_pre_edit_recipe"] is None:
        reasons.append("missing_fixed_pre_edit_recipe")
    return reasons


def build_outputs(inventory_path: Path, inventory: dict[str, Any]) -> dict[str, Any]:
    inspected = inspect_files(inventory, inventory_path.parent)
    groups = compute_groups(inspected, inventory["album_splits"])
    memberships: dict[int, dict[str, Any]] = {}
    for group in groups:
        for index in group["member_indexes"]:
            memberships[index] = group
    manifest_records: list[dict[str, Any]] = []
    editor_inputs: list[dict[str, Any]] = []
    evaluator_targets: list[dict[str, Any]] = []
    reason_counts: Counter[str] = Counter()
    provenance_counts: Counter[str] = Counter()
    ready_by_split: Counter[str] = Counter()
    unknown_dates: list[str] = []
    unknown_bursts: list[str] = []
    for index, item in enumerate(inspected):
        record, files, group = item["record"], item["files"], memberships[index]
        reasons = readiness(item)
        ready = not reasons
        reason_counts.update(reasons)
        provenance_counts[record["provenance"]] += 1
        if record["capture_date"] is None:
            unknown_dates.append(record["sample_id"])
        if record["burst_group_id"] is None:
            unknown_bursts.append(record["sample_id"])
        if ready:
            ready_by_split[group["split"]] += 1
        manifest_records.append({
            "record": record,
            "files": files,
            "readiness": {"ready": ready, "reasons": reasons},
            "leakage_group": {key: group[key] for key in ("group_id", "sample_ids", "album_ids", "split")},
        })
        if ready and group["split"] == "test":
            editor_inputs.append({
                "sample_id": record["sample_id"],
                "group_id": group["group_id"],
                "input_preview": {"path": files["pre_edit_preview_path"]["path"], "sha256": files["pre_edit_preview_path"]["sha256"]},
                "fixed_input_recipe": record["fixed_pre_edit_recipe"],
                "camera_context": {key: record['facts'][key] for key in ('camera', 'source_type')},
            })
            evaluator_targets.append({
                "sample_id": record["sample_id"],
                "group_id": group["group_id"],
                "final_settings": {"path": files["final_xmp_path"]["path"], "sha256": files["final_xmp_path"]["sha256"]},
                "final_reference_preview": {"path": files["final_reference_preview_path"]["path"], "sha256": files["final_reference_preview_path"]["sha256"]},
                "required_acr_companion": ({"path": files["acr_companion_path"]["path"], "sha256": files["acr_companion_path"]["sha256"]}
                                            if record["acr_companion"]["required"] else None),
                "provenance": record["provenance"],
            })
    ready_count = sum(record["readiness"]["ready"] for record in manifest_records)
    report = {
        "schema_version": SCHEMA_VERSION,
        "counts": {
            "inventory_records": len(manifest_records), "ready_records": ready_count,
            "inventory_only_records": len(manifest_records) - ready_count,
            "ready_by_split": dict(sorted(ready_by_split.items())),
            "groups": len(groups), "editor_test_rows": len(editor_inputs),
            "approved_human_accepted_ready_rows": sum(1 for row in manifest_records if row["readiness"]["ready"] and row["record"]["provenance"] == "human_accepted"),
        },
        "readiness_reasons": dict(sorted(reason_counts.items())),
        "provenance": dict(sorted(provenance_counts.items())),
        "unknown_capture_date_sample_ids": unknown_dates,
        "unknown_burst_group_sample_ids": unknown_bursts,
        "limitations": [
            "Unknown capture dates or burst groups prevent a claim that temporal or burst independence is proved.",
            "File hashes establish byte identity only. This tool does not validate preview pixels, image metadata, XMP semantics, or rendering.",
            "Human acceptance remains distinct from independently hand-edited truth; provenance is retained for downstream review.",
            "Editor inputs are a logical allowlist, not filesystem access control. Parent must provide controlled metadata-stripped pre-edit previews and run the editor with only those fields.",
            "Final settings, profiles, HDR choices, and references are withheld from editor-inputs.json. They remain in private manifest.json and evaluator-targets.json; neither may be given to the editor.",
        ],
    }
    return {
        "manifest.json": {"schema_version": SCHEMA_VERSION, "inventory_path": str(inventory_path.resolve()), "records": manifest_records},
        "report.json": report,
        "editor-inputs.json": {"schema_version": SCHEMA_VERSION, "scope": "ready test rows only; target fields intentionally absent", "rows": editor_inputs},
        "evaluator-targets.json": {"schema_version": SCHEMA_VERSION, "scope": "ready test targets; do not provide to editor or retrieval", "rows": evaluator_targets},
    }


def write_new_output(output: Path, contents: dict[str, Any]) -> None:
    if output.exists():
        fail(f"output already exists: {output}")
    parent = output.parent
    if not parent.is_dir():
        fail(f"output parent does not exist: {parent}")
    staging = Path(tempfile.mkdtemp(prefix=f".{output.name}.staging-", dir=parent))
    try:
        for name, value in contents.items():
            (staging / name).write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        os.replace(staging, output)
    except Exception:
        shutil.rmtree(staging, ignore_errors=True)
        raise


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--inventory", type=Path, required=True, help="Versioned inventory JSON; relative file paths resolve from it.")
    parser.add_argument("--output", type=Path, required=True, help="New output directory. Refuses to overwrite any existing path.")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        with args.inventory.open(encoding="utf-8") as handle:
            inventory = validate_inventory(json.load(handle))
        contents = build_outputs(args.inventory, inventory)
        write_new_output(args.output, contents)
    except (OSError, json.JSONDecodeError, InputError) as error:
        print(f"prepare_pairs: {error}; no output published.", file=sys.stderr)
        return 2
    print(f"Prepared {len(contents['manifest.json']['records'])} inventory records in {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
