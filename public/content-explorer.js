(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ContentExplorer = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const ASSET_TYPES = ["EXC", "VV", "YT", "QI", "INT", "FPI", "FP"];

  function text(value) {
    return String(value == null ? "" : value).trim();
  }

  function normalized(value) {
    return text(value).toLowerCase().replace(/[’‘]/g, "'").replace(/[^a-z0-9]+/g, " ").trim();
  }

  function isTeamProfile(profile) {
    const roles = Array.isArray(profile && profile.roles) ? profile.roles.map(normalized) : [];
    return roles.includes("team") || roles.includes("admin");
  }

  function unique(values) {
    return [...new Set(values.map(text).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  }

  function filterWorks(rows, filters) {
    const query = normalized(filters && filters.query);
    const author = normalized(filters && filters.author);
    const book = normalized(filters && filters.book);
    return (Array.isArray(rows) ? rows : []).filter((row) => {
      const rowAuthor = normalized(row.author);
      const rowBook = normalized(row.book || row.bookTitle);
      const haystack = normalized([
        row.title || row.poemTitle,
        row.author,
        row.book || row.bookTitle,
        row.catalog || row.releaseCatalog,
        row.imageId,
      ].join(" "));
      return (!query || haystack.includes(query))
        && (!author || rowAuthor === author)
        && (!book || rowBook === book);
    });
  }

  function relationshipLabel(item) {
    if (!item || typeof item !== "object") return { key: "unmatched", label: "Unmatched", detail: "No relationship evidence returned." };
    if (text(item.workId || item.poemId || item.canonicalWorkId || item.excerptDbRecordId)) {
      return { key: "exact", label: "Exact / stable", detail: "A stable cross-record identifier is present." };
    }
    if (text(item.canonicalImageId || item.imageId || item.id)) {
      return { key: "linked", label: "Poetry Please linked", detail: "A stable item ID is present; the response does not state the match rule." };
    }
    if (text(item.title || item.poemTitle)) {
      return { key: "inferred", label: "Inferred", detail: "Only descriptive metadata is available; review before reuse." };
    }
    return { key: "unmatched", label: "Unmatched", detail: "No stable identity or descriptive match was returned." };
  }

  function assertReadOnlyRequest(method) {
    const verb = text(method || "GET").toUpperCase();
    if (verb !== "GET") throw new Error("Content Explorer is read-only; only GET requests are allowed.");
    return verb;
  }

  function getType(item) {
    return text(item && (item.type || item.assetType || item.contentType)).toUpperCase() || "OTHER";
  }

  function assetUrl(item) {
    const direct = item && (item.fileLink || item.mediaUrl || item.downloadUrl || item.driveUrl || item.imageUrl || item.sourceUrl);
    if (text(direct)) return text(direct);
    const id = text(item && (item.canonicalImageId || item.imageId || item.id));
    return id ? "/app?item=" + encodeURIComponent(id) : "";
  }

  function productLinks(row, summary) {
    const sources = [summary || {}, row || {}];
    const fields = [
      ["Button shop", "buttonBookstoreLink"], ["Book link", "bookLink"], ["Product", "productLink"],
      ["Amazon", "amazon"], ["Bookshop", "bookshop"], ["Barnes & Noble", "barnesAndNoble"],
      ["Goodreads", "goodreads"],
    ];
    const links = [];
    for (const source of sources) {
      for (const [label, key] of fields) {
        if (text(source[key])) links.push({ label, url: text(source[key]) });
      }
      const bag = source.productLinks || source.bookLinks;
      if (bag && typeof bag === "object" && !Array.isArray(bag)) {
        for (const [label, url] of Object.entries(bag)) if (text(url)) links.push({ label, url: text(url) });
      }
    }
    const seen = new Set();
    return links.filter((entry) => {
      if (seen.has(entry.url)) return false;
      seen.add(entry.url);
      return true;
    });
  }

  function viewModel(payload) {
    const rows = Array.isArray(payload && payload.rows) ? payload.rows : [];
    const summaries = Array.isArray(payload && payload.bookSummaries) ? payload.bookSummaries : [];
    return {
      rows,
      summaries,
      authors: unique(rows.map((row) => row.author)),
      books: unique(rows.map((row) => row.book || row.bookTitle)),
    };
  }

  return {
    ASSET_TYPES,
    normalized,
    isTeamProfile,
    filterWorks,
    relationshipLabel,
    assertReadOnlyRequest,
    getType,
    assetUrl,
    productLinks,
    viewModel,
  };
});

if (typeof document !== "undefined") {
  (function () {
    "use strict";
    const E = window.ContentExplorer;
    const FIREBASE_CONFIG = {
      apiKey: "AIzaSyDhDlg_3VjDTfamRvjcsguqMaiFS3DogT8",
      authDomain: "poetry-please.firebaseapp.com",
      projectId: "poetry-please",
      storageBucket: "poetry-please.firebasestorage.app",
      messagingSenderId: "609992589187",
      appId: "1:609992589187:web:ea8aed51a08c3716b880b6",
      measurementId: "G-FBLJHKQ70B"
    };
    if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);

    const state = { rows: [], summaries: [], filtered: [] };
    const $ = (id) => document.getElementById(id);
    const escapeHtml = (value) => String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#039;");

    async function apiGet(path) {
      E.assertReadOnlyRequest("GET");
      const user = firebase.auth().currentUser;
      if (!user) throw new Error("Sign in through Poetry Please Admin with a team account.");
      const token = await user.getIdToken(false);
      const response = await fetch("/api/" + path.replace(/^\//, ""), {
        method: "GET",
        headers: { Accept: "application/json", Authorization: "Bearer " + token },
      });
      if (!response.ok) throw new Error("Read-only API request failed (" + response.status + ").");
      return response.json();
    }

    function setStatus(message, error) {
      $("status").textContent = message;
      $("status").className = error ? "status error" : "status";
    }

    function fillSelect(id, values, label) {
      const select = $(id);
      select.innerHTML = '<option value="">All ' + escapeHtml(label) + "</option>"
        + values.map((value) => '<option value="' + escapeHtml(value) + '">' + escapeHtml(value) + "</option>").join("");
    }

    function renderLinks(links) {
      if (!links.length) return '<span class="muted">Not exposed by the current read-only Poetry Please response.</span>';
      return links.map((link) => '<a href="' + escapeHtml(link.url) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(link.label) + "</a>").join(" · ");
    }

    function flagsFor(row) {
      const flags = Array.isArray(row.flags) ? row.flags : [];
      if (row.flagged && !flags.length) flags.push({ note: "Flagged in Poetry Please" });
      if (row.quarantined) flags.push({ note: "Quarantined" });
      return flags;
    }

    function renderAsset(item) {
      const identity = E.relationshipLabel(item);
      const url = E.assetUrl(item);
      const id = item.canonicalImageId || item.imageId || item.id || "";
      const status = item.visibilityStatus || item.status || "available";
      const flags = Array.isArray(item.flags) ? item.flags : [];
      return '<li class="asset">'
        + '<div><strong>' + escapeHtml(E.getType(item)) + "</strong> · " + escapeHtml(item.title || item.poemTitle || id || "Untitled") + "</div>"
        + '<div class="meta"><span class="confidence ' + identity.key + '">' + escapeHtml(identity.label) + "</span> "
        + escapeHtml(identity.detail) + "</div>"
        + '<div class="meta">ID: ' + escapeHtml(id || "not returned") + " · Status: " + escapeHtml(status) + "</div>"
        + (item.excerpt ? '<blockquote>' + escapeHtml(item.excerpt) + "</blockquote>" : "")
        + (flags.length ? '<div class="flag">' + flags.map((flag) => escapeHtml(flag.note || flag.qualityLane || "Review flag")).join(" · ") + "</div>" : "")
        + (url ? '<a href="' + escapeHtml(url) + '" target="_blank" rel="noopener noreferrer">Open source</a>' : '<span class="muted">No source link returned.</span>')
        + "</li>";
    }

    function renderWork(row) {
      const connected = Array.isArray(row.connectedItems) ? row.connectedItems : [];
      const ordered = connected.slice().sort((a, b) => E.ASSET_TYPES.indexOf(E.getType(a)) - E.ASSET_TYPES.indexOf(E.getType(b)));
      const flags = flagsFor(row);
      const workIdentity = E.relationshipLabel({ workId: row.workId || row.poemId, imageId: row.imageId });
      return '<article class="work-card">'
        + '<div class="work-head"><div><h3>' + escapeHtml(row.title || row.poemTitle || "Untitled") + '</h3>'
        + '<div class="meta">' + escapeHtml(row.author || "Unknown author") + " · " + escapeHtml(row.book || row.bookTitle || "No book returned") + "</div></div>"
        + '<span class="confidence ' + workIdentity.key + '">' + escapeHtml(workIdentity.label) + "</span></div>"
        + '<div class="chips"><span>' + escapeHtml(row.catalog || row.releaseCatalog || "Catalog unavailable") + "</span>"
        + '<span>' + connected.length + " linked asset" + (connected.length === 1 ? "" : "s") + "</span>"
        + (row.signalLevel ? "<span>Signal: " + escapeHtml(row.signalLevel) + "</span>" : "") + "</div>"
        + (flags.length ? '<div class="flag"><strong>Review flags:</strong> ' + flags.map((flag) => escapeHtml(flag.note || flag.qualityLane || "Flagged")).join(" · ") + "</div>" : "")
        + (row.excerpt ? '<blockquote>' + escapeHtml(row.excerpt) + "</blockquote>" : "")
        + '<div class="work-links"><a href="/app?item=' + encodeURIComponent(row.imageId || "") + '" target="_blank" rel="noopener noreferrer">Open work in Poetry Please</a></div>'
        + '<details><summary>Assets and related content (' + connected.length + ")</summary>"
        + (ordered.length ? "<ul>" + ordered.map(renderAsset).join("") + "</ul>" : '<p class="muted">No connected assets returned.</p>')
        + "</details></article>";
    }

    function render() {
      state.filtered = E.filterWorks(state.rows, {
        query: $("search").value,
        author: $("author").value,
        book: $("book").value,
      });
      const summaryByBook = new Map(state.summaries.map((summary) => [E.normalized(summary.book), summary]));
      const groups = new Map();
      for (const row of state.filtered) {
        const book = row.book || row.bookTitle || "Book not returned";
        if (!groups.has(book)) groups.set(book, []);
        groups.get(book).push(row);
      }
      $("results").innerHTML = groups.size ? [...groups.entries()].map(([book, rows]) => {
        const summary = summaryByBook.get(E.normalized(book)) || {};
        const sample = rows[0] || {};
        const links = E.productLinks(sample, summary);
        const release = summary.releaseDate || summary.pubDate || sample.releaseDate || sample.pubDate || "";
        const catalog = summary.catalog || sample.catalog || sample.releaseCatalog || "";
        return '<section class="book-card"><header><div><div class="eyebrow">Book</div><h2>' + escapeHtml(book) + "</h2>"
          + '<div class="meta">' + escapeHtml(sample.author || "") + "</div></div><div class="book-stats"><strong>" + rows.length + "</strong><span>works</span></div></header>"
          + '<div class="book-meta"><div><b>Release</b><span>' + escapeHtml(release || "Not returned") + "</span></div>"
          + "<div><b>Catalog</b><span>" + escapeHtml(catalog || "Not returned") + "</span></div>"
          + "<div><b>Product links</b><span>" + renderLinks(links) + "</span></div></div>"
          + '<div class="works">' + rows.map(renderWork).join("") + "</div></section>";
      }).join("") : '<div class="empty">No works match these filters.</div>';
      setStatus(state.filtered.length + " work" + (state.filtered.length === 1 ? "" : "s") + " shown. Read-only: no source records are changed.");
    }

    async function load() {
      const payload = await apiGet("scoreboard/fullPoems");
      const model = E.viewModel(payload);
      state.rows = model.rows;
      state.summaries = model.summaries;
      fillSelect("author", model.authors, "authors");
      fillSelect("book", model.books, "books");
      $("filters").hidden = false;
      render();
    }

    async function signIn() {
      await firebase.auth().signInWithPopup(new firebase.auth.GoogleAuthProvider());
    }

    $("login").addEventListener("click", signIn);
    $("logout").addEventListener("click", () => firebase.auth().signOut());
    ["search", "author", "book"].forEach((id) => $(id).addEventListener(id === "search" ? "input" : "change", render));

    firebase.auth().onAuthStateChanged(async (user) => {
      $("login").hidden = !!user;
      $("logout").hidden = !user;
      $("filters").hidden = true;
      $("results").innerHTML = "";
      if (!user) {
        setStatus("Team access required. Sign in with the same account used for Poetry Please Admin.", true);
        return;
      }
      try {
        const profile = await apiGet("me");
        if (!E.isTeamProfile(profile)) throw new Error("A Poetry Please team or admin account is required.");
        await load();
      } catch (error) {
        setStatus(error.message || "Could not load Content Explorer.", true);
      }
    });
  })();
}
