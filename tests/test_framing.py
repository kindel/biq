#!/usr/bin/env python3
"""The generic set is the principles. A company set is an optional view."""

import json
import os
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROMPT = "Or view a company's principles:"


def read(*parts):
    with open(os.path.join(ROOT, *parts), encoding="utf-8") as f:
        return f.read()


class FramingTest(unittest.TestCase):

    def test_ui_copy_is_data(self):
        ui = json.loads(read("data", "ui.json"))
        self.assertEqual(PROMPT, ui["companyPrompt"])
        self.assertEqual("Choose a company", ui["companyPlaceholder"])
        self.assertEqual("Back to principles for any company", ui["backToGeneric"])
        self.assertNotIn("\u2014", json.dumps(ui))
        self.assertNotIn("\u2013", json.dumps(ui))

    def test_the_picker_skips_the_default_set(self):
        js = read("js", "biq.js")
        self.assertIn("if (companies[i].id === skip) continue;", js)
        self.assertIn("defaultCompanyId()", js)
        page = read("index.html")
        self.assertIn(PROMPT, page)
        self.assertNotIn(">Company<", page)
        self.assertIn("These are principles that work for any company.", page)

    def test_company_prompt_stays_a_sentence(self):
        css = read("css", "biq.css")
        start = css.index(".bhiq-app label.bhiq-company-prompt")
        block = css[start:css.index("}", start)]
        self.assertIn("text-transform: none", block)
        self.assertIn("letter-spacing: normal", block)
        self.assertIn("var(--biq-muted)", block)
        page = read("index.html")
        self.assertLess(page.index("bhiq-company-view"), page.index('id="bhiq-input"'))

    def test_the_display_name_is_not_a_company(self):
        bank = json.loads(read("data", "questions.json"))
        generic = [c for c in bank["companies"] if c["id"] == "generic"][0]
        self.assertEqual("Principles for any company", generic["name"])
        self.assertEqual("generic", bank["defaultCompany"])
