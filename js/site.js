(function () {
  "use strict";

  // --- app search (/odoo-apps/) and in-page filter (category pages) ---
  // --- anonymous page-view count (no cookies; nothing stored about the visitor on our side) ---
  var STATS_URL = "https://forms.179-197-253-51.sslip.io/hit";
  var firstSource = (function () {
    var qs = new URLSearchParams(location.search), ref = "";
    try { ref = document.referrer ? new URL(document.referrer).hostname.toLowerCase() : ""; } catch (e) { ref = ""; }
    var src = (qs.get("utm_source") || "").slice(0, 40), camp = (qs.get("utm_campaign") || "").slice(0, 80);
    var here = src ? src + (camp ? "/" + camp : "") : (ref && ref.indexOf("modvantaapps.tech") === -1 ? ref : "");
    try {
      if (here && !sessionStorage.getItem("mdv_src")) sessionStorage.setItem("mdv_src", here.slice(0, 160));
      return sessionStorage.getItem("mdv_src") || "";
    } catch (e) { return here; }
  })();
  (function () {
    if (navigator.doNotTrack === "1" || !navigator.sendBeacon || location.hostname !== "modvantaapps.tech") return;
    var qs = new URLSearchParams(location.search), ref = "";
    try { ref = document.referrer ? new URL(document.referrer).hostname.toLowerCase() : ""; } catch (e) { ref = ""; }
    var clean = function (v, re, n) { v = (v || "").slice(0, n); return re.test(v) ? v : ""; };
    var body = new URLSearchParams();
    body.set("p", clean(location.pathname, /^\/[A-Za-z0-9\/_.%-]*$/, 200) || "/");
    var r = clean(ref, /^[a-z0-9.-]*$/, 100); if (r) body.set("r", r);
    var s = clean(qs.get("utm_source"), /^[A-Za-z0-9_.-]*$/, 40); if (s) body.set("s", s);
    var c = clean(qs.get("utm_campaign"), /^[A-Za-z0-9_.-]*$/, 80); if (c) body.set("c", c);
    body.set("d", window.matchMedia && window.matchMedia("(max-width: 760px)").matches ? "m" : "d");
    try { navigator.sendBeacon(STATS_URL, new Blob([body.toString()], { type: "application/x-www-form-urlencoded" })); } catch (e) {}
  })();

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
    var categorySelect = document.getElementById("app-category");
    var catalogCards = Array.prototype.slice.call(document.querySelectorAll(".catalog-app"));
    var data = null, timer = null;
    var filterCatalog = function () {
      var q = norm(search.value.trim()), words = q.split(/\s+/).filter(Boolean);
      var group = categorySelect ? categorySelect.value : "";
      catalogCards.forEach(function (c) {
        var k = norm(c.getAttribute("data-k"));
        c.hidden = !words.every(function (w) { return k.indexOf(w) !== -1; }) || (!!group && c.getAttribute("data-group") !== group);
      });
    };
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
      filterCatalog();
      var selectedGroup = categorySelect && categorySelect.value ? norm(categorySelect.options[categorySelect.selectedIndex].textContent) : "";
      if (q.length < 2 && !selectedGroup) { status.textContent = ""; return; }
      load().then(function (all) {
        var words = q.split(/\s+/);
        var hits = all.filter(function (x) { return words.every(function (w) { return x._k.indexOf(w) !== -1; }) && (!selectedGroup || norm(x.g) === selectedGroup); });
        status.textContent = hits.length + (hits.length === 1 ? " app found" : " apps found");
        var grid = document.createElement("div");
        grid.className = "grid";
        hits.slice(0, 60).forEach(function (x) { grid.appendChild(card(x)); });
        out.appendChild(grid);
      }).catch(function () { status.textContent = "Search is unavailable right now. Browse the categories below."; });
    };
    search.addEventListener("input", function () { clearTimeout(timer); timer = setTimeout(run, 120); });
    if (categorySelect) categorySelect.addEventListener("change", run);
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


  // --- Magento / Shopify catalogue: search + category chips ---
  var extSearch = document.getElementById("ext-search");
  if (extSearch) {
    var extCards = Array.prototype.slice.call(document.querySelectorAll(".ext-card"));
    var extBtns = Array.prototype.slice.call(document.querySelectorAll("[data-ext-group]"));
    var extStatus = document.getElementById("ext-status");
    var extGroup = "";
    var extRun = function () {
      var words = norm(extSearch.value.trim()).split(/\s+/).filter(Boolean), shown = 0;
      extCards.forEach(function (c) {
        if (!c._k) c._k = norm(c.textContent);
        var k = c._k;
        var ok = words.every(function (w) { return k.indexOf(w) !== -1; }) && (!extGroup || c.getAttribute("data-group") === extGroup);
        c.hidden = !ok; if (ok) shown++;
      });
      extStatus.textContent = shown ? "Showing " + shown + " of " + extCards.length + "." :
        "Nothing matches. Try another word, or request a quote for a custom build.";
    };
    extBtns.forEach(function (b) {
      b.addEventListener("click", function () {
        extGroup = b.getAttribute("data-ext-group");
        extBtns.forEach(function (x) { x.classList.toggle("on", x === b); x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
        extRun();
      });
    });
    var extTimer = null;
    extSearch.addEventListener("input", function () { clearTimeout(extTimer); extTimer = setTimeout(extRun, 100); });
  }

  // --- short "ask about this app" forms: same receiver, mailto fallback ---
  Array.prototype.forEach.call(document.querySelectorAll("form[data-mini]"), function (mf) {
    var shown = Date.now(), st = mf.querySelector(".form-status"), b = mf.querySelector("button[type=submit]");
    mf.addEventListener("submit", function (ev) {
      ev.preventDefault();
      if (!mf.reportValidity()) return;
      var data = new URLSearchParams(new FormData(mf));
      data.set("form", mf.getAttribute("data-mini"));
      data.set("topic", (mf.getAttribute("data-topic") || "").slice(0, 110));
      data.set("elapsed", String(Date.now() - shown));
      data.set("page", location.pathname.slice(0, 200));
      if (firstSource) data.set("source", firstSource);
      if (b) b.disabled = true;
      st.textContent = "Sending...";
      fetch(mf.getAttribute("data-endpoint"), { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: data.toString() })
        .then(function (r) { return r.json().then(function (j) { if (!r.ok || !j.ok) throw j; }); })
        .then(function () {
          var ok = document.createElement("p"); ok.className = "mini-done";
          ok.textContent = "Thanks, your question has been sent. We'll reply by email within one working day.";
          mf.replaceWith(ok);
        })
        .catch(function () {
          if (b) b.disabled = false;
          var f = function (n) { var e = mf.querySelector("[name=" + n + "]"); return e ? e.value.trim() : ""; };
          var href = "mailto:" + mf.getAttribute("data-to") + "?subject=" + encodeURIComponent((mf.getAttribute("data-topic") || "Question").slice(0, 150)) +
            "&body=" + encodeURIComponent(("Name: " + f("name") + "\nEmail: " + f("email") + "\n\n" + f("message")).slice(0, 1800));
          st.textContent = "That didn't go through. Please try again, or ";
          var a = document.createElement("a"); a.href = href; a.textContent = "send it by email"; st.appendChild(a);
          st.appendChild(document.createTextNode("."));
        });
    });
  });

  // --- contact / quote form: posted to the mdv_forms receiver, mailto as fallback ---
  var form = document.getElementById("contact-form");
  if (form) {
    var params = new URLSearchParams(location.search);
    var sol = params.get("solution");
    if (sol) {
      var sel = form.querySelector("[name=topic]");
      if (sel) Array.prototype.forEach.call(sel.options, function (o) { if (o.text === sol) sel.value = o.text; });
    }
    var prj = params.get("project");
    if (prj) {
      var pm = form.querySelector("[name=message]");
      if (pm && !pm.value) pm.value = "About your AI project: " + prj.slice(0, 120) + "\n\n";
    }
    var item = (params.get("item") || "").slice(0, 120), plat = (params.get("platform") || "").slice(0, 40);
    if (item && /^(Magento 2|Shopify)$/.test(plat)) {
      var price = (params.get("price") || "").slice(0, 60);
      var pick = document.getElementById("quote-pick");
      if (pick) {
        document.getElementById("quote-pick-platform").textContent = plat + (plat === "Shopify" ? " app" : " extension");
        document.getElementById("quote-pick-name").textContent = item;
        document.getElementById("quote-pick-price").textContent = price;
        document.getElementById("quote-pick-change").href = plat === "Shopify" ? "/shopify-apps/" : "/magento-extensions/";
        pick.hidden = false;
      }
      var tp = form.querySelector("[name=topic]"), vs = form.querySelector("[name=version]"), ms = form.querySelector("[name=message]");
      if (tp) tp.value = plat === "Shopify" ? "Shopify app" : "Magento 2 extension";
      if (vs) vs.value = plat === "Shopify" ? "Shopify" : "Magento 2";
      if (ms && !ms.value) ms.value = "I would like a quote for the " + plat + " " + (plat === "Shopify" ? "app" : "extension") +
        ": " + item + (price ? " (" + price + ")" : "") + ".\nMy store URL: \nInstallation help needed: yes / no\n\n";
    }
    var pre = params.get("app");
    if (pre) {
      var t = form.querySelector("[name=topic]");
      var m = form.querySelector("[name=message]");
      if (m && !m.value) m.value = "About the app: " + pre.slice(0, 120) + "\n\n";
      if (t) t.value = "Customise an existing app";
    }
    var started = Date.now();
    var status = form.querySelector(".form-status");
    var mailtoFallback = function () {
      var f = function (n) { var el = form.querySelector("[name=" + n + "]"); return el ? el.value.trim().slice(0, 4000) : ""; };
      var subject = (f("topic") || "Project enquiry") + (f("company") ? " - " + f("company") : "");
      var body = ["Name: " + f("name"), "Company: " + f("company"), "Email: " + f("email"), "Phone: " + f("phone"),
        "Platform: " + f("version"), "Users: " + f("users"), "Start: " + f("timeline"), "", f("message")].join("\n");
      return "mailto:" + form.getAttribute("data-to") + "?subject=" + encodeURIComponent(subject.slice(0, 180)) +
        "&body=" + encodeURIComponent(body);
    };
    var setStatus = function (text, err, link) {
      if (!status) return;
      status.textContent = text;
      status.classList.toggle("err", !!err);
      if (link) {
        var a = document.createElement("a");
        a.href = link; a.textContent = " Send it by email instead.";
        status.appendChild(a);
      }
    };
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var endpoint = form.getAttribute("data-endpoint");
      if (!endpoint || !window.fetch) { location.href = mailtoFallback(); return; }
      var btn = form.querySelector("button[type=submit]");
      var data = new URLSearchParams(new FormData(form));
      data.set("form", form.getAttribute("data-form") || "quote");
      data.set("elapsed", String(Date.now() - started));
      data.set("page", location.pathname.slice(0, 200));
      if (firstSource) data.set("source", firstSource);
      if (btn) btn.disabled = true;
      setStatus("Sending...", false);
      fetch(endpoint, { method: "POST", body: data, credentials: "omit", mode: "cors" })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok && j.ok, status: r.status }; }); })
        .then(function (res) {
          if (!res.ok) throw res;
          var done = document.createElement("div");
          done.className = "form-done";
          done.setAttribute("role", "status");
          done.innerHTML = '<span class="fi blue"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
            'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg></span>' +
            "<h3>Thank you, we have your request</h3><p>We reply by email within one working day, usually sooner. " +
            "Check your spam folder if you do not see it.</p>";
          form.replaceWith(done);
        })
        .catch(function (err) {
          if (btn) btn.disabled = false;
          var msg = err && err.status === 429 ? "Too many requests from your connection. Please try again later." :
            err && err.status === 400 ? "Please check your name, email and message." :
            "Sorry, the form could not be sent.";
          setStatus(msg, true, mailtoFallback());
        });
    });
  }

  // --- blog article search, category filters and newsletter mailto ---
  var blogSearch = document.getElementById("blog-search");
  if (blogSearch) {
    var blogCards = Array.prototype.slice.call(document.querySelectorAll(".blog-card"));
    var blogResult = document.getElementById("blog-result");
    var blogCategory = "";
    var filterBlog = function () {
      var q = norm(blogSearch.value.trim());
      var words = q.split(/\s+/).filter(Boolean), shown = 0;
      blogCards.forEach(function (c) {
        var k = norm(c.getAttribute("data-blog-k"));
        var ok = words.every(function (w) { return k.indexOf(w) !== -1; }) && (!blogCategory || k.indexOf(blogCategory) !== -1);
        c.hidden = !ok; if (ok) shown++;
      });
      if (blogResult) blogResult.textContent = "Showing " + shown + (shown === 1 ? " article" : " articles");
    };
    blogSearch.addEventListener("input", filterBlog);
    document.querySelectorAll("[data-blog-category]").forEach(function (a) {
      a.addEventListener("click", function () {
        document.querySelectorAll("[data-blog-category]").forEach(function (b) { b.classList.remove("on"); });
        a.classList.add("on");
        blogCategory = norm(a.getAttribute("data-blog-category"));
        blogSearch.value = ""; filterBlog();
      });
    });
  }
  var blogNews = document.getElementById("blog-news-form");
  if (blogNews) blogNews.addEventListener("submit", function (e) {
    e.preventDefault();
    var email = blogNews.querySelector("[name=email]").value.trim().slice(0, 160);
    location.href = "mailto:" + blogNews.getAttribute("data-to") + "?subject=" + encodeURIComponent("Newsletter subscription") +
      "&body=" + encodeURIComponent("Please add me to the Modvanta newsletter: " + email);
  });
})();
