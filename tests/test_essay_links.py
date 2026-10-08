#!/usr/bin/env python3
"""blog.kindel.com links to Essays-category posts are rejected.

Same matcher as kindelwww static/js/essay-links.js. The catalog is
scripts/essay_catalog.json. Refresh notes live in that module.
"""

import os
import sys
import tempfile
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))

import essay_links

OWNERSHIP = "https://blog.kindel.com/2018/05/27/ownership/"
NOT_AN_ESSAY = (
    "https://blog.kindel.com/2026/08/20/"
    "if-every-tool-invents-amazon/"
)
INTERVIEW = (
    "https://blog.kindel.com/2026/08/18/"
    "interviews-are-better-with-behavioral-questions/"
)


class EssayLinkTest(unittest.TestCase):

    def setUp(self):
        self.catalog, err = essay_links.load_catalog()
        self.assertIsNone(err, err)
        self.assertIn("ownership", self.catalog["by_slug"])
        self.assertIn(
            "interviews-are-better-with-behavioral-questions",
            self.catalog["by_slug"])
        self.assertNotIn(
            "if-every-tool-invents-amazon",
            self.catalog["by_slug"])

    def ownership_id(self):
        return next(i for i, slug in self.catalog["by_id"].items()
                    if slug == "ownership")

    def test_dated_permalink_matches(self):
        self.assertEqual("ownership",
                         essay_links.essay_slug(OWNERSHIP, self.catalog))

    def test_www_http_and_protocol_relative_match(self):
        for href in (
            "https://www.blog.kindel.com/2018/05/27/ownership/",
            "http://blog.kindel.com/2018/05/27/ownership",
            "//blog.kindel.com/2018/05/27/ownership/",
            "https://blog.kindel.com/2018/05/27/ownership/?utm=1",
        ):
            self.assertEqual(
                "ownership", essay_links.essay_slug(href, self.catalog), href)

    def test_post_id_matches(self):
        href = "https://blog.kindel.com/?p=%s" % self.ownership_id()
        self.assertEqual("ownership",
                         essay_links.essay_slug(href, self.catalog))
        href = "https://blog.kindel.com/index.php?p=%s" % self.ownership_id()
        self.assertEqual("ownership",
                         essay_links.essay_slug(href, self.catalog))

    def test_non_essay_blog_post_does_not_match(self):
        self.assertEqual("", essay_links.essay_slug(NOT_AN_ESSAY, self.catalog))

    def test_apex_essay_url_is_not_a_blog_link(self):
        href = "https://kindel.com/essays/ownership/"
        self.assertEqual("", essay_links.essay_slug(href, self.catalog))
        self.assertEqual([], essay_links.problems_in_text(href, self.catalog))

    def test_apex_essay_url_must_be_canonical(self):
        for href in (
            "https://kindel.com/essays/ownership",
            "http://kindel.com/essays/ownership/",
            "https://www.kindel.com/essays/ownership/",
        ):
            found = essay_links.problems_in_text(href, self.catalog)
            self.assertEqual([(href, "ownership")], found, href)
            self.assertIn(
                "https://kindel.com/essays/ownership/",
                essay_links.format_problem(href, "ownership"))

    def test_an_unknown_apex_slug_is_rejected(self):
        href = "https://kindel.com/essays/owneship/"
        self.assertEqual(
            [(href, "")], essay_links.problems_in_text(href, self.catalog))
        self.assertIn(
            "not in scripts/essay_catalog.json",
            essay_links.format_problem(href, ""))

    def test_a_noncanonical_essay_path_is_rejected(self):
        canonical = "https://kindel.com/essays/ownership/"
        for href in (
            "https://kindel.com/essays/ownership/extra/",
            "https://kindel.com//essays/ownership/",
            "https://kindel.com/essays//ownership/",
            "https://kindel.com/essays/ownership%2Fextra/",
        ):
            found = essay_links.problems_in_text(href, self.catalog)
            self.assertEqual([(href, "ownership")], found, href)
            self.assertIn(
                canonical, essay_links.format_problem(href, "ownership"))

    def test_an_encoded_slash_with_no_slug_is_rejected(self):
        href = "https://kindel.com/essays/%2F/"
        self.assertEqual(
            [(href, "")], essay_links.problems_in_text(href, self.catalog))
        self.assertIn(
            "not in scripts/essay_catalog.json",
            essay_links.format_problem(href, ""))

    def test_a_noncanonical_url_inside_a_sentence_is_found(self):
        href = "https://kindel.com/essays/ownership/extra/"
        text = "See %s." % href
        self.assertEqual(
            [(href, "ownership")],
            essay_links.problems_in_text(text, self.catalog))

    def test_a_percent_encoded_essay_path_is_rejected(self):
        href = "https://kindel.com/%65ssays/ownership/"
        self.assertEqual(
            [(href, "ownership")],
            essay_links.problems_in_text(href, self.catalog))
        self.assertIn(
            "https://kindel.com/essays/ownership/",
            essay_links.format_problem(href, "ownership"))
        href = "https://kindel.com/%65ssays/owneship/"
        self.assertEqual(
            [(href, "")], essay_links.problems_in_text(href, self.catalog))
        self.assertIn(
            "not in scripts/essay_catalog.json",
            essay_links.format_problem(href, ""))

    def test_a_document_relative_essay_url_is_rejected(self):
        canonical = "https://kindel.com/essays/ownership/"
        for href in ("essays/ownership/", "essays/ownership"):
            found = essay_links.problems_in_text(href, self.catalog)
            self.assertEqual([(href, "ownership")], found, href)
            self.assertIn(
                canonical, essay_links.format_problem(href, "ownership"))

    def test_a_document_relative_unknown_slug_is_rejected(self):
        href = "essays/owneship/"
        self.assertEqual(
            [(href, "")], essay_links.problems_in_text(href, self.catalog))
        self.assertIn(
            "not in scripts/essay_catalog.json",
            essay_links.format_problem(href, ""))

    def test_a_markdown_document_relative_link_is_found(self):
        href = "essays/ownership/"
        text = "See [Ownership](%s) for the essay." % href
        self.assertEqual(
            [(href, "ownership")],
            essay_links.problems_in_text(text, self.catalog))

    def test_a_root_relative_essay_url_is_rejected(self):
        canonical = "https://kindel.com/essays/ownership/"
        for href in ("/essays/ownership/", "/essays/ownership"):
            found = essay_links.problems_in_text(href, self.catalog)
            self.assertEqual([(href, "ownership")], found, href)
            self.assertIn(
                canonical, essay_links.format_problem(href, "ownership"))

    def test_a_root_relative_unknown_slug_is_rejected(self):
        href = "/essays/owneship/"
        self.assertEqual(
            [(href, "")], essay_links.problems_in_text(href, self.catalog))

    def test_a_markdown_root_relative_link_is_found(self):
        href = "/essays/ownership/"
        text = "See [Ownership](%s) for the essay." % href
        self.assertEqual(
            [(href, "ownership")],
            essay_links.problems_in_text(text, self.catalog))

    def test_a_canonical_url_inside_a_sentence_is_clean(self):
        text = "See [Ownership](https://kindel.com/essays/ownership/) today."
        self.assertEqual([], essay_links.problems_in_text(text, self.catalog))

    def test_a_canonical_url_beside_a_relative_one(self):
        good = "https://kindel.com/essays/ownership/"
        bad = "/essays/ownership"
        text = "Keep %s. Drop %s." % (good, bad)
        self.assertEqual(
            [(bad, "ownership")],
            essay_links.problems_in_text(text, self.catalog))

    def test_the_essay_index_and_placeholder_are_not_links(self):
        for text in (
            "https://kindel.com/essays/",
            "https://kindel.com/essays",
            "https://kindel.com/essays/<slug>/",
            "Use /essays/<slug>/ on the apex.",
            "https://kindel.com/",
        ):
            self.assertEqual(
                [], essay_links.problems_in_text(text, self.catalog), text)

    def test_other_hosts_do_not_match(self):
        href = "https://example.com/2018/05/27/ownership/"
        self.assertEqual("", essay_links.essay_slug(href, self.catalog))
        href = "https://example.com/essays/ownership/"
        self.assertEqual([], essay_links.problems_in_text(href, self.catalog))
        href = "https://example.com/%65ssays/ownership/"
        self.assertEqual([], essay_links.problems_in_text(href, self.catalog))

    def test_a_url_inside_a_sentence_is_found(self):
        text = "See %s for the essay." % OWNERSHIP
        self.assertEqual(
            [(OWNERSHIP, "ownership")],
            essay_links.problems_in_text(text, self.catalog))

    def test_classifier_table(self):
        pid = self.ownership_id()
        canonical = "https://kindel.com/essays/ownership/"
        cases = (
            ("https://kindel.com/essays/ownership/", None),
            ("https://kindel.com/essays/", None),
            ("https://kindel.com/essays", None),
            ("https://kindel.com/", None),
            ("https://example.com/essays/ownership/", None),
            ("https://example.com/%65ssays/ownership/", None),
            ("https://kindel.com/%2565ssays/ownership/", None),
            ("%2565ssays/ownership/", None),
            (NOT_AN_ESSAY, None),
            (INTERVIEW, "interviews-are-better-with-behavioral-questions"),
            (OWNERSHIP, "ownership"),
            ("https://www.blog.kindel.com/2018/05/27/ownership/", "ownership"),
            ("http://blog.kindel.com/2018/05/27/ownership", "ownership"),
            ("//blog.kindel.com/2018/05/27/ownership/", "ownership"),
            ("https://blog.kindel.com/2018/05/27/ownership/?utm=1", "ownership"),
            ("https://blog.kindel.com/?p=%s" % pid, "ownership"),
            ("https://blog.kindel.com/index.php?p=%s" % pid, "ownership"),
            ("https://blog.kindel.com/%32%30%31%38/05/27/ownership/", "ownership"),
            ("https://blog.kindel.com/2018/05/27/ownership%2F", "ownership"),
            ("https://blog.kindel.com/2018/05/../05/27/ownership/", "ownership"),
            ("https://blog.kindel.com/2018/05/27/foo/../ownership/", "ownership"),
            ("https://BLOG.KINDEL.COM/2018/05/27/Ownership/", "ownership"),
            ("https://kindel.com/essays/ownership", "ownership"),
            ("http://kindel.com/essays/ownership/", "ownership"),
            ("https://www.kindel.com/essays/ownership/", "ownership"),
            ("https://KINDEL.COM/Essays/Ownership/", "ownership"),
            ("https://kindel.com/essays/ownership/?utm=1", "ownership"),
            ("https://kindel.com/essays/ownership/#top", "ownership"),
            ("https://kindel.com/essays/owneship/", ""),
            ("https://kindel.com/essays/ownership/extra/", "ownership"),
            ("https://kindel.com//essays/ownership/", "ownership"),
            ("https://kindel.com/essays//ownership/", "ownership"),
            ("https://kindel.com/essays/ownership%2Fextra/", "ownership"),
            ("https://kindel.com/essays/%2F/", ""),
            ("https://kindel.com/%65ssays/ownership/", "ownership"),
            ("https://kindel.com/%65ssays/owneship/", ""),
            ("https://kindel.com/foo/../essays/ownership/", "ownership"),
            ("https://kindel.com/essays/./ownership/", "ownership"),
            ("https://kindel.com/essays/ownership/../ownership/", "ownership"),
            ("/essays/ownership/", "ownership"),
            ("/essays/ownership", "ownership"),
            ("/essays/owneship/", ""),
            ("essays/ownership/", "ownership"),
            ("essays/ownership", "ownership"),
            ("essays/owneship/", ""),
            ("/%65ssays/ownership/", "ownership"),
            ("%65ssays/ownership/", "ownership"),
            ("%65ssays%2Fownership/", "ownership"),
            ("./%65ssays/ownership/", "ownership"),
            ("../essays/ownership/", "ownership"),
            ("./essays/ownership/", "ownership"),
            ("foo/../essays/ownership/", "ownership"),
            ("//kindel.com/essays/ownership/", "ownership"),
        )
        for href, slug in cases:
            found = essay_links.problems_in_text(href, self.catalog)
            if slug is None:
                self.assertEqual([], found, href)
            else:
                self.assertEqual([(href, slug)], found, href)
                if slug:
                    self.assertIn(
                        essay_links.canonical_essay_url(slug),
                        essay_links.format_problem(href, slug))

    def test_a_quoted_stored_url_keeps_trailing_punctuation(self):
        period = "https://kindel.com/essays/ownership/."
        paren = "https://kindel.com/essays/ownership/)"
        self.assertEqual(
            [(period, "ownership")],
            essay_links.problems_in_text('"%s"' % period, self.catalog))
        # A closing parenthesis ends a Markdown link, so the prose scan
        # stops before it. A stored field is the whole string.
        self.assertEqual(
            (paren, "ownership"),
            essay_links._classify(paren, self.catalog, True))

    def test_prose_punctuation_around_a_canonical_url_is_kept(self):
        self.assertEqual(
            [],
            essay_links.problems_in_text(
                "See https://kindel.com/essays/ownership/.", self.catalog))
        self.assertEqual(
            [],
            essay_links.problems_in_text(
                "See [Ownership](https://kindel.com/essays/ownership/) today.",
                self.catalog))

    def test_a_url_field_with_extra_text_is_rejected(self):
        spaced = "https://kindel.com/essays/ownership/ extra"
        errs = []
        essay_links.check_value(
            {"blog": [{"url": spaced}]}, "card.json", self.catalog, errs)
        self.assertTrue(any(spaced in e for e in errs), errs)
        self.assertTrue(
            any("https://kindel.com/essays/ownership/" in e for e in errs),
            errs)
        blog = OWNERSHIP + " extra"
        errs = []
        essay_links.check_value({"url": blog}, "card.json", self.catalog, errs)
        self.assertTrue(any(OWNERSHIP in e for e in errs), errs)
        errs = []
        essay_links.check_value(
            {"url": NOT_AN_ESSAY + " extra"}, "card.json", self.catalog, errs)
        self.assertEqual([], errs)

    def test_json_values_keep_prose_periods_and_stored_parens(self):
        prose = '{"note": "See https://kindel.com/essays/ownership/."}\n'
        paren = "https://kindel.com/essays/ownership/)"
        stored = '{"href": "%s"}\n' % paren
        with tempfile.TemporaryDirectory() as root:
            with open(os.path.join(root, "note.json"), "w", encoding="utf-8") as fh:
                fh.write(prose)
            self.assertEqual([], essay_links.repo_problems(root, self.catalog))
        with tempfile.TemporaryDirectory() as root:
            with open(os.path.join(root, "card.json"), "w", encoding="utf-8") as fh:
                fh.write(stored)
            problems = essay_links.repo_problems(root, self.catalog)
        self.assertEqual(1, len(problems), problems)
        self.assertIn("card.json", problems[0])
        self.assertIn(paren, problems[0])
        self.assertIn("https://kindel.com/essays/ownership/", problems[0])

    def test_repo_has_no_blog_essay_link(self):
        self.assertEqual([], essay_links.repo_problems(ROOT, self.catalog))

    def test_scan_flags_a_product_file_and_skips_tests(self):
        with tempfile.TemporaryDirectory() as root:
            with open(os.path.join(root, "card.json"), "w", encoding="utf-8") as fh:
                fh.write('{"href": "%s"}\n' % OWNERSHIP)
            os.makedirs(os.path.join(root, "tests"))
            with open(os.path.join(root, "tests", "planted.py"), "w",
                      encoding="utf-8") as fh:
                fh.write('HREF = "%s"\n' % OWNERSHIP)
            problems = essay_links.repo_problems(root, self.catalog)
        self.assertEqual(1, len(problems), problems)
        self.assertIn("card.json", problems[0])
        self.assertIn("https://kindel.com/essays/ownership/", problems[0])
        self.assertNotIn("planted.py", problems[0])


if __name__ == "__main__":
    unittest.main()
