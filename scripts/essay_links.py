#!/usr/bin/env python3
"""Match blog.kindel.com links to Essays-category posts.

Same rules as kindelwww static/js/essay-links.js: a dated
/YYYY/MM/DD/<slug>/ permalink, or a bare /?p=<id> link, and only when
that slug or id is in the Essays category. Other blog posts stay put.

The browser script rewrites to /essays/<slug>/ on the apex host. These
repos are also read off kindel.com, so the link to store is
https://kindel.com/essays/<slug>/. That string has to match exactly,
and the slug has to be in the catalog. A typo, a missing trailing
slash, a root-relative path, a path with no leading slash, an extra
segment, a doubled slash, or an encoded slash fails the same way a
blog.kindel.com essay URL does. A percent-encoded path is decoded once.

scripts/essay_catalog.json is the offline copy of that category
(WordPress id 448). Refresh it from
https://blog.kindel.com/wp-json/wp/v2/posts?categories=448
Fetch every page (per_page=100, follow X-WP-TotalPages). Keep id and
slug. Sort by slug.

  python3 scripts/essay_links.py

Exits non-zero when a product file (everything except tests/) links an
essay on blog.kindel.com, or names an essays path in any form other
than https://kindel.com/essays/<slug>/. Tests plant bad URLs on purpose, so
they are not scanned. The principles validator checks teaching records
directly.
"""

import json
import os
import re
import sys
from urllib.parse import parse_qsl, unquote, urljoin, urlparse

_SLUG = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
_DATED = re.compile(r"^/(\d{4})/(\d{2})/(\d{2})/([^/]+)/?$")
_INDEX_PHP = re.compile(r"^/index\.php$", re.IGNORECASE)
_CANDIDATE = re.compile(r"(?:https?:)?//[^\s<>\"'`]+", re.IGNORECASE)
# Root-relative /essays/ and a path with no leading slash. An absolute
# URL has a letter or a slash before the path, so it is not matched twice.
# The pattern is split so this file does not contain a candidate.
_RELATIVE = re.compile(
    "(?<![A-Za-z0-9])(/essays/" + r"[^\s<>\"'`]+)", re.IGNORECASE)
_DOC_RELATIVE = re.compile(
    "(?<![A-Za-z0-9/._-])(essays/" + r"[^\s<>\"'`]+)", re.IGNORECASE)
_TRAILING = ".,;:)]}>`"
_ESSAY_INDEX = (
    "https://kindel.com/essays/",
    "https://kindel.com/essays",
)

SKIP_DIRS = {".git", "tests", "__pycache__", "node_modules"}
BINARY_EXT = {
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".pdf",
    ".woff", ".woff2",
}


def safe_slug(raw):
    slug = unquote(str(raw or "")).strip().lower()
    if not _SLUG.match(slug):
        return ""
    return slug


def _id_key(value):
    raw = str("" if value is None else value).strip()
    if not re.match(r"^\d+$", raw):
        return ""
    n = int(raw)
    if n <= 0:
        return ""
    return str(n)


def _blog_host(hostname):
    host = (hostname or "").lower()
    if host.startswith("www."):
        host = host[4:]
    return host == "blog.kindel.com"


def catalog_path():
    return os.path.join(os.path.dirname(os.path.abspath(__file__)),
                        "essay_catalog.json")


def load_catalog(path=None):
    """Return (catalog, None) or (None, error).

    catalog maps by_slug and by_id the way essay-links.js does. A slug
    that fails the same safe-slug test, or an id that is not a positive
    integer, fails the load. An empty list would let every essay URL
    through, so that fails too.
    """
    path = path or catalog_path()
    try:
        with open(path, encoding="utf-8") as fh:
            data = json.load(fh)
    except (OSError, ValueError) as exc:
        return None, "unreadable (%s)" % exc
    posts = data.get("posts") if isinstance(data, dict) else None
    if not isinstance(posts, list) or not posts:
        return None, "posts must be a non-empty list"
    by_slug = {}
    by_id = {}
    for i, post in enumerate(posts):
        if not isinstance(post, dict):
            return None, "posts[%d] must be an object" % i
        slug = safe_slug(post.get("slug"))
        if not slug:
            return None, "posts[%d] has no usable slug" % i
        key = _id_key(post.get("id"))
        if not key:
            return None, "posts[%d] has no usable id" % i
        by_slug[slug] = slug
        by_id[key] = slug
    return {"by_slug": by_slug, "by_id": by_id}, None


def canonical_essay_url(slug):
    return "https://kindel.com/essays/" + slug + "/"


def essay_slug(href, catalog):
    """Slug when href is a blog.kindel.com essay link, else ""."""
    if not catalog:
        return ""
    original = "" if href is None else str(href).strip()
    if not original:
        return ""
    try:
        url = urlparse(urljoin("https://kindel.com", original))
    except ValueError:
        return ""
    if url.scheme not in ("http", "https"):
        return ""
    if not _blog_host(url.hostname):
        return ""
    dated = _DATED.match(url.path)
    if dated:
        candidate = safe_slug(dated.group(4))
        found = catalog["by_slug"].get(candidate, "") if candidate else ""
        if isinstance(found, str) and safe_slug(found):
            return found
        return ""
    if url.path not in ("/", "") and not _INDEX_PHP.match(url.path):
        return ""
    pid = ""
    for key, value in parse_qsl(url.query, keep_blank_values=True):
        if key == "p":
            pid = _id_key(value)
            break
    if not pid:
        return ""
    found = catalog["by_id"].get(pid, "")
    if isinstance(found, str) and safe_slug(found):
        return found
    return ""


def _kindel_host(hostname):
    host = (hostname or "").lower()
    if host.startswith("www."):
        host = host[4:]
    return host == "kindel.com"


def format_problem(href, slug):
    """slug is the catalog slug the link should use, or "" when it has none."""
    if slug:
        return "essay link %s belongs at %s" % (href, canonical_essay_url(slug))
    return "essay link %s is not in scripts/essay_catalog.json" % href


def _essay_path_kind(path):
    """Return (kind, segment) for a URL path.

    kind is "no", "index", "slug", or "bad". segment is the first
    non-empty piece after the essays prefix. "slug" is exactly one
    segment, with or without a trailing slash. "bad" is still an essays
    path: an extra segment, a doubled slash, or a slash that was
    percent-encoded. Extra leading slashes still count as essays, and
    they are not the canonical form.
    """
    stripped = unquote(path or "").lstrip("/")
    lower = stripped.lower()
    if lower != "essays" and not lower.startswith("essays/"):
        return ("no", "")
    if lower in ("essays", "essays/"):
        return ("index", "")
    parts = stripped[len("essays/"):].split("/")
    if len(parts) == 1 or (len(parts) == 2 and parts[1] == ""):
        return ("slug", parts[0])
    for part in parts:
        if part:
            return ("bad", part)
    return ("bad", "")


def _apex_issue(href, catalog):
    """(href, slug) when an essays URL is not the canonical form.

    Accepts only https://kindel.com/essays/<slug>/ for a catalog slug.
    A root-relative path and a path with no leading slash are held to
    that same string. A percent-encoded path is decoded once. slug is
    the catalog slug the link should use, or "" when it has none. The
    bare essays index is not an essay post. A placeholder such as
    <slug> never forms a candidate, because the scan stops at <.
    """
    original = href.strip()
    if original in _ESSAY_INDEX:
        return None
    root_relative = original.startswith("/") and not original.startswith("//")
    try:
        url = urlparse(urljoin("https://kindel.com", original))
    except ValueError:
        return None
    if url.scheme not in ("http", "https"):
        return None
    if not root_relative and not _kindel_host(url.hostname):
        return None
    kind, segment = _essay_path_kind(url.path)
    if kind == "no":
        return None
    if kind == "index":
        return (original, "")
    slug = safe_slug(segment)
    if not slug or slug not in catalog["by_slug"]:
        return (original, "")
    if kind == "slug" and original == canonical_essay_url(slug):
        return None
    return (original, slug)


def _hrefs(text):
    """URL candidates, absolute, root-relative, and document-relative."""
    spans = []
    found = []
    seen = set()

    def add(raw):
        href = raw.rstrip(_TRAILING)
        if not href or href in seen:
            return
        seen.add(href)
        found.append(href)

    for match in _CANDIDATE.finditer(text):
        spans.append((match.start(), match.end()))
        add(match.group(0))
    for pattern in (_RELATIVE, _DOC_RELATIVE):
        for match in pattern.finditer(text):
            start = match.start(1)
            if any(a <= start < b for a, b in spans):
                continue
            add(match.group(1))
    return found


def problems_in_text(text, catalog):
    """(href, slug) pairs for essay links that are not canonical.

    slug is the catalog slug for a blog.kindel.com essay, or for an
    essays URL that names a catalog slug but is not exactly
    https://kindel.com/essays/<slug>/. slug is "" when the essays path
    does not name a catalog slug.
    """
    if not text:
        return []
    found = []
    for href in _hrefs(text):
        slug = essay_slug(href, catalog)
        if slug:
            found.append((href, slug))
            continue
        issue = _apex_issue(href, catalog)
        if issue:
            found.append(issue)
    return found


def _strings(obj, out):
    if isinstance(obj, str):
        out.append(obj)
    elif isinstance(obj, dict):
        for value in obj.values():
            _strings(value, out)
    elif isinstance(obj, list):
        for value in obj:
            _strings(value, out)


def check_value(obj, where, catalog, errs):
    """Append an error for each essay link in obj that is not canonical."""
    texts = []
    _strings(obj, texts)
    seen = set()
    for text in texts:
        for href, slug in problems_in_text(text, catalog):
            if href in seen:
                continue
            seen.add(href)
            errs.append("%s: %s" % (where, format_problem(href, slug)))


def _read_text(path):
    try:
        with open(path, encoding="utf-8") as fh:
            return fh.read()
    except (OSError, UnicodeDecodeError):
        return None


def repo_problems(root, catalog):
    """Essay links under root, skipping tests/ and binary files."""
    problems = []
    root = os.path.abspath(root)
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for name in filenames:
            if name.startswith("."):
                continue
            ext = os.path.splitext(name)[1].lower()
            if ext in BINARY_EXT:
                continue
            path = os.path.join(dirpath, name)
            text = _read_text(path)
            if text is None:
                continue
            rel = os.path.relpath(path, root)
            seen = set()
            for href, slug in problems_in_text(text, catalog):
                if href in seen:
                    continue
                seen.add(href)
                problems.append("%s: %s" % (rel, format_problem(href, slug)))
    problems.sort()
    return problems


def main():
    catalog, err = load_catalog()
    if err:
        print("scripts/essay_catalog.json: %s" % err)
        return 1
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    problems = repo_problems(root, catalog)
    if problems:
        for line in problems:
            print(line)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
