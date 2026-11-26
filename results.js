(function () {
  "use strict";
  var CFG = window.SURVEY_CONFIG || {};
  var $ = function (id) { return document.getElementById(id); };
  var KEY_STORE = "psr-read-key";
  var GROUP_NAMES = { subject: "Subject area", triedProject: "Tried a project", source: "How they found it" };
  var SOURCE_NAMES = { qr: "QR poster", "qr-friend": "QR from a friend", text: "Text message", whatsapp: "WhatsApp", link: "Copied link", share: "Phone share button", direct: "Direct link" };
  var all = [], timer = null, lastLoaded = null;

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function getKey() { try { return localStorage.getItem(KEY_STORE) || ""; } catch (_) { return ""; } }
  function setKey(k) { try { localStorage.setItem(KEY_STORE, k); } catch (_) {} }
  function pct(a, b) { return b ? Math.round(a / b * 100) : 0; }
  function srcName(s) { return SOURCE_NAMES[s] || s || "Unknown"; }
  function stamp(d) { return d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); }

  // ---------- loading ----------
  function load(key) {
    $("status").textContent = "Loading…";
    return fetch(CFG.endpoint + "?key=" + encodeURIComponent(key) + "&t=" + Date.now())
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j.ok) throw new Error(j.error === "forbidden" ? "That key isn't right. Check Script properties > READ_KEY." : "The sheet couldn't be read.");
        all = (j.rows || []).map(function (r) {
          return { received: new Date(r.received), source: r.source || "direct", subject: r.subject || "Not given", triedProject: r.triedProject || "Not given",
            ranking: Array.isArray(r.ranking) ? r.ranking : [], custom: Array.isArray(r.customAdded) ? r.customAdded : [],
            test: r.surveyVersion === "test" || r.subject === "TEST" };
        });
        lastLoaded = new Date();
        $("lock").hidden = true; $("app").hidden = false;
        fillFilters(); render();
      });
  }
  $("keyForm").addEventListener("submit", function (e) {
    e.preventDefault(); var k = $("keyInput").value.trim(); if (!k) return;
    $("keyError").hidden = true;
    load(k).then(function () { setKey(k); startAuto(); }).catch(function (err) { $("keyError").textContent = err.message || "Couldn't connect. Check your internet."; $("keyError").hidden = false; });
  });
  $("refreshBtn").addEventListener("click", function () { load(getKey()).catch(showErr); });
  function showErr(err) { $("status").textContent = (err && err.message) || "Couldn't refresh. Check your internet."; }
  function startAuto() { clearInterval(timer); if ($("fAuto").checked) timer = setInterval(function () { if (!document.hidden) load(getKey()).catch(showErr); }, 30000); }
  $("fAuto").addEventListener("change", startAuto);

  // ---------- filters ----------
  function uniq(field) { var s = {}; all.forEach(function (r) { if (!r.test || $("fTest").checked) s[r[field]] = 1; }); return Object.keys(s).sort(); }
  function fillSelect(sel, values, nameFn) {
    var cur = sel.value; sel.innerHTML = "<option value=''>All</option>";
    values.forEach(function (v) { var o = document.createElement("option"); o.value = v; o.textContent = nameFn ? nameFn(v) : v; sel.appendChild(o); });
    if (values.indexOf(cur) >= 0) sel.value = cur;
  }
  function fillFilters() { fillSelect($("fSubject"), uniq("subject")); fillSelect($("fTried"), uniq("triedProject")); fillSelect($("fSource"), uniq("source"), srcName); }
  ["fSubject", "fTried", "fSource", "groupBy", "rankBy"].forEach(function (id) { $(id).addEventListener("change", render); });
  $("fTest").addEventListener("change", function () { fillFilters(); render(); });
  function filtered() {
    var s = $("fSubject").value, t = $("fTried").value, so = $("fSource").value, inc = $("fTest").checked;
    return all.filter(function (r) { return (inc || !r.test) && (!s || r.subject === s) && (!t || r.triedProject === t) && (!so || r.source === so); });
  }
  function filterLabel() {
    var p = [];
    if ($("fSubject").value) p.push($("fSubject").value);
    if ($("fTried").value) p.push("Tried a project: " + $("fTried").value);
    if ($("fSource").value) p.push("Found via " + srcName($("fSource").value));
    return p.length ? p.join(" · ") : "All students";
  }

  // ---------- what to rank by ----------
  var METRICS = {
    score: { name: "Priority score", by: "priority score", cell: "priority score", help: "#1 = 3 points, #2 = 2, #3 = 1; the bar shows it as % of the maximum possible" },
    top1: { name: "Most often #1", by: "how often it was ranked #1", cell: "% who ranked it #1", help: "% of students who ranked it number 1" },
    top3: { name: "Most often in top 3", by: "how often it was in the top 3", cell: "% with it in their top 3", help: "% of students who put it in their top 3" },
    mentioned: { name: "Picked by the most students", by: "how many students picked it", cell: "% who picked it", help: "% of students who moved it into their ranking at any position" },
    avgRank: { name: "Best average position", by: "average position", cell: "average position (#1 = most painful)", help: "average position among students who picked it (lower = more painful)" }
  };
  function metricKey() { var el = document.getElementById("rankBy"); return (el && el.value) || "score"; }
  function mval(s, k) {
    k = k || metricKey();
    if (k === "score") return s.n ? Math.round(s.score / (3 * s.n) * 100) : 0;
    if (k === "top1") return s.top1Pct;
    if (k === "top3") return s.top3Pct;
    if (k === "mentioned") return s.mentionedPct;
    return s.avgRank ? Math.round(100 / s.avgRank) : 0;
  }
  function mlabel(s, k) { k = k || metricKey(); return k === "avgRank" ? (s.avgRank ? "#" + s.avgRank : "–") : k === "score" ? s.score + " pts" : mval(s, k) + "%"; }
  function emptyLabel() { var k = metricKey(); return k === "avgRank" ? "–" : k === "score" ? "0 pts" : "0%"; }
  function sortBy(list, k) {
    k = k || metricKey();
    return list.sort(function (a, b) {
      var d;
      if (k === "avgRank") d = (a.avgRank || 99) - (b.avgRank || 99);
      else if (k === "score") d = b.score - a.score;
      else d = mval(b, k) - mval(a, k);
      return d || b.score - a.score || b.top3 - a.top3 || b.mentioned - a.mentioned || a.pain.localeCompare(b.pain);
    });
  }

  // ---------- maths ----------
  function stats(rows) {
    var m = {}, customSet = {};
    rows.forEach(function (r) { r.custom.forEach(function (c) { customSet[c] = 1; }); });
    rows.forEach(function (r) {
      r.ranking.forEach(function (p, i) {
        var s = m[p] || (m[p] = { pain: p, top1: 0, top3: 0, mentioned: 0, score: 0, rankSum: 0, custom: !!customSet[p] });
        s.mentioned++; s.rankSum += i + 1;
        if (i === 0) s.top1++;
        if (i < 3) { s.top3++; s.score += 3 - i; }
      });
    });
    var n = rows.length;
    return sortBy(Object.keys(m).map(function (k) {
      var s = m[k]; s.n = n; s.top3Pct = pct(s.top3, n); s.top1Pct = pct(s.top1, n); s.mentionedPct = pct(s.mentioned, n);
      s.avgRank = s.mentioned ? +(s.rankSum / s.mentioned).toFixed(1) : null; return s;
    }));
  }
  function groups(rows, field) {
    var g = {}; rows.forEach(function (r) { (g[r[field]] = g[r[field]] || []).push(r); });
    return Object.keys(g).sort(function (a, b) { return g[b].length - g[a].length || a.localeCompare(b); }).map(function (k) { return { key: k, name: field === "source" ? srcName(k) : k, rows: g[k] }; });
  }
  function customCounts(rows) {
    var c = {}; rows.forEach(function (r) { r.custom.forEach(function (x) { var k = x.toLowerCase(); (c[k] = c[k] || { text: x, count: 0, ranked: 0 }).count++; if (r.ranking.indexOf(x) >= 0) c[k].ranked++; }); });
    return Object.keys(c).map(function (k) { return c[k]; }).sort(function (a, b) { return b.count - a.count; });
  }

  // ---------- render ----------
  function barsHTML(list, limit) {
    if (!list.length) {
      var hid = all.filter(function (r) { return r.test; }).length;
      return "<p class='empty-r'>No answers yet for this selection." + (hid && !$("fTest").checked ? " " + hid + " test answer" + (hid > 1 ? "s are" : " is") + " hidden: tick <b>Include test answers</b> to see " + (hid > 1 ? "them" : "it") + "." : "") + "</p>";
    }
    return list.slice(0, limit || list.length).map(function (s) {
      var tipTxt = s.pain + ": score " + s.score + " · " + s.top1Pct + "% ranked #1 · " + s.top3Pct + "% top 3 · picked by " + s.mentionedPct + "%" + (s.avgRank ? " · avg. position #" + s.avgRank : "");
      return "<div class='brow' data-tip='" + esc(tipTxt) + "'><div class='bname'>" + esc(s.pain) + (s.custom ? "<span class='yours'>student-added</span>" : "") +
        "</div><div class='btrack'><div class='bfill' style='width:" + mval(s) + "%'></div></div><div class='bval'>" + mlabel(s) + "</div></div>";
    }).join("");
  }
  function overallTableHTML(list) {
    return "<div class='scrollx'><table class='data'><thead><tr><th>Pain point</th><th>Score</th><th>% #1</th><th>% top 3</th><th>% picked at all</th><th>Avg. position</th></tr></thead><tbody>" +
      list.map(function (s) { return "<tr><td>" + esc(s.pain) + "</td><td>" + s.score + "</td><td>" + s.top1Pct + "%</td><td>" + s.top3Pct + "%</td><td>" + s.mentionedPct + "%</td><td>" + (s.avgRank || "–") + "</td></tr>"; }).join("") +
      "</tbody></table></div>";
  }
  function matrixHTML(rows, field, limit) {
    var gs = groups(rows, field), overall = stats(rows).slice(0, limit || 999);
    if (!gs.length) return "<tbody><tr><td class='empty-r'>No answers yet.</td></tr></tbody>";
    var gstats = gs.map(function (g) { var m = {}; stats(g.rows).forEach(function (s) { m[s.pain] = s; }); return m; });
    var tops = gstats.map(function (m) { var l = sortBy(Object.keys(m).map(function (k) { return m[k]; })); return l[0] && l[0].pain; });
    var h = "<thead><tr><th>Pain point</th>" + gs.map(function (g) {
      return "<th>" + esc(g.name) + "<span class='n" + (g.rows.length < 5 ? " small-n" : "") + "'>n = " + g.rows.length + (g.rows.length < 5 ? " (small)" : "") + "</span></th>";
    }).join("") + "</tr></thead><tbody>";
    overall.forEach(function (o) {
      h += "<tr><td>" + esc(o.pain) + "</td>" + gs.map(function (g, i) {
        var s = gstats[i][o.pain], v = s ? mval(s) : 0, mix = Math.round(v * 0.85);
        var style = "background:color-mix(in srgb, var(--accent-btn) " + mix + "%, var(--surface));" + (mix > 45 ? "color:var(--on-accent)" : "");
        return "<td class='cell" + (tops[i] === o.pain ? " top" : "") + "' style='" + style + "' data-tip='" + esc(g.name + " · " + o.pain + ": " + (s ? s.top3 + " of " + g.rows.length + " in top 3, " + s.top1 + " ranked #1" : "not picked")) + "'>" + (s ? mlabel(s) : emptyLabel()) + "</td>";
      }).join("") + "</tr>";
    });
    return h + "</tbody>";
  }
  function customsHTML(rows) {
    var c = customCounts(rows);
    if (!c.length) return "<p class='empty-r'>No student has added their own pain point yet.</p>";
    return "<ul>" + c.map(function (x) { return "<li>" + esc(x.text) + " <span class='muted small'>(added by " + x.count + ", ranked by " + x.ranked + ")</span></li>"; }).join("") + "</ul>";
  }

  function render() {
    var rows = filtered(), list = stats(rows);
    var testN = all.filter(function (r) { return r.test; }).length;
    $("status").textContent = filterLabel() + " · " + rows.length + " of " + all.length + " answers" + (testN && !$("fTest").checked ? " (" + testN + " test hidden)" : "") +
      (lastLoaded ? " · updated " + stamp(lastLoaded) : "") + ($("fAuto").checked ? " · live" : "");
    $("tN").textContent = rows.length;
    if (list.length) { $("tTop").textContent = list[0].pain; $("tTopSub").textContent = "By " + METRICS[metricKey()].by + " · " + list[0].top3Pct + "% have it in their top 3 · " + list[0].top1Pct + "% ranked it #1"; }
    else { $("tTop").textContent = "–"; $("tTopSub").textContent = "Waiting for answers"; }
    $("tAvg").textContent = rows.length ? (rows.reduce(function (a, r) { return a + r.ranking.length; }, 0) / rows.length).toFixed(1) : "–";
    $("rankHelp").textContent = "Ranked by " + METRICS[metricKey()].by + ": " + METRICS[metricKey()].help + ".";
    $("matrixHelp").textContent = "Each cell = " + METRICS[metricKey()].cell + " within that group. Darker = more painful. Outlined = that group's #1. Groups under 5 students are marked small, so treat them with care.";
    $("bars").innerHTML = barsHTML(list);
    $("overallTable").innerHTML = list.length ? overallTableHTML(list) : "";
    $("matrix").innerHTML = matrixHTML(rows, $("groupBy").value);
    $("customs").innerHTML = customsHTML(rows);
  }

  // Hover tooltips (bars and matrix cells)
  var tip = $("tip");
  document.addEventListener("pointermove", function (e) {
    var t = e.target.closest && e.target.closest("[data-tip]");
    if (!t) { tip.hidden = true; return; }
    tip.textContent = t.getAttribute("data-tip"); tip.hidden = false;
    var x = Math.min(e.clientX + 14, window.innerWidth - tip.offsetWidth - 8), y = e.clientY + 16;
    if (y + tip.offsetHeight > window.innerHeight - 8) y = e.clientY - tip.offsetHeight - 10;
    tip.style.left = x + "px"; tip.style.top = y + "px";
  });

  // ---------- exports ----------
  function fileStamp() { var d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  $("xlsxBtn").addEventListener("click", function () {
    if (!window.XLSX) { alert("The Excel tool didn't load. Check your internet and try again."); return; }
    var rows = filtered(), wb = XLSX.utils.book_new();
    var info = [["Student pain point survey"], ["Exported", new Date().toLocaleString("en-GB")], ["Selection", filterLabel()], ["Ranked by", METRICS[metricKey()].name + " (" + METRICS[metricKey()].help + ")"], ["Responses", rows.length], [],
      ["Score: #1 = 3 points, #2 = 2, #3 = 1. % top 3 = share of students in the selection who ranked it 1st, 2nd or 3rd."]];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(info), "About");
    var ov = [["Pain point", "Score", "% ranked #1", "% top 3", "% picked at all", "Avg. position", "# ranked #1", "# top 3", "# picked", "Student-added"]];
    stats(rows).forEach(function (s) { ov.push([s.pain, s.score, s.top1Pct / 100, s.top3Pct / 100, s.mentionedPct / 100, s.avgRank, s.top1, s.top3, s.mentioned, s.custom ? "Yes" : ""]); });
    var ws = XLSX.utils.aoa_to_sheet(ov); pctFormat(ws, [2, 3, 4], ov.length); ws["!cols"] = [{ wch: 40 }];
    XLSX.utils.book_append_sheet(wb, ws, "Overall");
    ["subject", "triedProject", "source"].forEach(function (f) {
      var gs = groups(rows, f), list = stats(rows);
      var aoa = [["% in top 3, by " + GROUP_NAMES[f]].concat(gs.map(function (g) { return g.name; })), ["Students (n)"].concat(gs.map(function (g) { return g.rows.length; }))];
      var gm = gs.map(function (g) { var m = {}; stats(g.rows).forEach(function (s) { m[s.pain] = s; }); return m; });
      list.forEach(function (o) { aoa.push([o.pain].concat(gm.map(function (m) { return m[o.pain] ? m[o.pain].top3Pct / 100 : 0; }))); });
      var w = XLSX.utils.aoa_to_sheet(aoa); w["!cols"] = [{ wch: 40 }];
      for (var r = 2; r < aoa.length; r++) for (var c = 1; c <= gs.length; c++) { var a = XLSX.utils.encode_cell({ r: r, c: c }); if (w[a]) w[a].z = "0%"; }
      XLSX.utils.book_append_sheet(wb, w, ("By " + GROUP_NAMES[f]).slice(0, 31));
    });
    var maxR = rows.reduce(function (a, r) { return Math.max(a, r.ranking.length); }, 0);
    var raw = [["Received", "Subject area", "Tried a project", "Found via", "Pains ranked"].concat(Array.from({ length: maxR }, function (_, i) { return "#" + (i + 1); })).concat(["Added themselves"])];
    rows.forEach(function (r) { raw.push([r.received, r.subject, r.triedProject, srcName(r.source), r.ranking.length].concat(Array.from({ length: maxR }, function (_, i) { return r.ranking[i] || ""; })).concat([r.custom.join("; ")])); });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(raw, { cellDates: true }), "All answers");
    XLSX.writeFile(wb, "student-pain-points-" + fileStamp() + ".xlsx");
  });
  function pctFormat(ws, cols, nRows) { for (var r = 1; r < nRows; r++) cols.forEach(function (c) { var a = XLSX.utils.encode_cell({ r: r, c: c }); if (ws[a]) ws[a].z = "0%"; }); }

  $("docBtn").addEventListener("click", function () {
    var rows = filtered(), list = stats(rows);
    var css = "body{font-family:Calibri,Arial,sans-serif;color:#2a1e14}h1{color:#93432c}h2{color:#93432c;margin-top:24pt}table{border-collapse:collapse;width:100%}th,td{border:1px solid #d8cbb8;padding:4pt 6pt;font-size:10.5pt;text-align:left}th{background:#f3ecdf}.bar{background:#a8462c;height:9pt}";
    var h = "<h1>What gets in the way when students work on ideas or projects?</h1><p><b>Selection:</b> " + esc(filterLabel()) + "<br><b>Ranked by:</b> " + esc(METRICS[metricKey()].name) + " (" + esc(METRICS[metricKey()].help) + ")<br><b>Responses:</b> " + rows.length + "<br><b>Exported:</b> " + esc(new Date().toLocaleString("en-GB")) + "</p>";
    if (list.length) h += "<p><b>Headline:</b> the biggest pain is <b>" + esc(list[0].pain) + "</b>. " + list[0].top3Pct + "% of students put it in their top 3 and " + list[0].top1Pct + "% ranked it first.</p>";
    h += "<h2>Pain points, ranked</h2><p>Score: #1 = 3 points, #2 = 2, #3 = 1.</p><table><tr><th>#</th><th>Pain point</th><th>% top 3</th><th style='width:30%'></th><th>% ranked #1</th><th>Score</th></tr>" +
      list.map(function (s, i) { return "<tr><td>" + (i + 1) + "</td><td>" + esc(s.pain) + "</td><td>" + s.top3Pct + "%</td><td><div class='bar' style='width:" + Math.max(s.top3Pct, 1) + "%'></div></td><td>" + s.top1Pct + "%</td><td>" + s.score + "</td></tr>"; }).join("") + "</table>";
    ["subject", "triedProject"].forEach(function (f) {
      var gs = groups(rows, f); if (!gs.length) return;
      h += "<h2>By " + GROUP_NAMES[f].toLowerCase() + "</h2><p>Top 3 pains in each group (% of that group who put it in their top 3).</p><table><tr><th>Group</th><th>Students</th><th>1st</th><th>2nd</th><th>3rd</th></tr>";
      gs.forEach(function (g) { var t = stats(g.rows).slice(0, 3); h += "<tr><td>" + esc(g.name) + "</td><td>" + g.rows.length + (g.rows.length < 5 ? " (small)" : "") + "</td>" + [0, 1, 2].map(function (i) { return "<td>" + (t[i] ? esc(t[i].pain) + " (" + t[i].top3Pct + "%)" : "–") + "</td>"; }).join("") + "</tr>"; });
      h += "</table>";
    });
    var c = customCounts(rows);
    if (c.length) h += "<h2>Pains students added themselves</h2><ul>" + c.map(function (x) { return "<li>" + esc(x.text) + " (added by " + x.count + ")</li>"; }).join("") + "</ul>";
    var doc = "<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>Survey results</title><style>" + css + "</style></head><body>" + h + "</body></html>";
    var blob = new Blob(["﻿", doc], { type: "application/msword" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "student-pain-points-" + fileStamp() + ".doc";
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  });

  // ---------- presentation ----------
  var slides = [], si = 0;
  function buildSlides() {
    var rows = filtered(), list = stats(rows), sel = filterLabel();
    slides = [];
    slides.push("<p class='lead'>Student pain point survey · " + esc(sel) + "</p><h1>What gets in the way when students work on ideas or projects?</h1><div class='big'>" + rows.length + "</div><p class='lead'>students answered</p>");
    if (list.length) slides.push("<p class='lead'>The biggest pain</p><h1>" + esc(list[0].pain) + "</h1><div class='big'>" + list[0].top3Pct + "%</div><p class='lead'>put it in their top 3, and " + list[0].top1Pct + "% ranked it first</p>");
    slides.push("<h1>Top pain points</h1><p class='lead'>Ranked by " + esc(METRICS[metricKey()].by) + "</p><div class='bars'>" + barsHTML(list, 8) + "</div>");
    ["subject", "triedProject"].forEach(function (f) {
      if (groups(rows, f).length > 1) slides.push("<h1>By " + GROUP_NAMES[f].toLowerCase() + "</h1><p class='lead'>Each cell = " + esc(METRICS[metricKey()].cell) + " within each group. Outlined = that group's #1.</p><div class='scrollx'><table class='matrix'>" + matrixHTML(rows, f, 8) + "</table></div>");
    });
    var c = customCounts(rows);
    if (c.length) slides.push("<h1>In their own words</h1><p class='lead'>Pains students added themselves</p><ul class='lead'>" + c.slice(0, 8).map(function (x) { return "<li>" + esc(x.text) + "</li>"; }).join("") + "</ul>");
  }
  function showSlide() { $("slide").innerHTML = slides[si]; $("slideNo").textContent = (si + 1) + " / " + slides.length; $("prevS").disabled = si === 0; $("nextS").disabled = si === slides.length - 1; }
  function step(d) { si = Math.max(0, Math.min(slides.length - 1, si + d)); showSlide(); }
  $("presentBtn").addEventListener("click", function () {
    buildSlides(); si = 0; $("deck").hidden = false; showSlide(); $("nextS").focus();
    if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(function () {});
  });
  function closeDeck() { $("deck").hidden = true; if (document.fullscreenElement) document.exitFullscreen().catch(function () {}); $("presentBtn").focus(); }
  $("prevS").addEventListener("click", function () { step(-1); });
  $("nextS").addEventListener("click", function () { step(1); });
  $("closeS").addEventListener("click", closeDeck);
  $("slide").addEventListener("click", function () { step(1); });
  document.addEventListener("keydown", function (e) {
    if ($("deck").hidden) return;
    if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") { e.preventDefault(); step(1); }
    else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); step(-1); }
    else if (e.key === "Escape") closeDeck();
  });

  // ---------- start ----------
  var saved = getKey();
  if (saved) load(saved).then(startAuto).catch(function (err) { $("keyError").textContent = err.message || "Couldn't connect."; $("keyError").hidden = false; });
})();
