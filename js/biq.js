(function () {
  var cfg = window.BIQ || {};
  var questionsUrl = cfg.questions || "/data/questions.json";
  var examplesPage = cfg.examplesPage || "examples.html";

  function examplesHref(principle, question, level) {
    var u = new URL(examplesPage, window.location.origin);
    if (principle) u.searchParams.set("p", principle);
    if (question) u.searchParams.set("q", question);
    u.searchParams.set("l", level);
    return u.pathname + u.search;
  }

  var input = document.getElementById("bhiq-input");
  var chips = document.getElementById("bhiq-chips");
  var results = document.getElementById("bhiq-results");
  if (!input || !chips || !results) return;

  var lpSelect = null;
  var compSelect = null;
  var LEVELS = ["junior", "senior", "exec"];
  var LEVEL_KEY = "bhiq-level";

  function validLevel(v) {
    v = String(v || "").toLowerCase();
    if (v === "manager") v = "senior";
    return LEVELS.indexOf(v) !== -1 ? v : "senior";
  }

  function getLevel() {
    try {
      return validLevel(sessionStorage.getItem(LEVEL_KEY));
    } catch (e) {
      return "senior";
    }
  }

  function setLevel(v) {
    v = validLevel(v);
    try {
      sessionStorage.setItem(LEVEL_KEY, v);
    } catch (e) {}
    return v;
  }

  function syncLevelRadios() {
    var current = getLevel();
    var inputs = document.querySelectorAll('input[name="bhiq-level"]');
    for (var i = 0; i < inputs.length; i++) {
      inputs[i].checked = inputs[i].value === current;
      var lab = inputs[i].parentElement;
      if (lab && lab.tagName === "LABEL") {
        if (inputs[i].checked) lab.classList.add("is-on");
        else lab.classList.remove("is-on");
      }
    }
  }

  function rewriteExampleLinks() {
    var level = getLevel();
    var links = results.querySelectorAll(".bhiq-examples-btn");
    for (var i = 0; i < links.length; i++) {
      try {
        var u = new URL(links[i].href, window.location.origin);
        u.searchParams.set("l", level);
        var q = u.searchParams.get("q") || "";
        var pr = u.searchParams.get("p") || "";
        links[i].href = examplesHref(pr, q, level);
      } catch (e) {}
    }
  }

  function bindLevel() {
    syncLevelRadios();
    var inputs = document.querySelectorAll('input[name="bhiq-level"]');
    for (var i = 0; i < inputs.length; i++) {
      inputs[i].addEventListener("change", function () {
        if (!this.checked) return;
        setLevel(this.value);
        syncLevelRadios();
        rewriteExampleLinks();
      });
    }
  }

  function norm(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function matches(principle, query) {
    if (!query) return false;
    var names = [principle.name].concat(principle.aliases || []).map(norm);
    if (names.indexOf(query) !== -1) return true;
    for (var i = 0; i < names.length; i++) {
      var n = names[i];
      if (!n || n.length <= 3) continue;
      if (n.indexOf(query) !== -1) return true;
      if (query.length >= 4 && query.indexOf(n) !== -1) return true;
    }
    var tokens = query.split(" ").filter(function (t) { return t.length > 2; });
    if (!tokens.length) return false;
    return names.some(function (n) {
      if (!n || n.length <= 3) return false;
      return tokens.every(function (t) { return n.indexOf(t) !== -1; });
    });
  }

  function kindLabel(kind) {
    return kind === "competency" ? "Competency" : "Leadership principle";
  }

  function fillSelect(sel, placeholder, items) {
    sel.innerHTML = "";
    var opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = placeholder;
    sel.appendChild(opt0);
    items.forEach(function (p) {
      var o = document.createElement("option");
      o.value = p.name;
      o.textContent = p.name;
      sel.appendChild(o);
    });
  }

  function markPlaceholder(sel) {
    if (!sel) return;
    if (sel.value) sel.classList.remove("is-placeholder");
    else sel.classList.add("is-placeholder");
  }

  function findExact(items, raw) {
    var n = norm(raw);
    if (!n) return null;
    for (var i = 0; i < items.length; i++) {
      if (items[i].name === raw || norm(items[i].name) === n) return items[i];
    }
    return null;
  }

  function syncSelects(principles) {
    if (!lpSelect || !compSelect) return;
    var raw = String(input.value || "").trim();
    if (!raw) {
      lpSelect.value = "";
      compSelect.value = "";
      markPlaceholder(lpSelect);
      markPlaceholder(compSelect);
      return;
    }
    var lps = principles.filter(function (p) { return p.kind !== "competency"; });
    var comps = principles.filter(function (p) { return p.kind === "competency"; });
    var lpHit = findExact(lps, raw);
    var compHit = findExact(comps, raw);
    if (lpHit) {
      lpSelect.value = lpHit.name;
      compSelect.value = "";
    } else if (compHit) {
      compSelect.value = compHit.name;
      lpSelect.value = "";
    } else {
      lpSelect.value = "";
      compSelect.value = "";
    }
    markPlaceholder(lpSelect);
    markPlaceholder(compSelect);
  }

  function renderSelects(principles) {
    chips.innerHTML = "";
    var lps = principles.filter(function (p) { return p.kind !== "competency"; });
    var comps = principles.filter(function (p) { return p.kind === "competency"; });

    var wrap = document.createElement("div");
    wrap.className = "bhiq-selects";

    lpSelect = document.createElement("select");
    lpSelect.id = "bhiq-lp";
    lpSelect.className = "bhiq-select is-placeholder";
    lpSelect.setAttribute("aria-label", "Leadership principle");
    fillSelect(lpSelect, "Leadership principle", lps);

    compSelect = document.createElement("select");
    compSelect.id = "bhiq-comp";
    compSelect.className = "bhiq-select is-placeholder";
    compSelect.setAttribute("aria-label", "Competency");
    fillSelect(compSelect, "Competency", comps);

    function onPick(sel, other) {
      return function () {
        if (!sel.value) {
          markPlaceholder(sel);
          return;
        }
        other.value = "";
        markPlaceholder(other);
        markPlaceholder(sel);
        input.value = sel.value;
        input.dispatchEvent(new Event("input"));
        input.focus();
      };
    }

    lpSelect.addEventListener("change", onPick(lpSelect, compSelect));
    compSelect.addEventListener("change", onPick(compSelect, lpSelect));

    wrap.appendChild(lpSelect);
    wrap.appendChild(compSelect);
    chips.appendChild(wrap);
  }

  function renderResults(hits, query) {
    results.innerHTML = "";
    if (!query) {
      results.innerHTML = '<p class="bhiq-empty">Type a principle or a competency, or pick one from a dropdown.</p>';
      return;
    }
    if (!hits.length) {
      results.innerHTML = '<p class="bhiq-empty">No match for that. Try an LP (BFA, DAC, Dive Deep) or a competency (teamwork, communication, judgment).</p>';
      return;
    }
    var level = getLevel();
    hits.forEach(function (p) {
      var section = document.createElement("section");
      section.className = "bhiq-group";
      var k = document.createElement("p");
      k.className = "bhiq-kind";
      k.textContent = kindLabel(p.kind);
      var h2 = document.createElement("h2");
      h2.textContent = p.name;
      var count = document.createElement("p");
      count.className = "bhiq-count";
      count.textContent = p.questions.length + " question" + (p.questions.length === 1 ? "" : "s");
      var ol = document.createElement("ol");
      p.questions.forEach(function (q) {
        var li = document.createElement("li");
        var row = document.createElement("div");
        row.className = "bhiq-qrow";
        var text = document.createElement("div");
        text.className = "bhiq-qtext";
        text.appendChild(document.createTextNode(q.text));
        if (q.manager) {
          var tag = document.createElement("span");
          tag.className = "bhiq-manager";
          tag.textContent = "Manager";
          text.appendChild(tag);
        }
        var ex = document.createElement("a");
        ex.className = "bhiq-examples-btn";
        ex.textContent = "Examples";
        ex.href = examplesHref(p.name, q.text, level);
        row.appendChild(text);
        row.appendChild(ex);
        li.appendChild(row);
        ol.appendChild(li);
      });
      section.appendChild(k);
      section.appendChild(h2);
      section.appendChild(count);
      section.appendChild(ol);
      results.appendChild(section);
    });
  }

  bindLevel();

  fetch(questionsUrl)
    .then(function (r) {
      if (!r.ok) throw new Error("bank missing");
      return r.json();
    })
    .then(function (bank) {
      var principles = bank.principles || [];
      renderSelects(principles);
      renderResults([], "");
      input.addEventListener("input", function () {
        var q = norm(input.value);
        var hits = q ? principles.filter(function (p) { return matches(p, q); }) : [];
        syncSelects(principles);
        renderResults(hits, q);
      });
    })
    .catch(function () {
      results.innerHTML = '<p class="bhiq-empty">Could not load the question bank.</p>';
    });
})();
