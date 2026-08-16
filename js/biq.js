(function () {
  var cfg = window.BIQ || {};
  var questionsUrl = cfg.questions || "/data/questions.json";
  var examplesPage = cfg.examplesPage || "examples.html";

  function track(name, params) {
    if (typeof window.gtag !== "function") return;
    var clean = {};
    Object.keys(params || {}).forEach(function (k) {
      var v = params[k];
      if (v == null || v === "") return;
      if (typeof v === "string" && v.length > 100) v = v.slice(0, 97) + "...";
      clean[k] = v;
    });
    window.gtag("event", name, clean);
  }

  function examplesHref(principle, question, level) {
    // Resolve against the current document, not the origin root, so a relative
    // examplesPage still works when the site is served from a subdirectory.
    var u = new URL(examplesPage, document.baseURI || window.location.href);
    if (principle) u.searchParams.set("p", principle);
    if (question) u.searchParams.set("q", question);
    u.searchParams.set("l", level);
    if (currentCompany && currentCompany.id) u.searchParams.set("c", currentCompany.id);
    if (u.origin !== window.location.origin) return u.href;
    return u.pathname + u.search;
  }

  var input = document.getElementById("bhiq-input");
  var chips = document.getElementById("bhiq-chips");
  var results = document.getElementById("bhiq-results");
  if (!input || !chips || !results) return;

  var lpSelect = null;
  var LEVELS = ["junior", "senior", "exec"];
  var LEVEL_KEY = "bhiq-level";
  var COMPANY_KEY = "bhiq-company";
  var companies = [];
  var currentCompany = null;

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

  function normalizeBank(bank) {
    if (bank && bank.companies && bank.companies.length) return bank.companies;
    return [{
      id: "amazon",
      name: "Amazon",
      set: "Leadership Principles",
      principles: (bank && bank.principles) || []
    }];
  }

  function companyById(id) {
    id = String(id || "").toLowerCase();
    for (var i = 0; i < companies.length; i++) {
      if (companies[i].id === id) return companies[i];
    }
    return companies[0] || null;
  }

  function urlCompany() {
    try {
      return new URL(window.location.href).searchParams.get("c") || "";
    } catch (e) {
      return "";
    }
  }

  function getCompanyId() {
    var fromUrl = urlCompany();
    if (fromUrl && companyById(fromUrl)) return companyById(fromUrl).id;
    return (companies[0] && companies[0].id) || "amazon";
  }

  function setCompany(id) {
    currentCompany = companyById(id) || companies[0];
    try {
      sessionStorage.setItem(COMPANY_KEY, currentCompany.id);
    } catch (e) {}
    try {
      var u = new URL(window.location.href);
      if (currentCompany.id === (companies[0] && companies[0].id)) u.searchParams.delete("c");
      else u.searchParams.set("c", currentCompany.id);
      window.history.replaceState({}, "", u.pathname + u.search + u.hash);
    } catch (e) {}
    return currentCompany;
  }

  function principles() {
    return (currentCompany && currentCompany.principles) || [];
  }

  function hasExamples() {
    return !!(currentCompany && currentCompany.examples !== false);
  }

  function kindLabel() {
    if (currentCompany && currentCompany.id === "arm") return "10x factor";
    return "Leadership principle";
  }

  function selectLabel() {
    return kindLabel();
  }

  function emptyHint() {
    if (currentCompany && currentCompany.id === "arm") {
      return "Type a 10x factor, or pick one from the dropdown.";
    }
    return "Type a principle, or pick one from the dropdown.";
  }

  function missHint() {
    if (currentCompany && currentCompany.id === "arm") {
      return "No match for that. Try Own it, One Arm, or urgency.";
    }
    return "No match for that. Try an LP (BFA, DAC, Dive Deep).";
  }

  function placeholderFor() {
    if (currentCompany && currentCompany.id === "arm") return "Own it, One Arm, urgency";
    return "Customer Obsession, Earn Trust, BFA";
  }

  function syncCompanyRadios() {
    var id = currentCompany ? currentCompany.id : "";
    var inputs = document.querySelectorAll('input[name="bhiq-company"]');
    for (var i = 0; i < inputs.length; i++) {
      inputs[i].checked = inputs[i].value === id;
      var lab = inputs[i].parentElement;
      if (lab && lab.tagName === "LABEL") {
        if (inputs[i].checked) lab.classList.add("is-on");
        else lab.classList.remove("is-on");
      }
    }
    if (input) input.setAttribute("placeholder", placeholderFor());
    var chipsEl = document.getElementById("bhiq-chips");
    if (chipsEl) chipsEl.setAttribute("aria-label", currentCompany && currentCompany.set ? currentCompany.set : "Principles");
    var inputLabel = document.getElementById("bhiq-input-label");
    if (inputLabel) inputLabel.textContent = currentCompany && currentCompany.id === "arm" ? "Factor" : "Principle";
    var levelBlock = document.getElementById("bhiq-level-block");
    if (levelBlock) levelBlock.hidden = !hasExamples();
  }

  function applyCompany(id, rerender) {
    setCompany(id);
    syncCompanyRadios();
    if (!rerender) return;
    if (input) input.value = "";
    renderSelects(principles());
    renderResults([], "");
  }

  function bindCompany() {
    syncCompanyRadios();
    var inputs = document.querySelectorAll('input[name="bhiq-company"]');
    for (var i = 0; i < inputs.length; i++) {
      inputs[i].addEventListener("change", function () {
        if (!this.checked) return;
        applyCompany(this.value, true);
        track("biq_company", { biq_company: this.value, biq_page: "bank" });
      });
    }
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
        var u = new URL(links[i].href, document.baseURI || window.location.href);
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
        track("biq_level", { biq_level: this.value, biq_page: "bank" });
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
    if (!lpSelect) return;
    var raw = String(input.value || "").trim();
    if (!raw) {
      lpSelect.value = "";
      markPlaceholder(lpSelect);
      return;
    }
    var hit = findExact(principles, raw);
    lpSelect.value = hit ? hit.name : "";
    markPlaceholder(lpSelect);
  }

  function renderSelects(principles) {
    chips.innerHTML = "";

    var wrap = document.createElement("div");
    wrap.className = "bhiq-selects";

    lpSelect = document.createElement("select");
    lpSelect.id = "bhiq-lp";
    lpSelect.className = "bhiq-select is-placeholder";
    lpSelect.setAttribute("aria-label", selectLabel());
    fillSelect(lpSelect, selectLabel(), principles);

    lpSelect.addEventListener("change", function () {
      if (!lpSelect.value) {
        markPlaceholder(lpSelect);
        return;
      }
      markPlaceholder(lpSelect);
      input.value = lpSelect.value;
      input.dispatchEvent(new Event("input"));
      input.focus();
    });

    wrap.appendChild(lpSelect);
    chips.appendChild(wrap);
  }

  function renderResults(hits, query) {
    results.innerHTML = "";
    if (!query) {
      results.innerHTML = '<p class="bhiq-empty">' + emptyHint() + "</p>";
      return;
    }
    if (!hits.length) {
      results.innerHTML = '<p class="bhiq-empty">' + missHint() + "</p>";
      return;
    }
    var level = getLevel();
    hits.forEach(function (p) {
      var section = document.createElement("section");
      section.className = "bhiq-group";
      var k = document.createElement("p");
      k.className = "bhiq-kind";
      k.textContent = kindLabel();
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
        row.appendChild(text);
        if (hasExamples()) {
          var ex = document.createElement("a");
          ex.className = "bhiq-examples-btn";
          ex.textContent = "Examples";
          ex.href = examplesHref(p.name, q.text, level);
          row.appendChild(ex);
        }
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
      companies = normalizeBank(bank);
      applyCompany(getCompanyId(), false);
      bindCompany();
      renderSelects(principles());
      renderResults([], "");
      var searchTimer = null;
      input.addEventListener("input", function () {
        var list = principles();
        var q = norm(input.value);
        var hits = q ? list.filter(function (p) { return matches(p, q); }) : [];
        syncSelects(list);
        renderResults(hits, q);
        clearTimeout(searchTimer);
        if (!q) return;
        searchTimer = setTimeout(function () {
          var questions = 0;
          for (var i = 0; i < hits.length; i++) questions += hits[i].questions.length;
          track("biq_search", {
            search_term: String(input.value || "").trim(),
            biq_hit_groups: hits.length,
            biq_questions: questions,
            biq_company: currentCompany ? currentCompany.id : ""
          });
        }, 600);
      });
      results.addEventListener("click", function (e) {
        var a = e.target.closest ? e.target.closest(".bhiq-examples-btn") : null;
        if (!a) return;
        var pr = "";
        var qtext = "";
        try {
          var u = new URL(a.href, document.baseURI || window.location.href);
          pr = u.searchParams.get("p") || "";
          qtext = u.searchParams.get("q") || "";
        } catch (err) {}
        track("biq_examples_open", {
          biq_principle: pr,
          biq_question: qtext,
          biq_level: getLevel()
        });
      });
    })
    .catch(function () {
      results.innerHTML = '<p class="bhiq-empty">Could not load the question bank.</p>';
    });
})();
