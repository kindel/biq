#!/usr/bin/env python3
"""Every Further reading list carries at least one source beyond the blog.

The `blog` field in data/lps renders as Further reading in Porridge
(kindel/porridge#46). Tig's posts stay, and each list also needs one
external source: the published principles, a shareholder letter, a book,
or an essay or talk by someone who shaped the practice. See SCHEMA.md.
"""

import json
import os
import unittest
from urllib.parse import urlparse

LPS = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                   "data", "lps")
BLOG_HOST = "blog.kindel.com"


def lists():
    for name in sorted(os.listdir(LPS)):
        if name.endswith(".json"):
            with open(os.path.join(LPS, name), encoding="utf-8") as f:
                yield name, json.load(f).get("blog")


class FurtherReadingTest(unittest.TestCase):

    def test_every_list_has_an_external_source(self):
        seen = 0
        for name, items in lists():
            seen += 1
            with self.subTest(file=name):
                self.assertTrue(items, "blog list is missing or empty")
                hosts = [urlparse(i["url"]).hostname for i in items]
                self.assertTrue(any(h != BLOG_HOST for h in hosts),
                                "needs at least one source beyond " + BLOG_HOST)
        self.assertEqual(seen, 15, "14 principles plus index.json")

    def test_entries_have_the_same_shape(self):
        for name, items in lists():
            for i in items or []:
                with self.subTest(file=name, title=i.get("title")):
                    self.assertEqual(set(i), {"title", "url", "note"})
                    self.assertEqual(urlparse(i["url"]).scheme, "https")
                    self.assertTrue(i["title"].strip())
                    self.assertTrue(i["note"].strip())
                    for s in i.values():
                        self.assertNotIn("—", s, "no em dashes")

    def test_no_duplicate_urls_in_a_list(self):
        for name, items in lists():
            urls = [i["url"] for i in items or []]
            with self.subTest(file=name):
                self.assertEqual(len(urls), len(set(urls)))


if __name__ == "__main__":
    unittest.main()
