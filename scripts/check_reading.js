#!/usr/bin/env node
// Renders the real page script against the bank and checks the company view
// the way a visitor sees it. USMC must link the traits page from Further
// reading. The preamble no longer carries that URL.
//
//   node scripts/check_reading.js
//
// Exits non-zero on any failure.
const fs = require("fs");
const path = require("path");

const ROOT = path.dirname(__dirname);
const TRAITS = "https://www.mcjrotc.marines.mil/About/Leadership-Traits/";
const fail = [];

function check(cond, message) {
  if (!cond) fail.push(message);
}

function createElement(tag) {
  const el = {
    tagName: String(tag || "").toUpperCase(),
    id: "",
    className: "",
    hidden: false,
    childNodes: [],
    parentNode: null,
    attributes: {},
    listeners: {},
    value: "",
    checked: false,
    type: "",
    src: "",
    alt: "",
    href: "",
    rel: "",
    tabIndex: 0,
    _html: "",
    _text: "",
  };
  el.classList = {
    add(c) {
      const parts = el.className.split(/\s+/).filter(Boolean);
      if (parts.indexOf(c) === -1) parts.push(c);
      el.className = parts.join(" ");
    },
    remove(c) {
      el.className = el.className.split(/\s+/).filter((x) => x && x !== c).join(" ");
    },
  };
  el.setAttribute = (k, v) => {
    el.attributes[k] = String(v);
    if (k === "id") el.id = String(v);
    if (k === "class") el.className = String(v);
  };
  el.getAttribute = (k) => (Object.prototype.hasOwnProperty.call(el.attributes, k) ? el.attributes[k] : null);
  el.removeAttribute = (k) => {
    delete el.attributes[k];
  };
  el.appendChild = (child) => {
    detach(child);
    child.parentNode = el;
    el.childNodes.push(child);
    return child;
  };
  el.insertBefore = (child, ref) => {
    detach(child);
    child.parentNode = el;
    const i = ref ? el.childNodes.indexOf(ref) : -1;
    if (i < 0) el.childNodes.push(child);
    else el.childNodes.splice(i, 0, child);
    return child;
  };
  el.replaceChild = (child, old) => {
    const i = el.childNodes.indexOf(old);
    detach(child);
    child.parentNode = el;
    if (i < 0) el.childNodes.push(child);
    else el.childNodes.splice(i, 1, child);
    old.parentNode = null;
    return old;
  };
  el.addEventListener = (type, fn) => {
    (el.listeners[type] || (el.listeners[type] = [])).push(fn);
  };
  el.click = () => {
    const ev = { target: el, preventDefault() {}, key: "" };
    (el.listeners.click || []).forEach((fn) => fn.call(el, ev));
  };
  el.focus = () => {};
  Object.defineProperty(el, "nextSibling", {
    get() {
      const p = el.parentNode;
      if (!p) return null;
      const i = p.childNodes.indexOf(el);
      return i >= 0 ? p.childNodes[i + 1] || null : null;
    },
  });
  Object.defineProperty(el, "parentElement", { get() { return el.parentNode; } });
  Object.defineProperty(el, "innerHTML", {
    get() { return el._html; },
    set(html) {
      el._html = String(html);
      el.childNodes = [];
    },
  });
  Object.defineProperty(el, "textContent", {
    get() {
      if (el.childNodes.length) {
        return el.childNodes.map((n) => n.textContent || "").join("");
      }
      return el._text;
    },
    set(v) {
      el._text = String(v);
      el.childNodes = [];
    },
  });
  el.querySelectorAll = (sel) => collect(el, sel, false);
  el.querySelector = (sel) => collect(el, sel, false)[0] || null;
  el.closest = () => null;
  return el;
}

function detach(child) {
  if (!child || !child.parentNode) return;
  const p = child.parentNode;
  const i = p.childNodes.indexOf(child);
  if (i >= 0) p.childNodes.splice(i, 1);
  child.parentNode = null;
}

function matches(el, sel) {
  if (!el || !el.tagName) return false;
  let rest = sel.trim();
  let tag = "";
  if (rest[0] === ".") {
    return el.className.split(/\s+/).indexOf(rest.slice(1)) !== -1;
  }
  if (rest[0] !== "[") {
    const tm = /^([a-zA-Z0-9]+)/.exec(rest);
    if (!tm) return false;
    tag = tm[1].toUpperCase();
    rest = rest.slice(tm[1].length);
    if (el.tagName !== tag) return false;
    if (!rest) return true;
  }
  const attrs = rest.match(/\[[^\]]+\]/g) || [];
  if (!attrs.length) return false;
  return attrs.every((raw) => {
    const body = raw.slice(1, -1);
    const eq = body.indexOf("=");
    if (eq < 0) return el.getAttribute(body) !== null;
    const k = body.slice(0, eq);
    let v = body.slice(eq + 1);
    if (v[0] === '"' && v[v.length - 1] === '"') v = v.slice(1, -1);
    return el.getAttribute(k) === v;
  });
}

function collect(root, sel, includeSelf) {
  const out = [];
  function walk(node, self) {
    if (!node) return;
    if (self && matches(node, sel)) out.push(node);
    (node.childNodes || []).forEach((child) => walk(child, true));
  }
  walk(root, includeSelf);
  return out;
}

function findId(root, id) {
  if (!root) return null;
  if (root.id === id) return root;
  for (const child of root.childNodes || []) {
    const hit = findId(child, id);
    if (hit) return hit;
  }
  return null;
}

function makeDocument(withHost) {
  const body = createElement("body");
  const main = createElement("main");
  body.appendChild(main);
  const pre = createElement("p");
  pre.id = "bhiq-set-preamble";
  pre.hidden = true;
  main.appendChild(pre);
  const view = createElement("div");
  view.className = "bhiq-company-view";
  const company = createElement("div");
  company.id = "bhiq-company";
  company.setAttribute("data-universal-label", "Universal principles");
  view.appendChild(company);
  const back = createElement("p");
  back.id = "bhiq-back";
  back.hidden = true;
  view.appendChild(back);
  main.appendChild(view);
  const input = createElement("input");
  input.id = "bhiq-input";
  main.appendChild(input);
  const label = createElement("label");
  label.id = "bhiq-input-label";
  main.appendChild(label);
  const chips = createElement("div");
  chips.id = "bhiq-chips";
  main.appendChild(chips);
  if (withHost) {
    const host = createElement("section");
    host.id = "bhiq-further-reading";
    host.className = "bhiq-further";
    host.hidden = true;
    main.appendChild(host);
  }
  const level = createElement("div");
  level.id = "bhiq-level-block";
  main.appendChild(level);
  const results = createElement("div");
  results.id = "bhiq-results";
  main.appendChild(results);
  return {
    baseURI: "",
    body,
    createElement,
    createTextNode(text) {
      const n = createElement("#text");
      n.textContent = text;
      return n;
    },
    getElementById(id) { return findId(body, id); },
    querySelector(sel) { return collect(body, sel, true)[0] || null; },
    querySelectorAll(sel) { return collect(body, sel, true); },
  };
}

function anchors(root) {
  return collect(root, "a", true);
}

function boot(bank, search, withHost) {
  const href = "http://127.0.0.1:8765/index.html" + (search || "");
  const location = {
    href,
    origin: "http://127.0.0.1:8765",
    pathname: "/index.html",
    search: search || "",
    hash: "",
  };
  const document = makeDocument(withHost);
  document.baseURI = href;
  const window = {
    location,
    history: {
      replaceState(_state, _title, next) {
        const u = new URL(next, location.href);
        location.href = u.href;
        location.pathname = u.pathname;
        location.search = u.search;
        location.hash = u.hash;
        document.baseURI = location.href;
      },
    },
  };
  const sessionStorage = {
    store: {},
    getItem(k) { return Object.prototype.hasOwnProperty.call(this.store, k) ? this.store[k] : null; },
    setItem(k, v) { this.store[k] = String(v); },
  };
  const fetchImpl = () => Promise.resolve({
    ok: true,
    json: () => Promise.resolve(bank),
  });
  const code = fs.readFileSync(path.join(ROOT, "js", "biq.js"), "utf8");
  const run = new Function("fetch", "sessionStorage", "window", "document", code);
  run(fetchImpl, sessionStorage, window, document);
  return document;
}

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 40));
}

function hrefs(document) {
  const host = document.getElementById("bhiq-further-reading");
  if (!host || host.hidden) return [];
  return anchors(host).map((a) => a.href);
}

async function main() {
  const page = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  check(page.includes('id="bhiq-further-reading"'), "index.html is missing the further reading section");
  check(page.indexOf('id="bhiq-chips"') < page.indexOf('id="bhiq-further-reading"'),
    "further reading should follow the principle picker");
  check(page.indexOf('id="bhiq-company"') < page.indexOf('id="bhiq-input"'),
    "the company picker should come before the principle picker");
  check(page.indexOf('id="bhiq-further-reading"') < page.indexOf('id="bhiq-level-block"'),
    "further reading should sit above the level picker");

  const bank = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "questions.json"), "utf8"));
  const usmc = bank.companies.find((c) => c.id === "usmc");
  const gitlab = bank.companies.find((c) => c.id === "gitlab");
  check(usmc && (usmc.blog || []).some((item) => item.url === TRAITS), "bank is missing the USMC traits URL");

  const doc = boot(bank, "?c=usmc", true);
  await flush();
  const tiles = doc.getElementById("bhiq-company").querySelectorAll("[data-company]");
  check(tiles.length === bank.companies.length, "boot did not render a tile per company, got " + tiles.length);
  const host = doc.getElementById("bhiq-further-reading");
  check(host && host.hidden === false, "USMC further reading is hidden");
  check((host.textContent || "").indexOf("Further reading") !== -1, "USMC view is missing the Further reading label");
  const rendered = hrefs(doc);
  const want = (usmc.blog || []).map((item) => item.url);
  check(rendered.join("\n") === want.join("\n"), "USMC rendered links:\n" + rendered.join("\n") + "\nwant:\n" + want.join("\n"));
  const traits = anchors(host).find((a) => a.href === TRAITS);
  check(traits && traits.textContent === "Leadership Traits", "USMC view does not link Leadership Traits to the traits page");
  check(traits && traits.rel === "noopener noreferrer", "traits link is missing rel=noopener noreferrer");
  const note = traits && traits.parentNode && anchors(traits.parentNode).length
    ? (traits.parentNode.textContent || "")
    : "";
  check(note.indexOf("JJ DID TIE BUCKLE") !== -1, "traits note is not in the USMC view");
  const pre = doc.getElementById("bhiq-set-preamble");
  check(pre && pre.hidden === false, "USMC preamble is hidden");
  check((pre.innerHTML || "").indexOf(TRAITS) === -1, "traits URL is still inside the preamble");
  check((pre.innerHTML || "").indexOf("<a ") === -1, "USMC preamble still renders an anchor");
  rendered.forEach((url) => {
    check(/^https:\/\//.test(url), "non-https link rendered: " + url);
  });

  const gitlabTile = tiles.find((t) => t.getAttribute("data-company") === "gitlab");
  check(gitlabTile, "gitlab tile is missing");
  if (gitlabTile) gitlabTile.click();
  const afterGitlab = hrefs(doc);
  check(afterGitlab.indexOf(TRAITS) === -1, "USMC traits link stayed on the GitLab view");
  check(afterGitlab.join("\n") === (gitlab.blog || []).map((item) => item.url).join("\n"),
    "GitLab rendered links do not match its catalog");

  const genericTile = tiles.find((t) => t.getAttribute("data-company") === "generic");
  if (genericTile) genericTile.click();
  const generic = bank.companies.find((c) => c.id === "generic");
  check(hrefs(doc).join("\n") === (generic.blog || []).map((item) => item.url).join("\n"),
    "universal view did not render its catalog");

  // Older host shell: no reading node in the markup. The script has to add one.
  const older = boot(bank, "?c=usmc", false);
  await flush();
  const created = older.getElementById("bhiq-further-reading");
  const olderChips = older.getElementById("bhiq-chips");
  check(created && created.parentNode && created.parentNode.childNodes.indexOf(created) === created.parentNode.childNodes.indexOf(olderChips) + 1,
    "older host shell did not place further reading right after the principle picker");
  check(created && hrefs(older).indexOf(TRAITS) !== -1, "older host shell did not render the traits link");

  const evil = {
    defaultCompany: "generic",
    companies: [{
      id: "generic",
      name: "Universal Leadership Principles",
      set: "Leadership Principles",
      item: "Leadership principle",
      principles: [{ id: 1, slug: "ownership", name: "Ownership", aliases: [], questions: [] }],
      blog: [
        { title: "Script", url: "javascript:alert(1)", note: "Drop this." },
        { title: "Insecure", url: "http://example.com/plain", note: "Drop this." },
        { title: "Official", url: "https://www.mcjrotc.marines.mil/About/Leadership-Traits/", note: "Keep the real traits page." },
        { title: " ", url: "https://example.com/blank-title", note: "Drop this." },
      ],
    }],
  };
  const filtered = boot(evil, "", true);
  await flush();
  const kept = hrefs(filtered);
  check(kept.length === 1 && kept[0] === TRAITS, "unsafe catalog entries were rendered: " + kept.join(", "));

  if (fail.length) {
    console.error(fail.join("\n"));
    process.exit(1);
  }
  console.log("usmc traits link rendered");
  console.log("gitlab catalog rendered");
  console.log("generic catalog rendered");
  console.log("unsafe urls dropped");
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
