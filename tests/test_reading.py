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
                self.assertTrue(any(h and h != BLOG_HOST for h in hosts),
                                "needs at least one source beyond " + BLOG_HOST)
        self.assertEqual(seen, 15, "14 principles plus index.json")

    def test_entries_have_the_same_shape(self):
        for name, items in lists():
            for i in items or []:
                with self.subTest(file=name, title=i.get("title")):
                    self.assertEqual(set(i), {"title", "url", "note"})
                    u = urlparse(i["url"])
                    self.assertEqual(u.scheme, "https")
                    self.assertTrue(u.hostname, "url needs a host")
                    self.assertTrue(i["title"].strip())
                    self.assertTrue(i["note"].strip())
                    for s in i.values():
                        self.assertNotIn("—", s, "no em dashes")

    def test_external_cites(self):
        # Tig set these cites. The published heading is sometimes only a
        # year or a short title, so the list names the author or the source,
        # and the work. The AWS cite names AWS, not an author.
        expected = {
            "https://www.aboutamazon.com/news/company-news/amazons-original-1997-letter-to-shareholders":
                ("Jeff Bezos's 1997 Letter to Amazon Shareholders", 2),
            "https://www.sec.gov/Archives/edgar/data/1018724/000119312510082914/dex991.htm":
                ("Jeff Bezos's 2009 Letter to Amazon Shareholders", 1),
            "https://ir.aboutamazon.com/files/doc_financials/annual/2015-Letter-to-Shareholders.PDF":
                ("Jeff Bezos's 2015 Letter to Amazon Shareholders", 2),
            "https://www.aboutamazon.com/news/company-news/2016-letter-to-shareholders":
                ("Jeff Bezos's 2016 Letter to Amazon Shareholders", 2),
            "https://www.aboutamazon.com/news/company-news/2017-letter-to-shareholders":
                ("Jeff Bezos's 2017 Letter to Amazon Shareholders", 1),
            "https://www.aboutamazon.com/news/company-news/2018-letter-to-shareholders":
                ("Jeff Bezos's 2018 Letter to Amazon Shareholders", 1),
            "https://us.macmillan.com/books/9781250267597/workingbackwards/":
                ("Working Backwards, the book by Colin Bryar and Bill Carr", 3),
            "https://www.amazon.jobs/content/en/our-workplace/leadership-principles":
                ("Amazon's Leadership Principles", 1),
            "https://signalvnoise.com/svn3/some-advice-from-jeff-bezos/":
                ("Jason Fried: Some Advice from Jeff Bezos", 1),
            "https://aws.amazon.com/blogs/mt/why-you-should-develop-a-correction-of-error-coe/":
                ("Why You Should Develop a Correction of Error (COE), from AWS", 1),
        }
        seen = {url: 0 for url in expected}
        for name, items in lists():
            for item in items or []:
                url = item["url"]
                if url not in expected:
                    continue
                want, _n = expected[url]
                with self.subTest(file=name, url=url):
                    self.assertEqual(item["title"], want)
                    self.assertNotIn("\u2019", item["title"])
                seen[url] += 1
        for url, (want, n) in expected.items():
            self.assertEqual(seen[url], n, want)

    def test_no_duplicate_urls_in_a_list(self):
        for name, items in lists():
            urls = [i["url"] for i in items or []]
            with self.subTest(file=name):
                self.assertEqual(len(urls), len(set(urls)))


if __name__ == "__main__":
    unittest.main()
