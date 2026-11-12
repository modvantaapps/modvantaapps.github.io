(function () {
  "use strict";

  // --- app search (/odoo-apps/) and in-page filter (category pages) ---
  function norm(s) { return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); }

  function card(app) {
    var a = document.createElement("a");
    a.className = "card app-card";
    a.href = app.u;
    var thumb = document.createElement("div");
    thumb.className = "thumb";
    var img = document.createElement("img");
    img.src = app.i; img.alt = ""; img.loading = "lazy"; img.width = 400; img.height = 268;
    thumb.appendChild(img);
    var body = document.createElement("div");
    body.className = "body";
    var h = document.createElement("h3"); h.textContent = app.n;
    var p = document.createElement("p"); p.textContent = app.t;
    var c = document.createElement("span"); c.className = "chip"; c.textContent = app.g;
    body.appendChild(h); body.appendChild(p); body.appendChild(c);
    a.appendChild(thumb); a.appendChild(body);
    return a;
  }

  var search = document.getElementById("app-search");
  if (search) {
    var out = document.getElementById("search-results");
    var status = document.getElementById("search-status");
    var data = null, timer = null;
    var load = function () {
      if (data) return Promise.resolve(data);
      return fetch("/data/search.json", { credentials: "same-origin" })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          data = j.map(function (x) { x._k = norm(x.n + " " + x.t + " " + x.g + " " + x.k); return x; });
          return data;
        });
    };
    var run = function () {
      var q = norm(search.value.trim());
      while (out.firstChild) out.removeChild(out.firstChild);
      if (q.length < 2) { status.textContent = ""; return; }
      load().then(function (all) {
        var words = q.split(/\s+/);
        var hits = all.filter(function (x) { return words.every(function (w) { return x._k.indexOf(w) !== -1; }); });
        status.textContent = hits.length + (hits.length === 1 ? " app found" : " apps found");
        var grid = document.createElement("div");
        grid.className = "grid";
        hits.slice(0, 60).forEach(function (x) { grid.appendChild(card(x)); });
        out.appendChild(grid);
      }).catch(function () { status.textContent = "Search is unavailable right now. Browse the categories below."; });
    };
    search.addEventListener("input", function () { clearTimeout(timer); timer = setTimeout(run, 120); });
    search.addEventListener("focus", function () { load().catch(function () {}); }, { once: true });
    var qs = new URLSearchParams(location.search).get("q");
    if (qs) { search.value = qs.slice(0, 80); run(); }
  }

  var filter = document.getElementById("app-filter");
  if (filter) {
    var cards = Array.prototype.slice.call(document.querySelectorAll("[data-k]"));
    var fstatus = document.getElementById("filter-status");
    filter.addEventListener("input", function () {
      var words = norm(filter.value.trim()).split(/\s+/).filter(Boolean);
      var shown = 0;
      cards.forEach(function (c) {
        var k = c.getAttribute("data-k");
        var ok = words.every(function (w) { return k.indexOf(w) !== -1; });
        c.hidden = !ok; if (ok) shown++;
      });
      fstatus.textContent = words.length ? shown + " shown" : "";
    });
  }

  // --- newsletter: opens the visitor's mail app with a subscribe request ---
  var news = document.getElementById("news-form");
  if (news) {
    news.addEventListener("submit", function (e) {
      e.preventDefault();
      var em = news.querySelector("[name=email]").value.trim().slice(0, 160);
      location.href = "mailto:" + news.getAttribute("data-to") + "?subject=" + encodeURIComponent("Newsletter subscription") +
        "&body=" + encodeURIComponent("Please add me to the Modvanta newsletter: " + em);
    });
  }

  // --- contact form: opens the visitor's mail app, nothing is sent to a server ---
  var form = document.getElementById("contact-form");
  if (form) {
    var params = new URLSearchParams(location.search);
    var sol = params.get("solution");
    if (sol) {
      var sel = form.querySelector("[name=topic]");
      if (sel) Array.prototype.forEach.call(sel.options, function (o) { if (o.text === sol) sel.value = o.text; });
    }
    var pre = params.get("app");
    if (pre) {
      var t = form.querySelector("[name=topic]");
      var m = form.querySelector("[name=message]");
      if (m && !m.value) m.value = "About the app: " + pre.slice(0, 120) + "\n\n";
      if (t) t.value = "Customise an existing app";
    }
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var f = function (n) { var el = form.querySelector("[name=" + n + "]"); return el ? el.value.trim().slice(0, 4000) : ""; };
      var subject = (f("topic") || "Project enquiry") + (f("company") ? " - " + f("company") : "");
      var body = [
        "Name: " + f("name"), "Company: " + f("company"), "Email: " + f("email"),
        "Phone: " + f("phone"), "Odoo version: " + f("version"),
        "Users: " + f("users"), "Start: " + f("timeline"), "", f("message")
      ].join("\n");
      location.href = "mailto:" + form.getAttribute("data-to") +
        "?subject=" + encodeURIComponent(subject.slice(0, 180)) + "&body=" + encodeURIComponent(body);
    });
  }
})();
