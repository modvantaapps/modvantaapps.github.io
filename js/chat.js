/* Modvanta Assistant: a small on-site helper. It answers only from this site's own content
   (/data/assistant.json + /data/search.json), runs fully in the browser, sends nothing anywhere,
   and hands the visitor to a person by email when it can't help. */
(function () {
  "use strict";
  if (window.__mdvChat) return;
  window.__mdvChat = true;

  var KEY = "mdv-chat-v1";
  var STOP = ("a an and are can could do does for from get have help i in is it me my need of on or our please " +
    "show some tell that the there this to want we what which with would you your app apps odoo module modules " +
    "find looking hi hello hey price prices cost costs much how usd cheap").split(" ");
  var data = null, apps = null, log = [], el = {}, busy = false;

  function norm(s) { return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); }
  function words(s) {
    return norm(s).replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(function (w) {
      return w.length > 1 && STOP.indexOf(w) === -1;
    });
  }
  function store() {
    try { sessionStorage.setItem(KEY, JSON.stringify({ log: log.slice(-40), open: !el.panel.hidden })); } catch (e) { /* private mode */ }
  }
  function restore() {
    try { return JSON.parse(sessionStorage.getItem(KEY) || "null"); } catch (e) { return null; }
  }
  function load() {
    if (data) return Promise.resolve();
    var get = function (u) { return fetch(u, { credentials: "same-origin" }).then(function (r) { if (!r.ok) throw r; return r.json(); }); };
    return Promise.all([get("/data/assistant.json"), get("/data/search.json")]).then(function (r) {
      data = r[0];
      data.pages.forEach(function (x) { x._n = norm(x.n); x._k = norm(x.n + " " + x.t + " " + x.k); });
      data.faq.forEach(function (x) { x._k = norm(x.q + " " + x.a); x._q = norm(x.q); });
      apps = r[1].map(function (x) { x._n = norm(x.n); x._k = norm(x.n + " " + x.t + " " + x.g + " " + x.k); return x; });
    });
  }

  // ---------------------------------------------------------------- matching
  // word-start matching ("vat" must not hit "reservation") weighted by rarity ("gym" counts, "management" barely)
  function stem(w) { return w.length > 4 ? w.replace(/(ing|ies|es|s)$/, "") : w; }
  function has(text, w) { return (" " + text).indexOf(" " + w) !== -1; }
  function weights(ws) {
    var all = apps.concat(data.pages);
    return ws.map(function (w) {
      var st = stem(w), df = 0;
      all.forEach(function (x) { if (has(x._k, st)) df++; });
      return { w: st, idf: Math.log((all.length + 1) / (df + 1)) };
    });
  }
  function top(list, wt, n, min) {
    var total = wt.reduce(function (a, b) { return a + b.idf; }, 0) || 1;
    return list.map(function (x) {
      var s = 0, got = 0;
      wt.forEach(function (k) {
        if (has(x._n, k.w)) { s += k.idf * 3; got += k.idf; }
        else if (has(x._k, k.w)) { s += k.idf; got += k.idf; }
      });
      return { x: x, s: got / total >= (min || 0.7) ? s : 0 };
    }).filter(function (r) { return r.s > 0; })
      .sort(function (a, b) { return b.s - a.s; })
      .slice(0, n).map(function (r) { return r.x; });
  }
  function bestFaq(ws) {
    var best = null, bs = 0;
    data.faq.forEach(function (f) {
      var hit = 0;
      ws.forEach(function (w) { if (f._q.indexOf(w) !== -1) hit++; });
      if (hit >= 2 && hit / ws.length >= 0.6 && hit > bs) { best = f; bs = hit; }
    });
    return best;
  }
  function money(a) { return a.p ? (a.c === "EUR" ? "€" : "$") + a.p : "Free"; }

  // ---------------------------------------------------------------- answers
  var HANDOFF = { t: "Talk to a person", act: "handoff" };
  var CHIPS = [{ t: "Find an Odoo app" }, { t: "Custom development" }, { t: "Get a quote", u: "/request-quote/" }, HANDOFF];

  function answer(q) {
    var t = norm(q), ws = words(q);
    if (/^(hi|hello|hey|hii+|good (morning|afternoon|evening)|namaste|salam|bonjour|hola)\b/.test(t) && ws.length < 2)
      return { text: "Hello! What are you working on? I can find an Odoo app, explain a service, or pass your project to our team.", chips: CHIPS };
    if (/(thank|thanks|thx|great|perfect|ok thanks)/.test(t) && ws.length < 3)
      return { text: "You're welcome. If anything else comes up, just ask here or email " + data.email + ".", chips: [HANDOFF] };
    if (/(human|real person|someone|agent|call me|talk to|speak (to|with)|contact (you|us|your team)|your (email|phone|number|whatsapp)|reach you)/.test(t))
      return { text: "Our team replies within 24 hours on working days. Send this chat to us by email and we'll pick it up from here, or use the quote form.", chips: [HANDOFF, { t: "Request a quote", u: "/request-quote/" }] };
    if (/^find an odoo app$/.test(t))
      return { text: "Tell me what the app should do, for example \"WhatsApp order alerts\", \"UAE VAT\" or \"POS loyalty\".", chips: [] };
    if (/^custom development$/.test(t)) ws = ["custom", "development"];
    if (/(quote|estimate|budget|cost of (a |the )?(project|custom|development)|how much (for|to build|does it cost to build)|pricing for (custom|development))/.test(t) && !/app/.test(t))
      return { text: "Custom work is quoted at a fixed price. Tell us what you need and which Odoo version you use; you get a written scope, price and timeline, and work only starts once you approve it.", chips: [{ t: "Request a quote", u: "/request-quote/" }, HANDOFF] };
    if (/(how long|timeline|delivery time|turnaround|how soon)/.test(t))
      return { text: "It depends on the scope. A ready-made app can be installed the same day. Small changes usually take a few days, and a complete system a few weeks. The quote states the timeline before you commit.", chips: [{ t: "Request a quote", u: "/request-quote/" }] };
    if (/(odoo ?1[0-9]|odoo ?20|version|community|enterprise|odoo\.sh|odoo online)/.test(t) && !bestFaq(ws) && ws.length < 5)
      return { text: "Our store apps are built for Odoo 19 and run on Community and Enterprise. We can port a module to Odoo 17 or 18 on request. Odoo Online (SaaS) doesn't accept custom modules; Odoo.sh and your own server do.", chips: [HANDOFF] };
    if (/(refund|license|licence|install(ation)? help|support|bug|not working|error)/.test(t) && !/(app|module) for/.test(t))
      return { text: "Bought one of our apps and need help? Email " + data.email + " with your Odoo version, the app name and a screenshot of the problem. Support for store apps is included.", chips: [HANDOFF, { t: "Support policy", u: "/support.html" }] };

    if (!ws.length) return { text: "Could you tell me a bit more? For example: \"Odoo app for gym memberships\" or \"connect Odoo with Shopify\".", chips: CHIPS };

    var faq = bestFaq(ws);
    var wt = weights(ws);
    var pages = faq ? [] : top(data.pages, wt, 3);
    var custom = /(custom|bespoke|build|develop|tailor)/.test(t);
    if (custom && !faq) {
      var rel = top(data.pages, wt, 2, 0.3).filter(function (p) { return p.u.indexOf("/services/") !== 0; });
      return { text: "Yes, we build custom Odoo modules around how your business works. Send us a short description of the process, your Odoo version, and any examples (a spreadsheet or the form you use today). You'll get a fixed quote with scope and timeline.",
        links: [{ n: "Custom Odoo Development", t: "How we work, what we build and FAQs.", u: "/services/odoo-development/" }].concat(rel.map(function (p) { return { n: p.n, t: p.t, u: p.u }; }))
          .concat(top(apps, wt.filter(function (k) { return !/^(custom|bespoke|build|develop|tailor|system|software)/.test(k.w); }), 2)
            .map(function (a) { return { n: "Ready-made: " + a.n, t: a.t, u: a.u, p: money(a) }; })),
        chips: [{ t: "Request a quote", u: "/request-quote/" }, HANDOFF] };
    }
    var hits = faq ? [] : top(apps, wt, 4);
    var loose = false;
    if (!faq && !pages.length && !hits.length && ws.length > 1) {
      pages = top(data.pages, wt, 2, 0.4); hits = top(apps, wt, 4, 0.4); loose = pages.length + hits.length > 0;
    }
    var wantsPrice = /(price|cost|how much|\$|usd|cheap)/.test(t);
    var out = { text: "", links: [], chips: [] };
    if (faq) { out.text = faq.a; if (faq.u) out.links.push({ n: "Read more", t: "", u: faq.u }); }
    pages.forEach(function (p) { out.links.push({ n: p.n, t: p.t, u: p.u }); });
    hits.forEach(function (a) { out.links.push({ n: a.n, t: a.t, u: a.u, p: money(a) }); });
    if (!out.text) {
      if (hits.length && wantsPrice) out.text = hits[0].n + " is " + money(hits[0]) + " (one-time, from the Odoo Apps Store). Here's what matches:";
      else if (loose) out.text = "No exact match, but these come closest. If none fits, we can build it for you:";
      else if (pages.length || hits.length) out.text = "Here's what I found on our site:";
      else {
        out.text = "I couldn't find a ready-made app for that. It may be something we can build for you. Describe it to our team and you'll get a fixed quote.";
        out.chips = [{ t: "Request a quote", u: "/request-quote/" }, HANDOFF];
        return out;
      }
    }
    if (hits.length) out.chips.push({ t: "See all matching apps", u: "/odoo-apps/?q=" + encodeURIComponent(ws.join(" ").slice(0, 60)) });
    out.chips.push(HANDOFF);
    return out;
  }

  // ---------------------------------------------------------------- UI
  function node(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  }
  function safeUrl(u) { return /^\/(?!\/)/.test(u) ? u : "/"; }

  function render(m) {
    var row = node("div", "mc-msg mc-" + m.who);
    if (m.text) row.appendChild(node("p", "", m.text));
    (m.links || []).forEach(function (l) {
      var a = node("a", "mc-link"); a.href = safeUrl(l.u);
      var h = node("b", "", l.n); a.appendChild(h);
      if (l.p) a.appendChild(node("span", "mc-price", l.p));
      if (l.t) a.appendChild(node("small", "", l.t));
      row.appendChild(a);
    });
    if (m.chips && m.chips.length) {
      var c = node("div", "mc-chips");
      m.chips.forEach(function (ch) {
        var b;
        if (ch.u) { b = node("a", "mc-chip", ch.t); b.href = safeUrl(ch.u); }
        else {
          b = node("button", "mc-chip", ch.t); b.type = "button";
          b.addEventListener("click", function () { ch.act === "handoff" ? handoff() : send(ch.t); });
        }
        c.appendChild(b);
      });
      row.appendChild(c);
    }
    el.log.appendChild(row);
    el.log.scrollTop = el.log.scrollHeight;
  }
  function push(m) { log.push(m); render(m); store(); }

  function send(text) {
    text = (text || "").trim().slice(0, 300);
    if (!text || busy) return;
    push({ who: "me", text: text });
    busy = true;
    var typing = node("div", "mc-msg mc-bot mc-typing", "…");
    el.log.appendChild(typing); el.log.scrollTop = el.log.scrollHeight;
    load().then(function () {
      setTimeout(function () {
        typing.remove(); busy = false;
        var a = answer(text); a.who = "bot"; push(a);
      }, 350);
    }).catch(function () {
      typing.remove(); busy = false;
      push({ who: "bot", text: "I can't load my answers right now. Please email " + "modvantaapps@gmail.com" + " and we'll reply within a working day.", chips: [HANDOFF] });
    });
  }

  function handoff() {
    var lines = log.filter(function (m) { return m.who === "me"; }).map(function (m) { return "- " + m.text; });
    var body = "Hello Modvanta,\n\n" + (lines.length ? "My questions from the website chat:\n" + lines.join("\n") + "\n\n" : "") +
      "Odoo version / edition: \nCompany: \nWhat I need: \n\nSent from page: " + location.pathname;
    var href = "mailto:" + ((data && data.email) || "modvantaapps@gmail.com") + "?subject=" +
      encodeURIComponent("Question from the website chat") + "&body=" + encodeURIComponent(body.slice(0, 1800));
    push({ who: "bot", text: "Your email app should open now with this chat filled in. Add any details and press send; we reply within 24 hours on working days. No email app? Write to " + ((data && data.email) || "modvantaapps@gmail.com") + "." });
    location.href = href;
  }

  function toggle(open) {
    el.panel.hidden = !open;
    el.btn.setAttribute("aria-expanded", open ? "true" : "false");
    el.btn.classList.toggle("is-open", open);
    if (open) {
      if (!log.length) push({ who: "bot", text: "Hi, I'm the Modvanta assistant. I can find one of our " + "Odoo apps, explain our services, or pass your project to our team.", chips: CHIPS });
      load().catch(function () {});
      el.log.scrollTop = el.log.scrollHeight;
      setTimeout(function () { el.input.focus(); }, 50);
    }
    store();
  }

  function svg(path) {
    var ns = "http://www.w3.org/2000/svg", s = document.createElementNS(ns, "svg");
    s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("aria-hidden", "true");
    var p = document.createElementNS(ns, "path"); p.setAttribute("d", path); s.appendChild(p);
    return s;
  }

  function build() {
    el.btn = node("button", "mc-launch"); el.btn.type = "button";
    el.btn.setAttribute("aria-label", "Open chat assistant"); el.btn.setAttribute("aria-controls", "mdv-chat"); el.btn.setAttribute("aria-expanded", "false");
    el.btn.appendChild(svg("M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"));
    el.btn.appendChild(node("span", "mc-launch-t", "Ask us"));

    el.panel = node("div", "mc-panel"); el.panel.id = "mdv-chat"; el.panel.hidden = true;
    el.panel.setAttribute("role", "dialog"); el.panel.setAttribute("aria-label", "Modvanta assistant");
    var head = node("div", "mc-head");
    var who = node("div", "mc-who");
    var av = node("img", "mc-av"); av.src = "/img/brand-mark-64.png"; av.alt = ""; av.width = 32; av.height = 32;
    var nm = node("div"); nm.appendChild(node("b", "", "Modvanta Assistant")); nm.appendChild(node("small", "", "Instant answers · team replies within 24h"));
    who.appendChild(av); who.appendChild(nm);
    var x = node("button", "mc-x"); x.type = "button"; x.setAttribute("aria-label", "Close chat");
    x.appendChild(svg("M6 6l12 12M18 6L6 18"));
    x.addEventListener("click", function () { toggle(false); el.btn.focus(); });
    head.appendChild(who); head.appendChild(x);

    el.log = node("div", "mc-log"); el.log.setAttribute("role", "log"); el.log.setAttribute("aria-live", "polite");
    var form = node("form", "mc-form");
    el.input = node("input"); el.input.type = "text"; el.input.maxLength = 300; el.input.autocomplete = "off";
    el.input.placeholder = "Ask about an app or your project…"; el.input.setAttribute("aria-label", "Your message");
    var go = node("button", "mc-send"); go.type = "submit"; go.setAttribute("aria-label", "Send");
    go.appendChild(svg("M3 11l18-8-8 18-2-8-8-2z"));
    form.appendChild(el.input); form.appendChild(go);
    form.addEventListener("submit", function (e) { e.preventDefault(); var v = el.input.value; el.input.value = ""; send(v); });
    var foot = node("p", "mc-note", "Answers come from this website. Nothing you type is stored or sent unless you choose to email us.");

    el.panel.appendChild(head); el.panel.appendChild(el.log); el.panel.appendChild(form); el.panel.appendChild(foot);
    el.btn.addEventListener("click", function () { toggle(el.panel.hidden); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !el.panel.hidden) { toggle(false); el.btn.focus(); } });
    document.body.appendChild(el.panel); document.body.appendChild(el.btn);

    var saved = restore();
    if (saved && saved.log) { log = saved.log; log.forEach(render); if (saved.open) toggle(true); }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build); else build();
})();
