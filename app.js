(function () {
  "use strict";
  var CFG = window.SURVEY_CONFIG || {};
  var OPTIONS = [
    "Collaboration", "Meeting like minds", "Finding a complementing skill", "Ideas fizzle out after the first chat",
    "Not knowing where to start", "Uneven workload in group work", "Proving what I contributed",
    "Team chat and files all over the place", "Getting feedback from real users", "Meeting students from other courses",
    "Showing my work to employers", "Finding mentors or funding", "Worried my idea gets copied", "Balancing projects with coursework"
  ];
  var MIN_RANK = 3;
  var $ = function (id) { return document.getElementById(id); };
  var live = $("live");
  function say(m) { live.textContent = m; }
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (_) { return null; } }

  // Where did this visit come from? ?s=qr, ?s=text etc. (lets you compare channels)
  var params = new URLSearchParams(location.search);
  var source = (params.get("s") || "direct").replace(/[^a-z0-9-]/gi, "").slice(0, 20) || "direct";
  var baseUrl = location.origin + location.pathname;

  var respondentId = store("psr-id");
  if (!respondentId) {
    respondentId = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
    store("psr-id", respondentId);
  }

  var state = { subject: "", tried: "" };

  // ---------- screens ----------
  function show(id) {
    document.querySelectorAll(".screen").forEach(function (s) { s.hidden = s.id !== id; });
    window.scrollTo(0, 0);
    var h = $(id).querySelector("h1"); if (h) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); }
  }
  document.querySelectorAll("[data-go]").forEach(function (b) { b.addEventListener("click", function () { show(b.dataset.go); }); });

  if (store("psr-done")) {
    var note = document.createElement("p"); note.className = "muted small";
    note.textContent = "You've already taken part on this device. Submitting again will replace your earlier answer.";
    $("startBtn").parentNode.before(note);
  }
  $("consent").addEventListener("change", function () { $("startBtn").disabled = !this.checked; });
  $("startBtn").addEventListener("click", function () { show("s-about"); });

  // ---------- about you ----------
  function aboutReady() { $("aboutNext").disabled = !(state.subject && state.tried); }
  $("subject").addEventListener("change", function () { state.subject = this.value; aboutReady(); });
  var choices = document.querySelectorAll(".choice");
  choices.forEach(function (c, i) {
    c.addEventListener("click", function () { pick(c); });
    c.addEventListener("keydown", function (e) {
      var d = (e.key === "ArrowRight" || e.key === "ArrowDown") ? 1 : (e.key === "ArrowLeft" || e.key === "ArrowUp") ? -1 : 0;
      if (!d) return; e.preventDefault(); var n = choices[(i + d + choices.length) % choices.length]; n.focus(); pick(n);
    });
  });
  function pick(c) {
    choices.forEach(function (x) { x.setAttribute("aria-checked", x === c ? "true" : "false"); x.tabIndex = x === c ? 0 : -1; });
    state.tried = c.dataset.v; aboutReady();
  }
  $("aboutNext").addEventListener("click", function () { show("s-rank"); });

  // ---------- ranking board ----------
  var items = {}, pool = [], rank = [], seq = 0;
  OPTIONS.slice().sort(function () { return Math.random() - 0.5; }).forEach(function (t) {
    var id = "o" + (seq++); items[id] = { id: id, text: t, custom: false }; pool.push(id);
  });
  var poolEl = $("pool"), rankEl = $("rank");

  function render() {
    poolEl.innerHTML = "";
    pool.forEach(function (id) {
      var it = items[id], b = document.createElement("button");
      b.type = "button"; b.className = "opt" + (it.custom ? " custom" : ""); b.dataset.id = id; b.setAttribute("role", "listitem");
      b.setAttribute("aria-label", it.text + ". Add to ranking");
      var s = document.createElement("span"); s.textContent = it.text; b.appendChild(s);
      var a = document.createElement("span"); a.className = "arrow"; a.setAttribute("aria-hidden", "true"); a.textContent = "→"; b.appendChild(a);
      poolEl.appendChild(b);
    });
    if (!pool.length) poolEl.innerHTML = "<div class='empty'>All options ranked. Add your own below.</div>";

    rankEl.innerHTML = "";
    rank.forEach(function (id, i) {
      var it = items[id], row = document.createElement("div");
      row.className = "ranked" + (i < 3 ? " top" : ""); row.dataset.id = id; row.setAttribute("role", "listitem");
      row.innerHTML = "<span class='num'></span><span class='label'></span><span class='tools'>" +
        "<button class='mini' data-act='up' type='button'>↑</button><button class='mini' data-act='down' type='button'>↓</button>" +
        "<button class='mini' data-act='remove' type='button'>×</button></span>";
      row.querySelector(".num").textContent = i + 1;
      row.querySelector(".label").textContent = it.text;
      var t = row.querySelectorAll(".mini");
      t[0].disabled = i === 0; t[1].disabled = i === rank.length - 1;
      t[0].setAttribute("aria-label", "Move " + it.text + " up");
      t[1].setAttribute("aria-label", "Move " + it.text + " down");
      t[2].setAttribute("aria-label", "Remove " + it.text + " from ranking");
      rankEl.appendChild(row);
    });
    if (!rank.length) rankEl.innerHTML = "<div class='empty'>Tap or drag options here.<br>Number 1 = biggest problem.</div>";

    $("poolCount").textContent = pool.length;
    $("rankCount").textContent = rank.length ? rank.length : "";
    var ok = rank.length >= MIN_RANK;
    $("submit").disabled = !ok || sending;
    $("hint").textContent = ok ? "Happy with the order? Submit when ready." : "Rank at least " + (MIN_RANK - rank.length) + " more to continue.";
  }

  function moveToRank(id, index) {
    pool = pool.filter(function (x) { return x !== id; });
    rank = rank.filter(function (x) { return x !== id; });
    if (index == null || index > rank.length) index = rank.length;
    rank.splice(index, 0, id);
    render(); say(items[id].text + " ranked number " + (index + 1));
  }
  function moveToPool(id) {
    rank = rank.filter(function (x) { return x !== id; });
    if (pool.indexOf(id) < 0) pool.push(id);
    render(); say(items[id].text + " moved back to options");
  }

  var suppressClick = false;
  poolEl.addEventListener("click", function (e) {
    if (suppressClick) return;
    var b = e.target.closest(".opt"); if (b) { moveToRank(b.dataset.id); var f = poolEl.querySelector(".opt"); if (f) f.focus(); }
  });
  rankEl.addEventListener("click", function (e) {
    var m = e.target.closest(".mini"); if (!m) return;
    var id = m.closest(".ranked").dataset.id, i = rank.indexOf(id), act = m.dataset.act;
    if (act === "remove") return moveToPool(id);
    var j = act === "up" ? i - 1 : i + 1; if (j < 0 || j >= rank.length) return;
    rank.splice(i, 1); rank.splice(j, 0, id); render(); say(items[id].text + " now number " + (j + 1));
    var btn = rankEl.querySelector('[data-id="' + id + '"] [data-act="' + act + '"]'); if (btn && !btn.disabled) btn.focus();
  });

  // Add your own
  function closeAdd() { $("addForm").hidden = true; $("addBtn").hidden = false; $("addInput").value = ""; }
  $("addBtn").addEventListener("click", function () { $("addBtn").hidden = true; $("addForm").hidden = false; $("addInput").focus(); });
  $("addCancel").addEventListener("click", closeAdd);
  $("addForm").addEventListener("submit", function (e) {
    e.preventDefault(); var t = $("addInput").value.replace(/\s+/g, " ").trim(); if (!t) return;
    var dup = Object.keys(items).some(function (k) { return items[k].text.toLowerCase() === t.toLowerCase(); });
    if (dup) { say("That option already exists"); $("addInput").select(); return; }
    var id = "c" + (seq++); items[id] = { id: id, text: t, custom: true }; pool.push(id); closeAdd(); render(); say(t + " added to options");
  });

  // Drag: mouse starts after a small move; touch needs a short press and hold so the page can still scroll
  var drag = null, startPt = null;
  document.addEventListener("pointerdown", function (e) {
    startPt = { x: e.clientX, y: e.clientY };
    if (e.button !== 0 || e.target.closest(".mini")) return;
    var el = e.target.closest(".opt, .ranked"); if (!el) return;
    drag = { el: el, id: el.dataset.id, from: el.classList.contains("opt") ? "pool" : "rank", x: e.clientX, y: e.clientY, active: false, touch: e.pointerType !== "mouse" };
    if (drag.touch) drag.timer = setTimeout(function () { if (drag) begin(drag.x, drag.y); }, 220);
  });
  function begin(x, y) {
    var r = drag.el.getBoundingClientRect();
    drag.active = true; drag.dx = x - r.left; drag.dy = y - r.top;
    var g = drag.el.cloneNode(true); g.classList.add("ghostdrag"); g.style.width = r.width + "px"; g.style.left = r.left + "px"; g.style.top = r.top + "px";
    g.removeAttribute("id"); g.style.height = r.height + "px";
    document.body.appendChild(g); drag.ghost = g; drag.el.classList.add("dragging"); document.body.classList.add("is-dragging");
    var sel = window.getSelection && window.getSelection(); if (sel && sel.removeAllRanges) sel.removeAllRanges();
    drag.ph = document.createElement("div"); drag.ph.className = "placeholder";
    if (navigator.vibrate) try { navigator.vibrate(10); } catch (_) {}
  }
  document.addEventListener("pointermove", function (e) {
    if (!drag) return;
    drag.x = e.clientX; drag.y = e.clientY;
    if (!drag.active) {
      var dist = Math.hypot(e.clientX - startPt.x, e.clientY - startPt.y);
      if (drag.touch) { if (dist > 10) { clearTimeout(drag.timer); drag = null; } }
      else if (dist > 6) begin(e.clientX, e.clientY);
      return;
    }
    e.preventDefault();
    drag.ghost.style.left = (e.clientX - drag.dx) + "px"; drag.ghost.style.top = (e.clientY - drag.dy) + "px";
    var zone = zoneAt(e.clientX, e.clientY);
    $("colRank").classList.toggle("over", zone === "rank"); $("colPool").classList.toggle("over", zone === "pool" && drag.from === "rank");
    if (zone === "rank") placeAt(e.clientY); else if (drag.ph.parentNode) drag.ph.remove();
  }, { passive: false });
  document.addEventListener("touchmove", function (e) { if (drag && drag.active) e.preventDefault(); }, { passive: false });
  function zoneAt(x, y) { var c = document.elementFromPoint(x, y); c = c && c.closest(".col"); return c ? c.dataset.zone : null; }
  function placeAt(y) {
    var rows = Array.prototype.filter.call(rankEl.querySelectorAll(".ranked"), function (r) { return r !== drag.el; });
    var before = null;
    for (var i = 0; i < rows.length; i++) { var b = rows[i].getBoundingClientRect(); if (y < b.top + b.height / 2) { before = rows[i]; break; } }
    var empty = rankEl.querySelector(".empty"); if (empty) empty.hidden = true;
    if (before) rankEl.insertBefore(drag.ph, before); else rankEl.appendChild(drag.ph);
  }
  function end(e, cancelled) {
    if (!drag) return; clearTimeout(drag.timer);
    var d = drag; drag = null;
    if (!d.active) return;
    suppressClick = true; setTimeout(function () { suppressClick = false; }, 0);
    d.ghost.remove(); d.el.classList.remove("dragging"); document.body.classList.remove("is-dragging");
    $("colRank").classList.remove("over"); $("colPool").classList.remove("over");
    var zone = cancelled ? null : zoneAt(e.clientX, e.clientY);
    if (zone === "rank" && d.ph.parentNode) {
      var idx = 0, n = d.ph.previousElementSibling;
      while (n) { if (n.classList.contains("ranked") && n !== d.el) idx++; n = n.previousElementSibling; }
      d.ph.remove(); moveToRank(d.id, idx);
    } else if (zone === "pool" && d.from === "rank") { d.ph.remove(); moveToPool(d.id); }
    else { if (d.ph.parentNode) d.ph.remove(); render(); }
  }
  document.addEventListener("pointerup", function (e) { end(e, false); });
  document.addEventListener("pointercancel", function (e) { end(e, true); });
  document.addEventListener("contextmenu", function (e) { if (e.target.closest(".opt, .ranked")) e.preventDefault(); });
  // Stop the phone's own "drag the text" and text selection from taking over our drag
  ["dragstart", "selectstart"].forEach(function (ev) {
    document.addEventListener(ev, function (e) { var t = e.target.nodeType === 1 ? e.target : e.target.parentElement;
      if (t && t.closest(".opt, .ranked") && !t.closest("input")) e.preventDefault(); });
  });

  // ---------- submit ----------
  var sending = false;
  function payload() {
    return {
      respondentId: respondentId,
      surveyVersion: CFG.surveyVersion || "",
      source: source,
      subject: state.subject,
      triedProject: state.tried,
      ranking: rank.map(function (id) { return items[id].text; }),
      customAdded: Object.keys(items).filter(function (k) { return items[k].custom; }).map(function (k) { return items[k].text; }),
      unranked: pool.map(function (id) { return items[id].text; }),
      submittedAt: new Date().toISOString()
    };
  }
  function send(body) {
    if (!CFG.endpoint) return Promise.reject(new Error("no endpoint"));
    // text/plain avoids a CORS preflight, which Apps Script cannot answer
    var opts = { method: "POST", body: body, headers: { "Content-Type": "text/plain;charset=utf-8" } };
    return fetch(CFG.endpoint, opts)
      .then(function (r) { return r.json(); })
      .then(function (j) { return { reply: j }; }, function () { return { reply: null }; })
      .then(function (res) {
        if (res.reply) { if (!res.reply.ok) throw new Error("server said no"); return; }
        // Reply unreadable (e.g. a blocked redirect): send once more without reading it.
        // The sheet keeps one row per person, so a double send can't duplicate.
        return fetch(CFG.endpoint, Object.assign({ mode: "no-cors" }, opts));
      });
  }
  $("submit").addEventListener("click", function () {
    if (sending) return;
    sending = true; render(); $("submit").textContent = "Sending…"; $("sendError").hidden = true;
    send(JSON.stringify(payload())).then(function () {
      store("psr-done", "1");
      var ol = $("doneList"); ol.innerHTML = "";
      rank.forEach(function (id) { var li = document.createElement("li"); li.textContent = items[id].text; ol.appendChild(li); });
      show("s-done");
    }).catch(function () {
      $("sendError").textContent = "Your answers didn't send. Check your connection and press Submit again.";
      $("sendError").hidden = false;
    }).then(function () { sending = false; $("submit").textContent = "Submit"; render(); });
  });

  // ---------- share ----------
  var shareText = "2 minute anonymous survey: what gets in the way when students work on ideas and projects?";
  // Builds the same share box (QR + link to copy + text/WhatsApp) wherever data-share appears
  function buildShare(box) {
    var where = box.getAttribute("data-share");
    var linkUrl = baseUrl + "?s=link", textUrl = baseUrl + "?s=text", waUrl = baseUrl + "?s=whatsapp";
    var isApple = /iPhone|iPad|Mac/.test(navigator.userAgent);
    var inputId = "shareUrl-" + where;
    box.innerHTML =
      "<h2></h2><p class='muted' style='margin:0'></p>" +
      "<div class='sharegrid'><div class='qr' role='img' aria-label='QR code for this survey'></div>" +
      "<div class='sharemain'><label class='small muted' for='" + inputId + "'>Link to copy and send</label>" +
      "<div class='linkrow'><input id='" + inputId + "' class='linkbox' readonly><button class='primary copybtn' type='button'>Copy link</button></div>" +
      "<p class='copied' role='status'></p>" +
      "<div class='sharebtns'><button class='ghost nativebtn' type='button' hidden>Share…</button>" +
      "<a class='ghost smsbtn' href='#'>Send by text</a><a class='ghost wabtn' href='#' target='_blank' rel='noopener'>WhatsApp</a></div></div></div>";
    box.querySelector("h2").textContent = box.getAttribute("data-title");
    box.querySelector("p").textContent = box.getAttribute("data-sub");
    var input = box.querySelector(".linkbox"), msg = box.querySelector(".copied");
    input.value = linkUrl;
    input.addEventListener("focus", function () { input.select(); });
    box.querySelector(".copybtn").addEventListener("click", function () {
      var ok = function () { msg.textContent = "Link copied. Paste it into a message."; };
      var manual = function () { input.focus(); input.select(); msg.textContent = "Press and hold the link, then Copy."; };
      if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(linkUrl).then(ok, manual); else manual();
    });
    box.querySelector(".smsbtn").href = "sms:" + (isApple ? "&" : "?") + "body=" + encodeURIComponent(shareText + " " + textUrl);
    box.querySelector(".wabtn").href = "https://wa.me/?text=" + encodeURIComponent(shareText + " " + waUrl);
    if (navigator.share) {
      var nb = box.querySelector(".nativebtn"); nb.hidden = false;
      nb.addEventListener("click", function () { navigator.share({ title: "Student survey", text: shareText, url: baseUrl + "?s=share" }).catch(function () {}); });
    }
    if (window.qrcode) {
      var q = qrcode(0, "M"); q.addData(baseUrl + "?s=qr-friend"); q.make();
      box.querySelector(".qr").innerHTML = q.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
    }
  }
  document.querySelectorAll("[data-share]").forEach(buildShare);

  render();
})();
