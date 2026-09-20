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

  function getType(item) {
    return text(item && (item.type || item.assetType || item.contentType)).toUpperCase() || "OTHER";
  }

  function itemFlags(item) {
    const flags = Array.isArray(item && item.flags) ? item.flags.slice() : [];
    if (item && item.flagged && !flags.length) flags.push({ note: "Flagged in Poetry Please" });
    if (item && item.quarantined) flags.push({ note: "Quarantined" });
    return flags;
  }

  function filterWorks(rows, filters) {
    const query = normalized(filters && filters.query);
    const author = normalized(filters && filters.author);
    const book = normalized(filters && filters.book);
    const assetType = text(filters && filters.assetType).toUpperCase();
    const confidence = text(filters && filters.confidence).toLowerCase();
    const flagsOnly = !!(filters && filters.flagsOnly);
    return (Array.isArray(rows) ? rows : []).filter((row) => {
      const rowAuthor = normalized(row.author);
      const rowBook = normalized(row.book || row.bookTitle);
      const connected = Array.isArray(row.connectedItems) ? row.connectedItems : [];
      const haystack = normalized([
        row.title || row.poemTitle,
        row.author,
        row.book || row.bookTitle,
        row.catalog || row.releaseCatalog,
        row.imageId,
        ...connected.map((item) => [item.title, item.poemTitle, item.imageId, item.canonicalImageId, getType(item)].join(" ")),
      ].join(" "));
      const typeMatch = !assetType || connected.some((item) => getType(item) === assetType);
      const confidenceMatch = !confidence || connected.some((item) => relationshipLabel(item).key === confidence);
      const flagged = itemFlags(row).length || connected.some((item) => itemFlags(item).length);
      return (!query || haystack.includes(query))
        && (!author || rowAuthor === author)
        && (!book || rowBook === book)
        && typeMatch
        && confidenceMatch
        && (!flagsOnly || flagged);
    });
  }

  function assertReadOnlyRequest(method) {
    const verb = text(method || "GET").toUpperCase();
    if (verb !== "GET") throw new Error("Content Explorer is read-only; only GET requests are allowed.");
    return verb;
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
      for (const [label, key] of fields) if (text(source[key])) links.push({ label, url: text(source[key]) });
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

  function coverageCounts(rows) {
    const counts = Object.fromEntries(ASSET_TYPES.map((type) => [type, 0]));
    let other = 0;
    let flagged = 0;
    for (const row of Array.isArray(rows) ? rows : []) {
      if (itemFlags(row).length) flagged += 1;
      for (const item of Array.isArray(row.connectedItems) ? row.connectedItems : []) {
        const type = getType(item);
        if (Object.prototype.hasOwnProperty.call(counts, type)) counts[type] += 1;
        else other += 1;
        if (itemFlags(item).length) flagged += 1;
      }
    }
    return { counts, other, flagged };
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
    itemFlags,
    assetUrl,
    productLinks,
    coverageCounts,
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

    const PAGE_SIZE = 40;
    const state = { rows: [], summaries: [], filtered: [], visibleCount: PAGE_SIZE };
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

    function selectedFilters() {
      return {
        query: $("search").value,
        author: $("author").value,
        book: $("book").value,
        assetType: $("asset-type").value,
        confidence: $("confidence").value,
        flagsOnly: $("flags-only").checked,
      };
    }

    function syncUrl() {
      const filters = selectedFilters();
      const params = new URLSearchParams();
      if (filters.query) params.set("q", filters.query);
      if (filters.author) params.set("author", filters.author);
      if (filters.book) params.set("book", filters.book);
      if (filters.assetType) params.set("type", filters.assetType);
      if (filters.confidence) params.set("confidence", filters.confidence);
      if (filters.flagsOnly) params.set("flags", "1");
      history.replaceState(null, "", location.pathname + (params.toString() ? "?" + params.toString() : ""));
    }

    function restoreFilters() {
      const params = new URLSearchParams(location.search);
      $("search").value = params.get("q") || "";
      $("author").value = params.get("author") || "";
      $("book").value = params.get("book") || "";
      $("asset-type").value = params.get("type") || "";
      $("confidence").value = params.get("confidence") || "";
      $("flags-only").checked = params.get("flags") === "1";
    }

    function renderLinks(links) {
      if (!links.length) return '<span class="muted">Not exposed by the current read-only Poetry Please response.</span>';
      return links.map((link) => '<a href="' + escapeHtml(link.url) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(link.label) + "</a>").join(" · ");
    }

    function renderSummary(rows) {
      const coverage = E.coverageCounts(rows);
      const bookCount = new Set(rows.map((row) => E.normalized(row.book || row.bookTitle)).filter(Boolean)).size;
      const authorCount = new Set(rows.map((row) => E.normalized(row.author)).filter(Boolean)).size;
      const assetTotal = Object.values(coverage.counts).reduce((sum, value) => sum + value, 0) + coverage.other;
      $("summary").innerHTML = [
        ["Works", rows.length],
        ["Books", bookCount],
        ["Authors", authorCount],
        ["Linked assets", assetTotal],
        ["Flags", coverage.flagged],
      ].map((item) => '<div class="summary-stat"><strong>' + item[1] + '</strong><span>' + item[0] + "</span></div>").join("");
      $("coverage").innerHTML = E.ASSET_TYPES.map((type) => '<span><b>' + type + "</b> " + coverage.counts[type] + "</span>").join("")
        + (coverage.other ? '<span><b>OTHER</b> ' + coverage.other + "</span>" : "");
    }

    function renderAsset(item, assetTypeFilter) {
      if (assetTypeFilter && E.getType(item) !== assetTypeFilter) return "";
      const identity = E.relationshipLabel(item);
      const url = E.assetUrl(item);
      const id = item.canonicalImageId || item.imageId || item.id || "";
      const status = item.visibilityStatus || item.status || "available";
      const flags = E.itemFlags(item);
      const provenance = item.sourceSystem || item.source || item.origin || "";
      return '<li class="asset">'
        + '<div class="asset-title"><strong>' + escapeHtml(E.getType(item)) + "</strong> · " + escapeHtml(item.title || item.poemTitle || id || "Untitled") + "</div>"
        + '<div class="meta"><span class="confidence ' + identity.key + '">' + escapeHtml(identity.label) + "</span> "
        + escapeHtml(identity.detail) + "</div>"
        + '<div class="meta">ID: ' + escapeHtml(id || "not returned") + " · Status: " + escapeHtml(status)
        + (provenance ? " · Source: " + escapeHtml(provenance) : "") + "</div>"
        + (item.excerpt || item.quote ? '<blockquote>' + escapeHtml(item.excerpt || item.quote) + "</blockquote>" : "")
        + (flags.length ? '<div class="flag">' + flags.map((flag) => escapeHtml(flag.note || flag.qualityLane || "Review flag")).join(" · ") + "</div>" : "")
        + (url ? '<a href="' + escapeHtml(url) + '" target="_blank" rel="noopener noreferrer">Open source</a>' : '<span class="muted">No source link returned.</span>')
        + "</li>";
    }

    function renderWork(row, assetTypeFilter) {
      const connected = Array.isArray(row.connectedItems) ? row.connectedItems : [];
      const visibleAssets = connected.filter((item) => !assetTypeFilter || E.getType(item) === assetTypeFilter);
      const ordered = visibleAssets.slice().sort((a, b) => {
        const ai = E.ASSET_TYPES.indexOf(E.getType(a));
        const bi = E.ASSET_TYPES.indexOf(E.getType(b));
        return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
      });
      const flags = E.itemFlags(row);
      const workIdentity = E.relationshipLabel({ workId: row.workId || row.poemId, imageId: row.imageId });
      const workUrl = row.imageId ? "/app?item=" + encodeURIComponent(row.imageId) : "";
      const types = E.coverageCounts([row]).counts;
      const typeChips = E.ASSET_TYPES.filter((type) => types[type]).map((type) => "<span>" + type + " " + types[type] + "</span>").join("");
      return '<article class="work-card">'
        + '<div class="work-head"><div><h3>' + escapeHtml(row.title || row.poemTitle || "Untitled") + '</h3>'
        + '<div class="meta">' + escapeHtml(row.author || "Unknown author") + " · " + escapeHtml(row.book || row.bookTitle || "No book returned") + "</div></div>"
        + '<span class="confidence ' + workIdentity.key + '">' + escapeHtml(workIdentity.label) + "</span></div>"
        + '<div class="chips"><span>' + escapeHtml(row.catalog || row.releaseCatalog || "Catalog unavailable") + "</span>"
        + typeChips
        + (row.signalLevel ? "<span>Signal: " + escapeHtml(row.signalLevel) + "</span>" : "") + "</div>"
        + (flags.length ? '<div class="flag"><strong>Review flags:</strong> ' + flags.map((flag) => escapeHtml(flag.note || flag.qualityLane || "Flagged")).join(" · ") + "</div>" : "")
        + (row.excerpt ? '<blockquote>' + escapeHtml(row.excerpt) + "</blockquote>" : "")
        + (workUrl ? '<div class="work-links"><a href="' + workUrl + '" target="_blank" rel="noopener noreferrer">Open work in Poetry Please</a></div>' : "")
        + '<details><summary>Assets and related content (' + ordered.length + ")</summary>"
        + (ordered.length ? "<ul>" + ordered.map((item) => renderAsset(item, assetTypeFilter)).join("") + "</ul>" : '<p class="muted">No connected assets match this view.</p>')
        + "</details></article>";
    }

    function bookSort(left, right) {
      return left[0].localeCompare(right[0]);
    }

    function render() {
      const filters = selectedFilters();
      state.filtered = E.filterWorks(state.rows, filters);
      state.filtered.sort((a, b) => {
        const book = String(a.book || a.bookTitle || "").localeCompare(String(b.book || b.bookTitle || ""));
        return book || String(a.title || a.poemTitle || "").localeCompare(String(b.title || b.poemTitle || ""));
      });
      const visibleRows = state.filtered.slice(0, state.visibleCount);
      const summaryByBook = new Map(state.summaries.map((summary) => [E.normalized(summary.book), summary]));
      const groups = new Map();
      for (const row of visibleRows) {
        const book = row.book || row.bookTitle || "Book not returned";
        if (!groups.has(book)) groups.set(book, []);
        groups.get(book).push(row);
      }
      $("results").innerHTML = groups.size ? [...groups.entries()].sort(bookSort).map(([book, rows]) => {
        const summary = summaryByBook.get(E.normalized(book)) || {};
        const sample = rows[0] || {};
        const links = E.productLinks(sample, summary);
        const release = summary.releaseDate || summary.pubDate || summary.releaseYear || sample.releaseDate || sample.pubDate || sample.releaseYear || "";
        const catalog = summary.catalog || summary.releaseCatalog || sample.catalog || sample.releaseCatalog || "";
        return '<section class="book-card"><header><div><div class="eyebrow">Book</div><h2>' + escapeHtml(book) + "</h2>"
          + '<div class="meta">' + escapeHtml(sample.author || "") + '</div></div><div class="book-stats"><strong>' + rows.length + '</strong><span>shown</span></div></header>'
          + '<div class="book-meta"><div><b>Release</b><span>' + escapeHtml(release || "Not returned") + "</span></div>"
          + "<div><b>Catalog</b><span>" + escapeHtml(catalog || "Not returned") + "</span></div>"
          + "<div><b>Product links</b><span>" + renderLinks(links) + "</span></div></div>"
          + '<div class="works">' + rows.map((row) => renderWork(row, filters.assetType)).join("") + "</div></section>";
      }).join("") : '<div class="empty">No works match these filters.</div>';

      renderSummary(state.filtered);
      const remaining = state.filtered.length - visibleRows.length;
      $("load-more").hidden = remaining <= 0;
      $("load-more").textContent = remaining > 0 ? "Show " + Math.min(PAGE_SIZE, remaining) + " more works" : "";
      setStatus(state.filtered.length + " matching work" + (state.filtered.length === 1 ? "" : "s")
        + (remaining > 0 ? "; showing the first " + visibleRows.length + "." : ".")
        + " Read-only: no source records are changed.");
      syncUrl();
    }

    function filterChanged() {
      state.visibleCount = PAGE_SIZE;
      render();
    }

    function resetFilters() {
      ["search", "author", "book", "asset-type", "confidence"].forEach((id) => { $(id).value = ""; });
      $("flags-only").checked = false;
      filterChanged();
    }

    async function load() {
      const payload = await apiGet("scoreboard/fullPoems");
      const model = E.viewModel(payload);
      state.rows = model.rows;
      state.summaries = model.summaries;
      fillSelect("author", model.authors, "authors");
      fillSelect("book", model.books, "books");
      fillSelect("asset-type", E.ASSET_TYPES, "asset types");
      restoreFilters();
      $("workspace").hidden = false;
      render();
    }

    function setAccountState(user, profile) {
      const email = text((profile && profile.email) || (user && user.email));
      $("account-note").textContent = email ? "Signed in as " + email : "";
      $("account-note").hidden = !email;
      $("switch-account").hidden = !user;
    }

    async function signIn() {
      setStatus("Opening Google account chooser…");
      const provider = new firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      try {
        await firebase.auth().signInWithPopup(provider);
      } catch (error) {
        const code = text(error && error.code);
        if (code === "auth/unauthorized-domain") {
          setStatus("Google sign-in is not authorized on this preview address. The Explorer preview host must be added to the existing Firebase authorized domains before team testing.", true);
        } else if (code !== "auth/popup-closed-by-user" && code !== "auth/cancelled-popup-request") {
          setStatus("Google sign-in did not complete" + (code ? " (" + code + ")" : "") + ". Try again or reload this page.", true);
        }
      }
    }

    async function signOut() {
      await firebase.auth().signOut();
      setAccountState(null, null);
    }

    $("login").addEventListener("click", signIn);
    $("switch-account").addEventListener("click", async () => {
      await firebase.auth().signOut();
      await signIn();
    });
    $("retry-auth").addEventListener("click", () => location.reload());
    $("logout").addEventListener("click", signOut);
    ["search"].forEach((id) => $(id).addEventListener("input", filterChanged));
    ["author", "book", "asset-type", "confidence", "flags-only"].forEach((id) => $(id).addEventListener("change", filterChanged));
    $("reset").addEventListener("click", resetFilters);
    $("load-more").addEventListener("click", () => {
      state.visibleCount += PAGE_SIZE;
      render();
    });

    let authResolved = false;
    const authTimeout = setTimeout(() => {
      if (authResolved) return;
      $("login").hidden = false;
      $("retry-auth").hidden = false;
      setStatus("The team access check is taking too long. Reload the page or choose your Google account again.", true);
    }, 10000);

    firebase.auth().onAuthStateChanged(async (user) => {
      authResolved = true;
      clearTimeout(authTimeout);
      $("login").hidden = !!user;
      $("logout").hidden = !user;
      $("retry-auth").hidden = true;
      $("workspace").hidden = true;
      $("results").innerHTML = "";
      setAccountState(user, null);
      if (!user) {
        setStatus("Team access required. Choose the Google account you use for Poetry Please Admin.", true);
        return;
      }
      setStatus("Checking team access for " + (user.email || "this Google account") + "…");
      try {
        const profile = await apiGet("me");
        setAccountState(user, profile);
        if (!E.isTeamProfile(profile)) {
          const email = text(profile && profile.email) || user.email || "this account";
          setStatus(email + " is signed in, but Poetry Please did not return a team or admin role. Choose another Google account if this is not your staff login.", true);
          return;
        }
        await load();
      } catch (error) {
        $("retry-auth").hidden = false;
        const email = user.email ? " for " + user.email : "";
        setStatus((error.message || "Could not load Content Explorer.") + email + " Choose another account or retry.", true);
      }
    });
  })();
}
