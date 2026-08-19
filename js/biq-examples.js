(function () {
  var cfg = window.BIQ || {};
  var questionsUrl = cfg.questions || "/data/questions.json";
  var examplesData = cfg.examplesData || "/data/examples/";
  if (examplesData.slice(-1) !== "/") examplesData += "/";
  var examplesFallback = cfg.examplesFallback || "/data/biq-examples.json";

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

  var params = new URLSearchParams(window.location.search);
  var principle = params.get("p") || "";
  var question = params.get("q") || "";
  var company = params.get("c") || "";
  var qid = params.get("qid") || "";
  var contextEl = document.getElementById("biq-ex-context");
  var principleEl = document.getElementById("biq-ex-principle");
  var questionEl = document.getElementById("biq-ex-question");
  var statusEl = document.getElementById("biq-ex-status");
  var sheetEl = document.getElementById("biq-ex-sheet");
  var backEl = document.getElementById("biq-ex-back");
  if (!questionEl || !statusEl || !sheetEl) return;

  // Keep the company scope on the way back, so ?c=arm returns to Arm's bank.
  if (backEl && company) {
    try {
      var backUrl = new URL(backEl.getAttribute("href"), document.baseURI || window.location.href);
      backUrl.searchParams.set("c", company);
      backEl.setAttribute("href", backUrl.pathname + backUrl.search + backUrl.hash);
    } catch (e) {}
  }

  var LEVELS = ["junior", "senior", "exec"];
  var LEVEL_KEY = "bhiq-level";
  var LEVEL_LABEL = { junior: "Junior", senior: "Senior", exec: "Exec" };
  var loaded = null;

  function validLevel(v) {
    v = String(v || "").toLowerCase();
    if (v === "manager") v = "senior";
    return LEVELS.indexOf(v) !== -1 ? v : "senior";
  }

  function readStoredLevel() {
    try {
      return sessionStorage.getItem(LEVEL_KEY);
    } catch (e) {
      return "";
    }
  }

  function setLevel(v) {
    v = validLevel(v);
    try {
      sessionStorage.setItem(LEVEL_KEY, v);
    } catch (e) {}
    return v;
  }

  var currentLevel = setLevel(params.get("l") || readStoredLevel());

  if (principleEl && principle) {
    principleEl.textContent = principle;
    principleEl.hidden = false;
  }
  questionEl.textContent = question || "No question was passed.";
  if (question) document.title = question + " · example answers";

  // Shared packs keep the donor question id. When the selected principle
  // is not the one the pack was written for, say so rather than presenting
  // donor-named guidance as this company's.
  function examplesNote(selectedPrinciple, packPrinciple) {
    function n(s) {
      return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
    }
    if (!selectedPrinciple || !packPrinciple) return "";
    if (n(selectedPrinciple) === n(packPrinciple)) return "";
    return "These examples were written for " + packPrinciple +
      ". The question is shared through a common facet.";
  }

  function showDonorNote(pack) {
    var note = examplesNote(principle, pack && pack.principle);
    var el = document.getElementById("biq-ex-note");
    if (!el && principleEl && principleEl.parentNode) {
      el = document.createElement("p");
      el.id = "biq-ex-note";
      el.className = "bhiq-ex-note";
      principleEl.parentNode.insertBefore(el, principleEl.nextSibling);
    }
    if (!el) return;
    if (note) {
      el.hidden = false;
      el.textContent = note;
    } else {
      el.hidden = true;
      el.textContent = "";
    }
  }

  function syncLevelRadios() {
    var inputs = document.querySelectorAll('input[name="bhiq-level"]');
    for (var i = 0; i < inputs.length; i++) {
      inputs[i].checked = inputs[i].value === currentLevel;
      var lab = inputs[i].parentElement;
      if (lab && lab.tagName === "LABEL") {
        if (inputs[i].checked) lab.classList.add("is-on");
        else lab.classList.remove("is-on");
      }
    }
  }

  function updateUrl() {
    try {
      var url = new URL(window.location.href);
      if (principle) url.searchParams.set("p", principle);
      if (question) url.searchParams.set("q", question);
      url.searchParams.set("l", currentLevel);
      window.history.replaceState({}, "", url.pathname + url.search + url.hash);
    } catch (e) {}
  }

  function bindLevel() {
    syncLevelRadios();
    var inputs = document.querySelectorAll('input[name="bhiq-level"]');
    for (var i = 0; i < inputs.length; i++) {
      inputs[i].addEventListener("change", function () {
        if (!this.checked) return;
        currentLevel = setLevel(this.value);
        showCurrent();
        track("biq_level", { biq_level: currentLevel, biq_page: "examples" });
      });
    }
  }

  bindLevel();
  updateUrl();

  if (!question) {
    statusEl.textContent = "Open this page from an Examples button on the question bank.";
    return;
  }

  // slug = 8-char hex FNV-1a of str(principle_id) + "|" + norm(question)
  // JS and the Python regen must match. Python equivalent:
  //   def norm(s):
  //       return " ".join("".join(ch.lower() if ch.isalnum() else " " for ch in (s or "")).split())
  //   def slug_for(principle_id, q):
  //       key = str(principle_id) + "|" + norm(q)
  //       h = 2166136261
  //       for c in key.encode("ascii"):
  //           h ^= c
  //           h = (h * 16777619) & 0xFFFFFFFF
  //       return f"{h:08x}"
  function norm(s) {
    return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  }

  function slugFor(principleId, q) {
    var key = String(principleId) + "|" + norm(q);
    var h = 2166136261;
    for (var i = 0; i < key.length; i++) {
      h ^= key.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return ("00000000" + h.toString(16)).slice(-8);
  }

  function keyFor(principleId, q) {
    return String(principleId) + "|" + norm(q);
  }

  var resolvedPrincipleId = null;

  function findSheet(bank) {
    var sheets = (bank && bank.sheets) || {};
    var exact = sheets[keyFor(principle, question)];
    if (exact) return exact;
    var qn = norm(question);
    var keys = Object.keys(sheets);
    for (var i = 0; i < keys.length; i++) {
      var s = sheets[keys[i]];
      if (norm(s.question) === qn && (!principle || norm(s.principle) === norm(principle))) {
        return s;
      }
    }
    for (var j = 0; j < keys.length; j++) {
      if (norm(sheets[keys[j]].question) === qn) return sheets[keys[j]];
    }
    return null;
  }

  function hasLevelDiag(rows) {
    if (!rows || !rows.length) return false;
    var r = rows[0];
    return !!(r && (r.junior != null || r.senior != null || r.exec != null));
  }

  function missingLevelMessage() {
    return "No " + (LEVEL_LABEL[currentLevel] || currentLevel) + " examples for this question yet.";
  }

  function showCurrent() {
    syncLevelRadios();
    updateUrl();
    if (!loaded) return;
    showDonorNote(loaded.data);
    var trackSlug = qid || (resolvedPrincipleId !== null ? slugFor(resolvedPrincipleId, question) : "");
    if (loaded.kind === "pack") {
      var pack = loaded.data;
      var levelSheet = pack.levels && pack.levels[currentLevel];
      if (!levelSheet) {
        statusEl.hidden = false;
        sheetEl.hidden = true;
        statusEl.textContent = missingLevelMessage();
        track("biq_examples_view", {
          biq_principle: principle,
          biq_question: question,
          biq_level: currentLevel,
          biq_slug: trackSlug,
          biq_status: "missing_level"
        });
        return;
      }
      statusEl.hidden = true;
      sheetEl.hidden = false;
      track("biq_examples_view", {
        biq_principle: principle,
        biq_question: question,
        biq_level: currentLevel,
        biq_slug: trackSlug,
        biq_status: "ok"
      });
      renderSheet({
        question: pack.question,
        raiseTranscript: levelSheet.raiseTranscript,
        raiseNotes: levelSheet.raiseNotes,
        raiseFeedback: levelSheet.raiseFeedback,
        lowerTranscript: levelSheet.lowerTranscript,
        lowerNotes: levelSheet.lowerNotes,
        lowerFeedback: levelSheet.lowerFeedback,
        diagnostic: pack.diagnostic || levelSheet.diagnostic
      });
      return;
    }
    var sheet = loaded.data;
    if (sheet.level && validLevel(sheet.level) === sheet.level && sheet.level !== currentLevel) {
      statusEl.hidden = false;
      sheetEl.hidden = true;
      statusEl.textContent = missingLevelMessage();
      track("biq_examples_view", {
        biq_principle: principle,
        biq_question: question,
        biq_level: currentLevel,
        biq_status: "missing_level"
      });
      return;
    }
    if (loaded.kind === "sheet") {
      statusEl.hidden = false;
      statusEl.textContent = "These examples are not split by level yet.";
    } else {
      statusEl.hidden = true;
    }
    sheetEl.hidden = false;
    track("biq_examples_view", {
      biq_principle: principle,
      biq_question: question,
      biq_level: currentLevel,
      biq_status: loaded.kind === "sheet" ? "legacy" : "ok"
    });
    renderSheet(sheet);
  }

  function showMissing() {
    showDonorNote(null);
    statusEl.hidden = false;
    sheetEl.hidden = true;
    statusEl.textContent = "No saved examples for this question yet.";
    track("biq_examples_view", {
      biq_principle: principle,
      biq_question: question,
      biq_level: currentLevel,
      biq_status: "missing"
    });
  }

  function showLoadError() {
    showDonorNote(null);
    statusEl.hidden = false;
    sheetEl.hidden = true;
    statusEl.textContent = "Could not load the example bank.";
    track("biq_examples_view", {
      biq_principle: principle,
      biq_question: question,
      biq_level: currentLevel,
      biq_status: "error"
    });
  }

  // Resolves true if a legacy sheet was shown, false if the fallback
  // file or sheet is missing. Rejects on unexpected fallback errors.
  function loadFallback() {
    return fetch(examplesFallback)
      .then(function (r) {
        if (r.status === 404) return null;
        if (!r.ok) throw new Error("bad fallback");
        return r.json();
      })
      .then(function (bank) {
        if (!bank) return false;
        var sheet = findSheet(bank);
        if (!sheet) return false;
        loaded = { kind: "sheet", data: sheet };
        statusEl.hidden = false;
        statusEl.textContent = "These examples are not split by level yet.";
        showCurrent();
        return true;
      });
  }

  function resolveContext(bank) {
    var companies = (bank && bank.companies) || [];
    var targetCompany = company ? company.toLowerCase() : "";
    var fallbackCompany = null;
    for (var i = 0; i < companies.length; i++) {
      var c = companies[i];
      if (targetCompany && c.id === targetCompany) fallbackCompany = c;
      if (targetCompany && c.id !== targetCompany) continue;
      var principles = c.principles || [];
      for (var j = 0; j < principles.length; j++) {
        var p = principles[j];
        if (norm(p.name) === norm(principle)) {
          return { company: c, principle: p };
        }
        if (p.slug && norm(p.slug.replace(/-/g, " ")) === norm(principle)) {
          return { company: c, principle: p };
        }
      }
    }
    for (var k = 0; k < companies.length; k++) {
      var c2 = companies[k];
      var principles2 = c2.principles || [];
      for (var m = 0; m < principles2.length; m++) {
        var p2 = principles2[m];
        if (norm(p2.name) === norm(principle)) {
          return { company: c2, principle: p2 };
        }
      }
    }
    return { company: fallbackCompany, principle: null };
  }

  function findQuestion(p) {
    if (!p || !p.questions) return null;
    var qn = norm(question);
    for (var i = 0; i < p.questions.length; i++) {
      var q = p.questions[i];
      if (qid && q.id === qid) return q;
      if (norm(q.text) === qn) return q;
    }
    return null;
  }

  function renderHeader(ctx) {
    if (contextEl && ctx.company) {
      contextEl.textContent = ctx.company.name + " · " + (ctx.company.item || "Principle");
    }
    if (principleEl && ctx.principle) {
      principleEl.textContent = ctx.principle.name;
      principleEl.hidden = false;
    }
    var q = findQuestion(ctx.principle);
    if (q && q.manager && questionEl && !questionEl.querySelector(".bhiq-manager")) {
      var tag = document.createElement("span");
      tag.className = "bhiq-manager";
      tag.textContent = "Manager";
      questionEl.appendChild(tag);
    }
  }

  function fetchPack() {
    var slug = qid || (resolvedPrincipleId !== null ? slugFor(resolvedPrincipleId, question) : null);
    if (!slug) {
      showMissing();
      return;
    }
    fetch(examplesData + slug + ".json")
      .then(function (r) {
        if (r.status === 404) return { missing: true };
        if (!r.ok) throw new Error("bad pack");
        return r.json().then(function (pack) { return { pack: pack }; });
      })
      .then(function (result) {
        if (result.missing) {
          return loadFallback().then(function (found) {
            if (!found) showMissing();
          }).catch(function () {
            showLoadError();
          });
        }
        var pack = result.pack;
        loaded = pack.levels ? { kind: "pack", data: pack } : { kind: "sheet", data: pack };
        showCurrent();
      })
      .catch(function () {
        return loadFallback().then(function (found) {
          if (!found) showLoadError();
        }).catch(function () {
          showLoadError();
        });
      });
  }

  fetch(questionsUrl)
    .then(function (r) {
      if (!r.ok) throw new Error("bank missing");
      return r.json();
    })
    .then(function (bank) {
      var ctx = resolveContext(bank);
      resolvedPrincipleId = ctx.principle && typeof ctx.principle.id === "number" ? ctx.principle.id : null;
      renderHeader(ctx);
      fetchPack();
    })
    .catch(function () {
      showLoadError();
    });

  function renderSheet(b) {
    sheetEl.innerHTML = "";
    var levelName = LEVEL_LABEL[currentLevel] || "Senior";
    sheetEl.appendChild(side("Raises the bar", levelName + " hire-level transcript, notes, and scorecard", b.raiseTranscript, b.raiseNotes, b.raiseFeedback, "raise"));
    sheetEl.appendChild(side("Lowers the bar", levelName + " no-hire transcript, notes, and scorecard", b.lowerTranscript, b.lowerNotes, b.lowerFeedback, "lower"));
    if (b.diagnostic && b.diagnostic.length) {
      var sec = document.createElement("section");
      sec.className = "bhiq-ex-col";
      var h = document.createElement("h3");
      h.textContent = "Quick diagnostic";
      sec.appendChild(h);
      var wrap = document.createElement("div");
      wrap.className = "bhiq-ex-table-wrap";
      var table = document.createElement("table");
      table.className = "bhiq-ex-table";
      var thead = document.createElement("thead");
      var tb = document.createElement("tbody");
      if (hasLevelDiag(b.diagnostic)) {
        thead.innerHTML = "<tr><th>Signal</th><th>Junior</th><th>Senior</th><th>Exec</th></tr>";
        b.diagnostic.forEach(function (row) {
          var tr = document.createElement("tr");
          [row.signal, row.junior, row.senior, row.exec].forEach(function (cell) {
            var td = document.createElement("td");
            td.textContent = cell || "";
            tr.appendChild(td);
          });
          tb.appendChild(tr);
        });
      } else {
        thead.innerHTML = "<tr><th>Signal</th><th>Raises bar</th><th>Lowers bar</th></tr>";
        b.diagnostic.forEach(function (row) {
          var tr = document.createElement("tr");
          [row.signal, row.raises, row.lowers].forEach(function (cell) {
            var td = document.createElement("td");
            td.textContent = cell || "";
            tr.appendChild(td);
          });
          tb.appendChild(tr);
        });
      }
      table.appendChild(thead);
      table.appendChild(tb);
      wrap.appendChild(table);
      sec.appendChild(wrap);
      sheetEl.appendChild(sec);
    }
  }

  function side(title, sub, transcript, notes, feedback, kind) {
    var section = document.createElement("section");
    section.className = "bhiq-ex-col bhiq-ex-" + kind;
    var h = document.createElement("h3");
    h.textContent = title;
    var s = document.createElement("p");
    s.className = "bhiq-ex-sub";
    s.textContent = sub;
    var art = document.createElement("article");

    var tLabel = document.createElement("p");
    tLabel.className = "bhiq-ex-why-label";
    tLabel.textContent = "Candidate response and follow-ups";
    art.appendChild(tLabel);
    art.appendChild(renderTranscript(transcript));

    if (notes && notes.length) {
      var nLabel = document.createElement("p");
      nLabel.className = "bhiq-ex-why-label";
      nLabel.textContent = "Interviewer notes";
      var ul = document.createElement("ul");
      ul.className = "bhiq-ex-why-list";
      notes.forEach(function (item) {
        var li = document.createElement("li");
        li.textContent = item;
        ul.appendChild(li);
      });
      art.appendChild(nLabel);
      art.appendChild(ul);
    }

    if (feedback) {
      var fLabel = document.createElement("p");
      fLabel.className = "bhiq-ex-why-label";
      fLabel.textContent = "Interviewer feedback";
      var fb = document.createElement("p");
      fb.className = "bhiq-ex-feedback";
      fb.textContent = feedback;
      art.appendChild(fLabel);
      art.appendChild(fb);
    }

    section.appendChild(h);
    section.appendChild(s);
    section.appendChild(art);
    return section;
  }

  function renderTranscript(turns) {
    var wrap = document.createElement("div");
    wrap.className = "bhiq-ex-transcript";
    (turns || []).forEach(function (t) {
      var line = document.createElement("p");
      line.className = "bhiq-ex-turn bhiq-ex-turn-" + (t.role === "interviewer" ? "interviewer" : "candidate");
      var who = document.createElement("span");
      who.className = "bhiq-ex-who";
      who.textContent = t.role === "interviewer" ? "Interviewer" : "Candidate";
      line.appendChild(who);
      line.appendChild(document.createTextNode(" " + (t.text || "")));
      wrap.appendChild(line);
    });
    return wrap;
  }
})();
