#!/usr/bin/env python3
"""Tests for the Python side of the scripts.

The hash vectors here were computed with the JS twin in js/biq-examples.js,
so these tests pin the "JS and the Python regen must match" contract to
actual JS output rather than to a second Python copy of the algorithm.
"""

import contextlib
import io
import json
import os
import sys
import unittest
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(
    os.path.abspath(__file__))), "scripts"))

import generate
import mint_question_ids as mint
import sync_from_principles as sync


class NormParityTest(unittest.TestCase):
    """norm and slug_for must produce what the JS produces, byte for byte."""

    def test_norm_strips_non_ascii_like_the_js(self):
        # JS: "A naïve plan".toLowerCase().replace(/[^a-z0-9]+/g, " ")
        self.assertEqual("a na ve plan", generate.norm("A naïve plan"))

    def test_slug_for_survives_non_ascii(self):
        # Computed with js/biq-examples.js slugFor. The old norm kept the
        # accented character and key.encode("ascii") raised.
        self.assertEqual("f3eb5231", generate.slug_for(1001, "A naïve plan"))

    def test_slug_for_matches_a_minted_id(self):
        # The first Amazon question's stored id, minted from this exact text.
        self.assertEqual(
            "f76d64d6",
            generate.slug_for(1001, "Describe a difficult interaction you had "
                              "with a customer. How did you deal with it? What "
                              "was the outcome? How would you handle it "
                              "differently?"))

    def test_mint_uses_generate_s_hash_not_a_copy(self):
        self.assertIs(mint.slug_for, generate.slug_for)
        self.assertIs(mint.norm, generate.norm)


def level_sheet():
    return {
        "raiseTranscript": [{"role": "candidate", "text": "t"}],
        "raiseNotes": [], "raiseFeedback": "f",
        "lowerTranscript": [{"role": "candidate", "text": "t"}],
        "lowerNotes": [], "lowerFeedback": "f",
    }


def pack():
    return {"levels": {k: level_sheet() for k in ("junior", "senior", "exec")}}


class NoFacetSkipTest(unittest.TestCase):
    """A question with no pack must be pending, whatever its facet siblings have.

    Nothing at runtime resolves a facet sibling's pack: js/biq-examples.js
    fetches by this question's own id, so a skipped question is a dead
    Examples button, not shared coverage.
    """

    def test_a_question_without_a_pack_is_pending(self):
        import tempfile
        with tempfile.TemporaryDirectory() as td:
            td = Path(td)
            out = td / "examples"
            out.mkdir()
            (out / "aaaa1111.json").write_text(json.dumps(pack()))
            bank = {"companies": [{
                "id": "testco", "examples": True,
                "principles": [
                    {"id": 9001, "slug": "one", "name": "One", "questions": [
                        {"id": "aaaa1111", "text": "Question one?"}]},
                    {"id": 9002, "slug": "two", "name": "Two", "questions": [
                        {"id": "bbbb2222", "text": "Question two?"}]},
                ]}]}
            (td / "bank.json").write_text(json.dumps(bank))

            old_bank, old_out = generate.BANK, generate.OUT_DIR
            old_env = {k: os.environ.get(k) for k in ("BIQ_DRY_RUN", "BIQ_COMPANY")}
            generate.BANK = str(td / "bank.json")
            generate.OUT_DIR = str(out)
            os.environ["BIQ_DRY_RUN"] = "1"
            os.environ.pop("BIQ_COMPANY", None)
            try:
                with contextlib.redirect_stdout(io.StringIO()) as buf:
                    generate.main()
            finally:
                generate.BANK, generate.OUT_DIR = old_bank, old_out
                for k, v in old_env.items():
                    if v is None:
                        os.environ.pop(k, None)
                    else:
                        os.environ[k] = v
            self.assertIn("pending=1", buf.getvalue())


class SyncSingleFetchTest(unittest.TestCase):
    """sync_aliases must reuse the index main() already fetched.

    Two fetches of the same file in one run can observe different upstream
    commits, so shells and aliases in a single PR could come from two
    different corpus versions.
    """

    def test_sync_aliases_takes_the_index_and_does_not_refetch(self):
        fetched = []
        old_load, old_facets = sync.load_index, sync.fetch_facets
        sync.load_index = lambda: fetched.append(1) or {"companies": []}
        sync.fetch_facets = lambda: {}
        try:
            changes = sync.sync_aliases({"companies": []}, {"companies": []})
        finally:
            sync.load_index, sync.fetch_facets = old_load, old_facets
        self.assertEqual([], changes)
        self.assertEqual([], fetched)


class StampFacetsTest(unittest.TestCase):
    """stamp_facets copies, replaces, or removes facet ids from the index.

    Inheritance at runtime is keyed on these ids. A silent stamp bug would
    attach the wrong donor questions, or none.
    """

    def test_copy_facets_onto_a_bank_principle_that_has_none(self):
        bank = {"companies": [{"principles": [{"id": 7001}]}]}
        idx = {"companies": [{"principles": [{"id": 7001, "facets": ["think-big"]}]}]}
        n = sync.stamp_facets(bank, idx)
        self.assertEqual(1, n)
        self.assertEqual(
            ["think-big"], bank["companies"][0]["principles"][0]["facets"])

    def test_replace_stale_facets_with_the_index(self):
        bank = {"companies": [{"principles": [
            {"id": 7001, "facets": ["old-facet"]}]}]}
        idx = {"companies": [{"principles": [
            {"id": 7001, "facets": ["think-big"]}]}]}
        n = sync.stamp_facets(bank, idx)
        self.assertEqual(1, n)
        self.assertEqual(
            ["think-big"], bank["companies"][0]["principles"][0]["facets"])

    def test_remove_facets_when_the_index_has_none(self):
        bank = {"companies": [{"principles": [
            {"id": 7001, "facets": ["think-big"]}]}]}
        idx = {"companies": [{"principles": [{"id": 7001}]}]}
        n = sync.stamp_facets(bank, idx)
        self.assertEqual(1, n)
        self.assertNotIn("facets", bank["companies"][0]["principles"][0])

    def test_remove_facets_when_the_index_lists_an_empty_array(self):
        bank = {"companies": [{"principles": [
            {"id": 7001, "facets": ["think-big"]}]}]}
        idx = {"companies": [{"principles": [{"id": 7001, "facets": []}]}]}
        n = sync.stamp_facets(bank, idx)
        self.assertEqual(1, n)
        self.assertNotIn("facets", bank["companies"][0]["principles"][0])

    def test_leave_nonnumeric_ids_unchanged(self):
        bank = {"companies": [{"principles": [
            {"id": "challenge", "facets": ["think-big"]}]}]}
        idx = {"companies": [{"principles": [
            {"id": 7001, "facets": ["other"]}]}]}
        n = sync.stamp_facets(bank, idx)
        self.assertEqual(0, n)
        self.assertEqual(
            ["think-big"], bank["companies"][0]["principles"][0]["facets"])

    def test_no_change_when_facets_already_match(self):
        bank = {"companies": [{"principles": [
            {"id": 7001, "facets": ["think-big"]}]}]}
        idx = {"companies": [{"principles": [
            {"id": 7001, "facets": ["think-big"]}]}]}
        n = sync.stamp_facets(bank, idx)
        self.assertEqual(0, n)


class InsertAtTest(unittest.TestCase):
    """New companies take their place in the principles manifest order."""

    def test_a_new_first_company_lands_at_the_front(self):
        bank = {"companies": [{"id": "amazon"}, {"id": "arm"}]}
        idx = {"companies": [
            {"id": "generic"}, {"id": "amazon"}, {"id": "arm"}]}
        self.assertEqual(0, sync.insert_at(bank, idx, "generic"))

    def test_several_missing_companies_keep_manifest_order(self):
        bank = {"companies": [{"id": "amazon"}, {"id": "toyota"}]}
        idx = {"companies": [
            {"id": "generic"}, {"id": "amazon"}, {"id": "arm"},
            {"id": "toyota"}]}
        bank["companies"].insert(
            sync.insert_at(bank, idx, "generic"), {"id": "generic"})
        bank["companies"].insert(
            sync.insert_at(bank, idx, "arm"), {"id": "arm"})
        self.assertEqual(
            ["generic", "amazon", "arm", "toyota"],
            [c["id"] for c in bank["companies"]])


class PreambleSyncTest(unittest.TestCase):
    def test_company_shell_keeps_a_string_preamble_only(self):
        base = {
            "id": "generic",
            "name": "Any Company",
            "set": "Leadership Principles",
            "source": "https://github.com/kindel/principles/issues/71",
            "principles": [],
        }
        good = sync.company_shell(dict(base, preamble="**Everyone is a leader.**"))
        self.assertEqual("**Everyone is a leader.**", good["preamble"])
        bad = sync.company_shell(dict(base, preamble=["not", "a", "paragraph"]))
        self.assertNotIn("preamble", bad)

    def test_an_existing_company_picks_up_a_new_preamble(self):
        existing = {"id": "generic", "principles": []}
        self.assertTrue(sync.sync_preamble(existing, {"preamble": "Hello."}))
        self.assertEqual("Hello.", existing["preamble"])

    def test_an_existing_company_replaces_a_stale_preamble(self):
        existing = {"preamble": "Old."}
        self.assertTrue(sync.sync_preamble(existing, {"preamble": "New."}))
        self.assertEqual("New.", existing["preamble"])

    def test_an_existing_company_drops_a_removed_preamble(self):
        existing = {"preamble": "Old."}
        self.assertTrue(sync.sync_preamble(existing, {}))
        self.assertNotIn("preamble", existing)

    def test_a_matching_preamble_is_left_alone(self):
        existing = {"preamble": "Hello."}
        self.assertFalse(sync.sync_preamble(existing, {"preamble": "Hello."}))

    def test_a_questionless_company_is_reported_without_facet_inheritance(self):
        note = sync.new_company_note({"principles": [{"slug": "ownership"}]})
        self.assertEqual("empty questions; no facets, so no questions yet", note)

    def test_a_faceted_company_is_reported_as_inheriting_the_bank(self):
        note = sync.new_company_note(
            {"principles": [{"slug": "ownership", "facets": ["acts-like-an-owner"]}]})
        self.assertEqual("empty questions; inherits the fixed bank via facets", note)


if __name__ == "__main__":
    unittest.main()
