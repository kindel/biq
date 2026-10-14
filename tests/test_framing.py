#!/usr/bin/env python3
"""The generic set is the principles. A company set is an optional view."""

import json
import os
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROMPT = "Or, you can use BIQ focused on how any of these companies define their principles."


def read(*parts):
    with open(os.path.join(ROOT, *parts), encoding="utf-8") as f:
        return f.read()


class FramingTest(unittest.TestCase):

    def test_ui_copy_is_data(self):
        ui = json.loads(read("data", "ui.json"))
        self.assertEqual(PROMPT, ui["companyPrompt"])
        self.assertEqual("Universal principles", ui["universalLabel"])
        self.assertEqual("Back to the universal principles", ui["backToGeneric"])
        self.assertEqual("the universal principles", ui["genericSetLink"])
        self.assertNotIn("\u2014", json.dumps(ui))
        self.assertNotIn("\u2013", json.dumps(ui))

    def test_the_picker_is_logo_tiles(self):
        js = read("js", "biq.js")
        self.assertIn('b.setAttribute("role", "radio")', js)
        self.assertIn('e.key === "Home"', js)
        self.assertIn('source: "picker"', js)
        self.assertIn('track("biq_company"', js)
        for logo in ["amazon", "arm", "blue-origin", "coupang", "delivery-hero", "gitlab", "toyota"]:
            self.assertTrue(os.path.exists(os.path.join(ROOT, "css", "logos", logo + ".svg")), logo)
        self.assertTrue(os.path.exists(os.path.join(ROOT, "css", "logos", "dawn.png")))
        self.assertIn("used with permission of dawn aerospace", read("css", "logos", "README.md").lower())
        page = read("index.html")
        self.assertIn(PROMPT, page)
        self.assertNotIn(">Company<", page)
        self.assertIn("There is a universal set of leadership principles.", page)
        self.assertIn('role="radiogroup"', page)
        self.assertNotIn("<select id=\"bhiq-company\"", page)

    def test_company_prompt_stays_a_sentence(self):
        css = read("css", "biq.css")
        start = css.index(".bhiq-app .bhiq-company-prompt {")
        block = css[start:css.index("}", start)]
        self.assertIn("text-transform: none", block)
        self.assertIn("letter-spacing: normal", block)
        self.assertIn("var(--biq-muted)", block)
        page = read("index.html")
        self.assertLess(page.index("bhiq-company-view"), page.index('id="bhiq-input"'))

    def test_the_display_name_is_not_a_company(self):
        bank = json.loads(read("data", "questions.json"))
        generic = [c for c in bank["companies"] if c["id"] == "generic"][0]
        self.assertEqual("Universal Leadership Principles", generic["name"])
        self.assertEqual("generic", bank["defaultCompany"])

    def test_usmc_preamble_keeps_the_pinned_traits_url(self):
        bank = json.loads(read("data", "questions.json"))
        usmc = [c for c in bank["companies"] if c["id"] == "usmc"][0]
        self.assertIn(
            "https://www.mcjrotc.marines.mil/About/Leadership-Traits/",
            usmc["preamble"],
        )
        report = read(".kindel", "last-sync.txt").splitlines()[0]
        self.assertRegex(report, r"^principles [0-9a-f]{40}$")
