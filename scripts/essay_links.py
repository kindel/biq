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
segment, a doubled slash, a dot segment, or an encoded slash fails the
same way a blog.kindel.com essay URL does. The path is decoded once and
dot segments are folded before that check. A stored field is judged
before trailing punctuation is removed. A url or href value is one
stored link, so extra text in that field fails the same check. Space
around that value fails too. A note that is only a Markdown link is
still scanned, and punctuation inside that destination stays part of
the link. JSON files are read as decoded values. A sentence in
one of those values may end with a period.

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
import posixpath
import re
import sys
from urllib.parse import parse_qsl, unquote, urljoin, urlparse

_SLUG = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
_DATED = re.compile(r"^/(\d{4})/(\d{2})/(\d{2})/([^/]+)/?$")
_INDEX_PHP = re.compile(r"^/index\.php$", re.IGNORECASE)
_CANDIDATE = re.compile(
    r"(?:https?:)?//[^\s<>\"'`()\[\]]+", re.IGNORECASE)
# Any path-like token, so a percent-encoded prefix is still found.
# Brackets and parentheses stay outside the token so Markdown can wrap a URL.
# The encoded-slash alternative is split so this file is not a candidate.
_PATHY = re.compile(
    r"(?<![A-Za-z0-9@])((?:\.\./|\./)?[^\s<>\"'`()\[\]]*"
    + r"(?:/|%2" + "f)"
    + r"[^\s<>\"'`()\[\]]+)",
    re.IGNORECASE)
_TRAILING = ".,;:)]}>`"
_BASE = "https://kindel.com/"
_OK = ("ok",)
_INDEX_HREF = (
    "https://kindel.com/essays/",
    "https://kindel.com/essays",
    "/essays/",
    "/essays",
    "essays/",
    "essays",
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


def _host(hostname):
    """Lowercase host, www stripped, decoded once."""
    host = unquote(hostname or "").strip().lower()
    if host.startswith("www."):
        host = host[4:]
    return host


def _norm_path(path):
    """Decode once, collapse extra slashes, and fold dot segments.

    A trailing slash is preserved. posixpath.normpath would drop it, and
    it would also keep a leading pair of slashes, so those are fixed here.
    """
    decoded = unquote(path or "")
    if decoded in ("", "/"):
        return "/"
    trailing = decoded.endswith("/")
    collapsed = "/" + decoded.lstrip("/")
    norm = posixpath.normpath(collapsed)
    if not norm.startswith("/"):
        norm = "/" + norm
    if norm != "/" and trailing:
        norm += "/"
    return norm


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


def _blog_slug(path, query, catalog):
    """Catalog slug for a normalized blog path, else ""."""
    dated = _DATED.match(path or "")
    if dated:
        candidate = safe_slug(dated.group(4))
        found = catalog["by_slug"].get(candidate, "") if candidate else ""
        if isinstance(found, str) and safe_slug(found):
            return found
        return ""
    if path not in ("/", "") and not _INDEX_PHP.match(path or ""):
        return ""
    pid = ""
    for key, value in parse_qsl(query or "", keep_blank_values=True):
        if key == "p":
            pid = _id_key(value)
            break
    if not pid:
        return ""
    found = catalog["by_id"].get(pid, "")
    if isinstance(found, str) and safe_slug(found):
        return found
    return ""


def _essay_parts(path):
    """(kind, segment) for a normalized path. kind is no, index, slug, or bad."""
    raw = path or ""
    lower = raw.lower()
    if lower in ("/essays", "/essays/"):
        return ("index", "")
    if not lower.startswith("/essays/"):
        return ("no", "")
    parts = raw[len("/essays/"):].split("/")
    if len(parts) == 1 or (len(parts) == 2 and parts[1] == ""):
        return ("slug", parts[0])
    for part in parts:
        if part:
            return ("bad", part)
    return ("bad", "")


def _judge(href, catalog):
    """Classify one href. No punctuation trimming.

    Returns _OK when the href is allowed, None when it is not an essay
    link, or (href, slug) when it is an essay link that is not the
    canonical string. slug is "" when the path does not name a catalog slug.
    """
    original = "" if href is None else str(href).strip()
    if not original or not catalog:
        return None
    if original in _INDEX_HREF:
        return _OK
    try:
        url = urlparse(urljoin(_BASE, original))
    except ValueError:
        return None
    if url.scheme not in ("http", "https"):
        return None
    host = _host(url.hostname)
    path = _norm_path(url.path)
    if host == "blog.kindel.com":
        slug = _blog_slug(path, url.query, catalog)
        if slug:
            return (original, slug)
        return None
    if host != "kindel.com":
        return None
    kind, segment = _essay_parts(path)
    if kind == "no":
        return None
    if kind == "index":
        return (original, "")
    slug = safe_slug(segment)
    if slug and slug in catalog["by_slug"]:
        if original == canonical_essay_url(slug):
            return _OK
        return (original, slug)
    return (original, "")


def essay_slug(href, catalog):
    """Slug when href is a blog.kindel.com essay link, else ""."""
    original = "" if href is None else str(href).strip()
    if not original or not catalog:
        return ""
    try:
        url = urlparse(urljoin(_BASE, original))
    except ValueError:
        return ""
    if url.scheme not in ("http", "https"):
        return ""
    if _host(url.hostname) != "blog.kindel.com":
        return ""
    verdict = _judge(original, catalog)
    if not verdict or verdict == _OK:
        return ""
    return verdict[1]


def _classify(href, catalog, strict):
    """(href, slug) when href is a non-canonical essay link, else None.

    The raw string is judged first. Trailing punctuation is considered
    only after that. In prose, punctuation that leaves a clean canonical
    URL is decoration. A stored field (strict) keeps the punctuation, so
    the field has to be the canonical string exactly.
    """
    verdict = _judge(href, catalog)
    trimmed = href.rstrip(_TRAILING) if href else href
    if verdict == _OK:
        return None
    if verdict is None:
        if not trimmed or trimmed == href:
            return None
        again = _judge(trimmed, catalog)
        if not again or again == _OK:
            return None
        return again
    if trimmed and trimmed != href:
        again = _judge(trimmed, catalog)
        if not again or again == _OK:
            if strict:
                return verdict
            return None
        if not strict:
            return again
    return verdict


def format_problem(href, slug):
    """slug is the catalog slug the link should use, or "" when it has none."""
    if slug:
        return "essay link %s belongs at %s" % (href, canonical_essay_url(slug))
    return "essay link %s is not in scripts/essay_catalog.json" % href


def _tokens(text):
    """(raw href, end index) for absolute URLs and path-like tokens.

    The raw href keeps trailing punctuation. The caller judges it before
    deciding whether that punctuation is prose.
    """
    spans = []
    found = []
    seen = set()

    def add(raw, end):
        if not raw or (raw, end) in seen:
            return
        seen.add((raw, end))
        found.append((raw, end))

    for match in _CANDIDATE.finditer(text):
        spans.append((match.start(), match.end()))
        add(match.group(0), match.end())
    for match in _PATHY.finditer(text):
        start = match.start(1)
        if any(a <= start < b for a, b in spans):
            continue
        add(match.group(1), match.end(1))
    return found


def problems_in_text(text, catalog):
    """(href, slug) pairs for essay links that are not canonical.

    slug is the catalog slug the link should use, or "" when the path
    does not name one. A token inside quotes, or immediately after a
    Markdown "](", is a stored destination, so trailing punctuation
    stays part of the value. Elsewhere it is prose and is dropped only
    after the raw token has been judged.
    """
    if not text or not catalog:
        return []
    found = []
    seen = set()
    for href, end in _tokens(text):
        start = end - len(href)
        nxt = text[end:end + 1]
        prev = text[start - 2:start] if start >= 2 else ""
        strict = nxt in ('"', "'") or prev == "]("
        issue = _classify(href, catalog, strict)
        if not issue or issue[0] in seen:
            continue
        seen.add(issue[0])
        found.append(issue)
    return found


# Keys whose value is one link, not prose. The field name has to survive
# the walk so extra text in that value is judged with the link.
_LINK_KEYS = {"url", "href"}


def _collect(obj, out):
    """Append (text, as_field). as_field is true for a url or href string."""
    if isinstance(obj, dict):
        for key, value in obj.items():
            if isinstance(value, str) and key in _LINK_KEYS:
                out.append((value, True))
            else:
                _collect(value, out)
    elif isinstance(obj, list):
        for value in obj:
            _collect(value, out)
    elif isinstance(obj, str):
        out.append((obj, False))


def _exact_slug(href, catalog):
    """Slug when href is the canonical essay URL, else ""."""
    for slug in catalog["by_slug"]:
        if href == canonical_essay_url(slug):
            return slug
    return ""


def _stored_link_problem(text, catalog):
    """(href, slug) when a url or href value is a non-exact essay link.

    Surrounding whitespace is rejected before the stripped text is
    classified. Padding cannot turn a canonical URL into an exact match.
    None means the value is not an essay link.
    """
    stripped = text.strip()
    if stripped != text:
        verdict = _judge(stripped, catalog)
        if verdict == _OK:
            slug = _exact_slug(stripped, catalog)
            if slug:
                return (text, slug)
        elif verdict is not None:
            return (text, verdict[1])
    return _classify(stripped, catalog, True)


def check_value(obj, where, catalog, errs):
    """Append an error for each essay link in obj that is not canonical.

    A string with no whitespace is judged whole first. When that check
    finds nothing, the tokens inside are still scanned, so a Markdown
    link that is the whole note cannot hide an essay URL. A url or href
    value keeps its surrounding space, and a sentence may end with a
    period.
    """
    items = []
    _collect(obj, items)
    seen = set()
    for text, as_field in items:
        if as_field:
            issue = _stored_link_problem(text, catalog)
        else:
            issue = None
            whole = text.strip()
            if whole and not any(ch.isspace() for ch in whole):
                issue = _classify(whole, catalog, True)
        if issue and issue[0] not in seen:
            seen.add(issue[0])
            errs.append("%s: %s" % (where, format_problem(issue[0], issue[1])))
        if issue:
            continue
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


def _json_problems(text, rel, catalog):
    """Errors for one JSON document, using decoded values."""
    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        return ["%s: invalid JSON (%s)" % (rel, exc.msg)]
    errs = []
    check_value(data, rel, catalog, errs)
    return errs


def repo_problems(root, catalog):
    """Essay links under root, skipping tests/ and binary files.

    JSON is parsed and checked as values, so a quote after a sentence
    is not part of the link. Other files are scanned as text.
    """
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
            if ext == ".json":
                problems.extend(_json_problems(text, rel, catalog))
                continue
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
