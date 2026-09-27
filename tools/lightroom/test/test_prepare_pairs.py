#!/usr/bin/env python3
"""Synthetic fixtures only; no real Lightroom files, catalogs, or images are read."""

from __future__ import annotations

import copy
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import prepare_pairs  # noqa: E402


class PreparePairsTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        for name, data in {
            "raw/a.raw": b"synthetic raw a", "raw/b.raw": b"synthetic raw b",
            "final/a.xmp": b"synthetic xmp a", "final/b.xmp": b"synthetic xmp b",
            "final/a.acr": b"synthetic acr a", "final/b.acr": b"synthetic acr b",
            "final/a.jpg": b"synthetic final a", "final/b.jpg": b"synthetic final b",
            "input/a.jpg": b"synthetic input a", "input/b.jpg": b"synthetic input b",
        }.items():
            path = self.root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)

    def tearDown(self) -> None:
        self.temp.cleanup()

    def record(self, sample_id: str, album: str, suffix: str, *, split_date: str = "2026-01-01") -> dict:
        return {
            "sample_id": sample_id, "album_ids": [album], "capture_date": split_date, "burst_group_id": None,
            "provenance": "human_corrected", "approval_status": "approved", "approval_reference": "synthetic-review",
            "facts": {"camera": "Synthetic Cam", "profile": "Synthetic Profile", "process": "Synthetic Process", "hdr": False, "source_type": "raw"},
            "source_raw_path": f"raw/{suffix}.raw", "final_xmp_path": f"final/{suffix}.xmp",
            "acr_companion": {"required": True, "path": f"final/{suffix}.acr"},
            "final_reference_preview_path": f"final/{suffix}.jpg", "pre_edit_preview_path": f"input/{suffix}.jpg",
            "fixed_pre_edit_recipe": {"reference": "synthetic-pre-edit", "version": "v1"},
        }

    def inventory(self, records: list[dict], splits: dict[str, str] | None = None) -> dict:
        return {"schema_version": prepare_pairs.SCHEMA_VERSION, "album_splits": splits or {"a": "train", "b": "test"}, "records": records}

    def execute(self, inventory: dict, output_name: str = "out") -> int:
        inventory_path = self.root / "inventory.json"
        inventory_path.write_text(json.dumps(inventory))
        return prepare_pairs.main(["--inventory", str(inventory_path), "--output", str(self.root / output_name)])

    def test_valid_groups_and_hidden_editor_targets(self) -> None:
        result = self.execute(self.inventory([self.record("one", "a", "a"), self.record("two", "b", "b", split_date="2026-01-02")]))
        self.assertEqual(result, 0)
        output = self.root / "out"
        manifest = json.loads((output / "manifest.json").read_text())
        editor = json.loads((output / "editor-inputs.json").read_text())
        targets = json.loads((output / "evaluator-targets.json").read_text())
        self.assertEqual([row["sample_id"] for row in editor["rows"]], ["two"])
        serialized_editor = json.dumps(editor)
        for forbidden in ("final_settings", "final_reference_preview", "final_xmp_path", "source_raw_path", "acr_companion", "synthetic final b"):
            self.assertNotIn(forbidden, serialized_editor)
        self.assertEqual(editor['rows'][0]['camera_context'], {'camera': 'Synthetic Cam', 'source_type': 'raw'})
        self.assertNotIn('Synthetic Profile', serialized_editor)
        self.assertEqual(targets["rows"][0]["sample_id"], "two")
        self.assertTrue(all(row["readiness"]["ready"] for row in manifest["records"]))

    def test_inventory_only_for_missing_approval_and_companions(self) -> None:
        record = self.record("one", "a", "a")
        record["approval_status"] = "unreviewed"
        record["final_xmp_path"] = "final/missing.xmp"
        record["acr_companion"]["path"] = "final/missing.acr"
        record["pre_edit_preview_path"] = None
        self.assertEqual(self.execute(self.inventory([record])), 0)
        manifest = json.loads((self.root / "out" / "manifest.json").read_text())
        reasons = manifest["records"][0]["readiness"]["reasons"]
        self.assertEqual(manifest["records"][0]["readiness"]["ready"], False)
        self.assertEqual(set(reasons), {"approval_status_unreviewed", "missing_final_xmp", "missing_required_acr_companion", "missing_pre_edit_preview"})
        self.assertEqual(json.loads((self.root / "out" / "editor-inputs.json").read_text())["rows"], [])

    def test_each_direct_leakage_edge_refuses_cross_split_output(self) -> None:
        for edge in ("raw", "date", "burst", "album"):
            with self.subTest(edge=edge):
                first = self.record("one", "a", "a", split_date="2026-01-01")
                second = self.record("two", "b", "b", split_date="2026-01-02")
                if edge == "raw":
                    second["source_raw_path"] = "raw/a.raw"
                elif edge == "date":
                    second["capture_date"] = first["capture_date"]
                elif edge == 'burst':
                    first["burst_group_id"] = second["burst_group_id"] = "same-burst"
                else:
                    second['album_ids'].append('a')
                output = f"out-{edge}"
                self.assertEqual(self.execute(self.inventory([first, second]), output), 2)
                self.assertFalse((self.root / output).exists())

    def test_transitive_split_conflict_refuses_without_output(self) -> None:
        first = self.record("one", "a", "a", split_date="2026-01-01")
        middle = self.record("two", "middle", "b", split_date="2026-01-01")
        last = self.record("three", "b", "b", split_date="2026-01-03")
        middle["burst_group_id"] = "bridge"
        last["burst_group_id"] = "bridge"
        splits = {"a": "train", "middle": "unassigned", "b": "test"}
        self.assertEqual(self.execute(self.inventory([first, middle, last], splits)), 2)
        self.assertFalse((self.root / "out").exists())

    def test_schema_duplicate_id_and_existing_output_refuse(self) -> None:
        first = self.record("same", "a", "a")
        second = self.record("same", "b", "b", split_date="2026-01-02")
        self.assertEqual(self.execute(self.inventory([first, second])), 2)
        self.assertFalse((self.root / "out").exists())
        bad = self.inventory([self.record("one", "a", "a")])
        bad["schema_version"] = "wrong"
        self.assertEqual(self.execute(bad), 2)
        existing = self.root / "exists"
        existing.mkdir()
        self.assertEqual(self.execute(self.inventory([self.record("one", "a", "a")]), "exists"), 2)

    def test_preedit_final_alias_by_symlink_and_by_hash_refuse(self) -> None:
        symlink_record = self.record("one", "a", "a")
        link = self.root / "input/link.jpg"
        link.symlink_to(self.root / "final/a.jpg")
        symlink_record["pre_edit_preview_path"] = "input/link.jpg"
        self.assertEqual(self.execute(self.inventory([symlink_record])), 2)
        self.assertFalse((self.root / "out").exists())
        source_target_record = self.record("one", "a", "a")
        source_target_record["source_raw_path"] = "final/a.xmp"
        self.assertEqual(self.execute(self.inventory([source_target_record])), 2)
        self.assertFalse((self.root / "out").exists())
        hash_record = self.record("one", "a", "a")
        (self.root / "input/a.jpg").write_bytes((self.root / "final/a.jpg").read_bytes())
        self.assertEqual(self.execute(self.inventory([hash_record])), 2)
        self.assertFalse((self.root / "out").exists())

    def test_unknown_group_evidence_and_human_accepted_reporting(self) -> None:
        record = self.record("one", "unmapped", "a")
        record["capture_date"] = None
        record["burst_group_id"] = None
        record["provenance"] = "human_accepted"
        self.assertEqual(self.execute(self.inventory([record], {})), 0)
        report = json.loads((self.root / "out" / "report.json").read_text())
        manifest = json.loads((self.root / "out" / "manifest.json").read_text())
        self.assertEqual(manifest["records"][0]["leakage_group"]["split"], "unassigned")
        self.assertEqual(report["unknown_capture_date_sample_ids"], ["one"])
        self.assertEqual(report["counts"]["approved_human_accepted_ready_rows"], 1)

    def test_unknown_required_facts_and_inputs_remain_inventory_only(self) -> None:
        record = self.record("one", "a", "a")
        record["facts"] = {"camera": None, "profile": None, "process": None, "hdr": None, "source_type": None}
        record["source_raw_path"] = None
        record["final_reference_preview_path"] = None
        record["fixed_pre_edit_recipe"] = None
        self.assertEqual(self.execute(self.inventory([record])), 0)
        row = json.loads((self.root / "out" / "manifest.json").read_text())["records"][0]
        self.assertFalse(row["readiness"]["ready"])
        self.assertEqual(set(row["readiness"]["reasons"]), {
            "unknown_fact_camera", "unknown_fact_profile", "unknown_fact_process", "unknown_fact_hdr",
            "unknown_fact_source_type", "missing_source_raw", "missing_final_reference_preview",
            "missing_fixed_pre_edit_recipe",
        })

    def test_cross_record_target_alias_is_refused(self) -> None:
        first = self.record('one', 'a', 'a')
        second = self.record('two', 'b', 'b', split_date='2026-01-02')
        for content_copy in (False, True):
            with self.subTest(content_copy=content_copy):
                second['pre_edit_preview_path'] = 'input/b.jpg' if content_copy else 'final/a.jpg'
                if content_copy:
                    (self.root / 'input/b.jpg').write_bytes((self.root / 'final/a.jpg').read_bytes())
                output = f'alias-{content_copy}'
                self.assertEqual(self.execute(self.inventory([first, second]), output), 2)
                self.assertFalse((self.root / output).exists())

    def test_missing_approval_reference_or_acr_path_remains_inventory_only(self) -> None:
        record = self.record('one', 'a', 'a')
        record['approval_reference'] = None
        record['acr_companion']['path'] = None
        self.assertEqual(self.execute(self.inventory([record])), 0)
        row = json.loads((self.root / 'out/manifest.json').read_text())['records'][0]
        self.assertEqual(set(row['readiness']['reasons']), {'missing_approval_reference', 'missing_required_acr_companion'})

    def test_unmapped_album_does_not_silently_inherit_train(self) -> None:
        first = self.record('one', 'a', 'a')
        second = self.record('two', 'unmapped', 'b')
        self.assertEqual(self.execute(self.inventory([first, second])), 0)
        rows = json.loads((self.root / 'out/manifest.json').read_text())['records']
        self.assertEqual([r['leakage_group']['split'] for r in rows], ['unassigned', 'unassigned'])

    def test_wrong_enum_types_and_noncanonical_dates_refuse_cleanly(self) -> None:
        for key, value in (('provenance', []), ('approval_status', {}), ('capture_date', '20260101')):
            with self.subTest(key=key):
                record = self.record('one', 'a', 'a')
                record[key] = value
                self.assertEqual(self.execute(self.inventory([record])), 2)
                self.assertFalse((self.root / 'out').exists())

    def test_ai_suggestion_is_not_promoted_by_approval_flag(self) -> None:
        record = self.record('one', 'b', 'a')
        record['provenance'] = 'ai_suggested'
        self.assertEqual(self.execute(self.inventory([record])), 0)
        report = json.loads((self.root / 'out/report.json').read_text())
        self.assertEqual(report['counts']['editor_test_rows'], 0)
        self.assertEqual(report['readiness_reasons'], {'ai_suggestion_not_human_target': 1})

    def test_publish_failure_leaves_no_partial_manifests(self) -> None:
        with mock.patch.object(prepare_pairs.os, 'replace', side_effect=OSError('synthetic failure')):
            self.assertEqual(self.execute(self.inventory([self.record('one', 'a', 'a')])), 2)
        self.assertFalse((self.root / 'out').exists())
        self.assertEqual(list(self.root.glob('.out.staging-*')), [])


if __name__ == "__main__":
    unittest.main()
