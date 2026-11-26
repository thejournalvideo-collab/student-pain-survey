(function () {
  "use strict";
  var CFG = window.SURVEY_CONFIG || {};
  var $ = function (id) { return document.getElementById(id); };
  var KEY_STORE = "psr-read-key";
  var MAX_POINTS = 14;
  var all = [], timer = null, lastLoaded = null;

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function getKey() { try { return localStorage.getItem(KEY_STORE) || ""; } catch (_) { return ""; } }
  function setKey(k) { try { localStorage.setItem(KEY_STORE, k); } catch (_) {} }
  function stamp(d) { return d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); }
  function fileStamp() { var d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }

  // ---------- load ----------
  function load(key) {
    $("status").textContent = "Loading…";
    return fetch(CFG.endpoint + "?key=" + encodeURIComponent(key) + "&t=" + Date.now())
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j.ok) throw new Error(j.error === "forbidden" ? "That key isn't right. Check Script properties > READ_KEY." : "The sheet couldn't be read.");
        all = (j.rows || []).filter(function (r) { return r.surveyVersion !== "test" && r.subject !== "TEST"; }).map(function (r) {
          return { received: new Date(r.received), course: r.subject || "Not given", sex: r.sex || "Not recorded", ranking: Array.isArray(r.ranking) ? r.ranking : [] };
        });
        lastLoaded = new Date();
        $("lock").hidden = true; $("app").hidden = false;
        render();
      });
  }
  $("keyForm").addEventListener("submit", function (e) {
    e.preventDefault(); var k = $("keyInput").value.trim(); if (!k) return;
    $("keyError").hidden = true;
    load(k).then(function () { setKey(k); startAuto(); }).catch(function (err) { $("keyError").textContent = err.message || "Couldn't connect. Check your internet."; $("keyError").hidden = false; });
  });
  $("refreshBtn").addEventListener("click", function () { load(getKey()).catch(showErr); });
  function showErr(err) { $("status").textContent = (err && err.message) || "Couldn't refresh. Check your internet."; }
  function startAuto() { clearInterval(timer); timer = setInterval(function () { if (!document.hidden && $("deck").hidden) load(getKey()).catch(showErr); }, 30000); }

  // ---------- ranking ----------
  // Points: #1 = 14, #2 = 13 ... not picked = 0. Returns pains sorted by points, with tied ranks (1, 2, 2, 4).
  function rankList(rows) {
    var m = {};
    rows.forEach(function (r) {
      r.ranking.forEach(function (p, i) {
        var s = m[p] || (m[p] = { pain: p, points: 0, picked: 0, first: 0 });
        s.points += Math.max(MAX_POINTS - i, 1); s.picked++; if (i === 0) s.first++;
      });
    });
    var list = Object.keys(m).map(function (k) { return m[k]; })
      .sort(function (a, b) { return b.points - a.points || b.first - a.first || a.pain.localeCompare(b.pain); });
    list.forEach(function (s, i) { s.rank = i > 0 && s.points === list[i - 1].points ? list[i - 1].rank : i + 1; });
    return list;
  }
  function courses(rows, field) {
    field = field || "course";
    var g = {}; rows.forEach(function (r) { (g[r[field]] = g[r[field]] || []).push(r); });
    return Object.keys(g).sort(function (a, b) { return g[b].length - g[a].length || a.localeCompare(b); })
      .map(function (k) { var list = rankList(g[k]), byPain = {}; list.forEach(function (s) { byPain[s.pain] = s; }); return { name: k, n: g[k].length, list: list, byPain: byPain }; });
  }

  // ---------- tables (used on the page, in Word and in slides) ----------
  function overallHTML(list, limit) {
    if (!list.length) return "<tbody><tr><td class='empty-r'>No answers yet.</td></tr></tbody>";
    var max = list[0].points || 1;
    return "<thead><tr><th>Rank</th><th>Pain point</th><th class='barcell'></th><th>Points</th><th>Students who picked it</th></tr></thead><tbody>" +
      list.slice(0, limit || list.length).map(function (s) {
        return "<tr><td class='rank'>" + s.rank + "</td><td class='pain'>" + esc(s.pain) + "</td><td class='barcell'><div class='bar' style='width:" + Math.round(s.points / max * 100) + "%'></div></td><td class='pts'>" + s.points + "</td><td>" + s.picked + "</td></tr>";
      }).join("") + "</tbody>";
  }
  function courseHTML(cs, limit, label) {
    if (!cs.length) return "<tbody><tr><td class='empty-r'>No answers yet.</td></tr></tbody>";
    var total = cs.reduce(function (a, c) { return a + c.n; }, 0), max = cs[0].n || 1;
    cs.forEach(function (c, i) { c.rank = i > 0 && c.n === cs[i - 1].n ? cs[i - 1].rank : i + 1; });
    return "<thead><tr><th>Rank</th><th>" + (label || "Course of study") + "</th><th class='barcell'></th><th>Students</th><th>% of all</th></tr></thead><tbody>" +
      cs.slice(0, limit || cs.length).map(function (c) {
        return "<tr><td class='rank'>" + c.rank + "</td><td class='pain'>" + esc(c.name) + "</td><td class='barcell'><div class='bar' style='width:" + Math.round(c.n / max * 100) + "%'></div></td><td class='pts'>" + c.n + "</td><td>" + Math.round(c.n / total * 100) + "%</td></tr>";
      }).join("") + "</tbody>";
  }
  function gridHTML(list, cs, limit) {
    if (!list.length) return "<tbody><tr><td class='empty-r'>No answers yet.</td></tr></tbody>";
    return "<thead><tr><th>All courses</th><th>Pain point</th>" + cs.map(function (c) { return "<th class='course'>" + esc(c.name) + "<span class='n'>" + c.n + " student" + (c.n === 1 ? "" : "s") + "</span></th>"; }).join("") + "</tr></thead><tbody>" +
      list.slice(0, limit || list.length).map(function (s) {
        return "<tr><td class='rank'>" + s.rank + "</td><td class='pain'>" + esc(s.pain) + "</td>" + cs.map(function (c) {
          var x = c.byPain[s.pain];
          return x ? "<td class='pos" + (x.rank <= 3 ? " top" : "") + "'>" + x.rank + "</td>" : "<td class='pos none'>–</td>";
        }).join("") + "</tr>";
      }).join("") + "</tbody>";
  }

  function render() {
    var list = rankList(all), cs = courses(all);
    $("status").textContent = all.length + " answer" + (all.length === 1 ? "" : "s") + " from " + cs.length + " course" + (cs.length === 1 ? "" : "s") +
      (lastLoaded ? " · updated " + stamp(lastLoaded) + " · refreshes every 30 s" : "");
    $("overall").innerHTML = overallHTML(list);
    $("byCourse").innerHTML = courseHTML(cs);
    $("bySex").innerHTML = courseHTML(courses(all, "sex"), 0, "Sex");
  }

  // ---------- Excel ----------
  $("xlsxBtn").addEventListener("click", function () {
    if (!window.XLSX) { $("status").textContent = "The Excel tool didn't load. Check your internet and try again."; return; }
    var list = rankList(all), cs = courses(all), wb = XLSX.utils.book_new();
    var a = [["Rank", "Pain point", "Points", "Students who picked it"]];
    list.forEach(function (s) { a.push([s.rank, s.pain, s.points, s.picked]); });
    var w1 = XLSX.utils.aoa_to_sheet(a); w1["!cols"] = [{ wch: 6 }, { wch: 40 }, { wch: 8 }, { wch: 22 }];
    XLSX.utils.book_append_sheet(wb, w1, "Pain point ranking");
    var total = cs.reduce(function (t, x) { return t + x.n; }, 0), cr = [["Rank", "Course of study", "Students", "% of all"]];
    cs.forEach(function (x, i) { var r = i > 0 && x.n === cs[i - 1].n ? cr[cr.length - 1][0] : i + 1; cr.push([r, x.name, x.n, total ? x.n / total : 0]); });
    var wc = XLSX.utils.aoa_to_sheet(cr); wc["!cols"] = [{ wch: 6 }, { wch: 34 }, { wch: 10 }, { wch: 10 }];
    for (var q = 1; q < cr.length; q++) { var ad = XLSX.utils.encode_cell({ r: q, c: 3 }); if (wc[ad]) wc[ad].z = "0%"; }
    XLSX.utils.book_append_sheet(wb, wc, "Course of study ranking");
    var sx = courses(all, "sex"), sr = [["Rank", "Sex", "Students", "% of all"]];
    sx.forEach(function (x, i) { var r = i > 0 && x.n === sx[i - 1].n ? sr[sr.length - 1][0] : i + 1; sr.push([r, x.name, x.n, total ? x.n / total : 0]); });
    var wsx = XLSX.utils.aoa_to_sheet(sr); wsx["!cols"] = [{ wch: 6 }, { wch: 20 }, { wch: 10 }, { wch: 10 }];
    for (var q2 = 1; q2 < sr.length; q2++) { var ad2 = XLSX.utils.encode_cell({ r: q2, c: 3 }); if (wsx[ad2]) wsx[ad2].z = "0%"; }
    XLSX.utils.book_append_sheet(wb, wsx, "Sex ranking");

    var b = [["All courses rank", "Pain point"].concat(cs.map(function (c) { return c.name; })), ["", "Students"].concat(cs.map(function (c) { return c.n; }))];
    list.forEach(function (s) { b.push([s.rank, s.pain].concat(cs.map(function (c) { return c.byPain[s.pain] ? c.byPain[s.pain].rank : "–"; }))); });
    var w2 = XLSX.utils.aoa_to_sheet(b); w2["!cols"] = [{ wch: 16 }, { wch: 40 }].concat(cs.map(function () { return { wch: 18 }; }));
    XLSX.utils.book_append_sheet(wb, w2, "Rank by course of study");

    var c = [["Pain point"].concat(cs.map(function (x) { return x.name; })).concat(["All courses"])];
    list.forEach(function (s) { c.push([s.pain].concat(cs.map(function (x) { return x.byPain[s.pain] ? x.byPain[s.pain].points : 0; })).concat([s.points])); });
    var w3 = XLSX.utils.aoa_to_sheet(c); w3["!cols"] = [{ wch: 40 }];
    XLSX.utils.book_append_sheet(wb, w3, "Points by course of study");

    var maxR = all.reduce(function (m, r) { return Math.max(m, r.ranking.length); }, 0);
    var d = [["Received", "Course of study", "Sex"].concat(Array.from({ length: maxR }, function (_, i) { return "#" + (i + 1); }))];
    all.forEach(function (r) { d.push([r.received, r.course, r.sex].concat(Array.from({ length: maxR }, function (_, i) { return r.ranking[i] || ""; }))); });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(d, { cellDates: true }), "All answers");

    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Student pain point survey"], ["Exported", new Date().toLocaleString("en-GB")], ["Answers", all.length],
      ["Points", "#1 = 14, #2 = 13 ... #14 = 1, not picked = 0. Pains are ranked by total points."]]), "About");
    XLSX.writeFile(wb, "course-pain-point-ranking-" + fileStamp() + ".xlsx");
  });

  // ---------- Word ----------
  $("docBtn").addEventListener("click", function () {
    var list = rankList(all), cs = courses(all);
    var css = "body{font-family:Calibri,Arial,sans-serif;color:#2a1e14}h1,h2{color:#93432c}table{border-collapse:collapse;width:100%;margin-bottom:12pt}th,td{border:1px solid #d8cbb8;padding:4pt 6pt;font-size:10.5pt;text-align:left}th{background:#f3ecdf}td.top{background:#a8462c;color:#fff;font-weight:bold}.bar{background:#a8462c;height:9pt}.barcell{width:30%}";
    var h = "<h1>Course of study and pain point ranking</h1><p><b>Answers:</b> " + all.length + " from " + cs.length + " course" + (cs.length === 1 ? "" : "s") + "<br><b>Exported:</b> " + esc(new Date().toLocaleString("en-GB")) +
      "<br><b>Points:</b> #1 = 14, #2 = 13 … #14 = 1, not picked = 0. Pains are ranked by total points.</p>";
    h += "<h2>Pain point ranking</h2><table>" + overallHTML(list) + "</table>";
    h += "<h2>Course of study ranking</h2><p>Courses ranked by number of students who answered.</p><table>" + courseHTML(cs) + "</table>";
    h += "<h2>Sex ranking</h2><p>Ranked by number of students who answered.</p><table>" + courseHTML(courses(all, "sex"), 0, "Sex") + "</table>";
    var doc = "<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>Survey results</title><style>" + css + "</style></head><body>" + h + "</body></html>";
    var blob = new Blob(["﻿", doc], { type: "application/msword" });
    var link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = "course-pain-point-ranking-" + fileStamp() + ".doc";
    document.body.appendChild(link); link.click(); setTimeout(function () { URL.revokeObjectURL(link.href); link.remove(); }, 1000);
  });

  // ---------- Present ----------
  var slides = [], si = 0;
  function buildSlides() {
    var list = rankList(all), cs = courses(all);
    slides = ["<p class='lead'>Student pain point survey</p><h1>Course of study and pain point ranking</h1><div class='big'>" + all.length + "</div><p class='lead'>students from " + cs.length + " course" + (cs.length === 1 ? "" : "s") + "</p>"];
    slides.push("<h1>Pain point ranking</h1><table class='data'>" + overallHTML(list, 10) + "</table>");
    slides.push("<h1>Course of study ranking</h1><p class='lead'>Courses ranked by number of students who answered</p><table class='data'>" + courseHTML(cs, 12) + "</table>");
    slides.push("<h1>Sex ranking</h1><p class='lead'>Ranked by number of students who answered</p><table class='data'>" + courseHTML(courses(all, "sex"), 0, "Sex") + "</table>");
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
