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
    const raw = text(item && (item.type || item.assetType || item.contentType || item.imageType)).toUpperCase();
    const compact = raw.replace(/[^A-Z0-9]/g, "");
    if (["FULLPOEM", "FULLPOEMTEXT"].includes(compact)) return "FP";
    if (["FULLPOEMIMAGE", "FULLPOEMGRAPHIC", "FPIMAGE"].includes(compact)) return "FPI";
    return raw || "OTHER";
  }

  function primaryType(row) {
    const explicit = getType(row);
    return explicit === "OTHER" ? "FP" : explicit;
  }

  function catalogValue(item) {
    return text(item && (item.catalog || item.releaseCatalog || item.catalogName || item.catalogCode || item.explorerCatalog));
  }

  function rowAssetTypes(row) {
    const types = new Set([primaryType(row)]);
    for (const item of Array.isArray(row && row.connectedItems) ? row.connectedItems : []) types.add(getType(item));
    return types;
  }

  function relationshipKeys(row) {
    const keys = new Set([
      relationshipLabel({
        workId: row && (row.workId || row.poemId),
        imageId: row && row.imageId,
        title: row && (row.title || row.poemTitle),
      }).key,
    ]);
    for (const item of Array.isArray(row && row.connectedItems) ? row.connectedItems : []) {
      keys.add(relationshipLabel(item).key);
    }
    return [...keys];
  }

  function relationshipCounts(rows) {
    const counts = { exact: 0, linked: 0, inferred: 0, unmatched: 0 };
    for (const row of Array.isArray(rows) ? rows : []) {
      for (const key of relationshipKeys(row)) counts[key] += 1;
    }
    return counts;
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
    const catalog = normalized(filters && filters.catalog);
    const assetType = text(filters && filters.assetType).toUpperCase();
    const confidence = text(filters && filters.confidence).toLowerCase();
    const coverage = filters && filters.coverage && typeof filters.coverage === "object" ? filters.coverage : {};
    const productLink = text(filters && filters.productLink).toLowerCase();
    const flagsOnly = !!(filters && filters.flagsOnly);
    return (Array.isArray(rows) ? rows : []).filter((row) => {
      const rowAuthor = normalized(row.author);
      const rowBook = normalized(row.book || row.bookTitle);
      const rowCatalog = normalized(catalogValue(row));
      const connected = Array.isArray(row.connectedItems) ? row.connectedItems : [];
      const haystack = normalized([
        row.title || row.poemTitle,
        row.author,
        row.book || row.bookTitle,
        row.catalog || row.releaseCatalog,
        row.imageId,
        ...connected.map((item) => [item.title, item.poemTitle, item.imageId, item.canonicalImageId, getType(item),
          item.sourceUrl, item.mediaUrl, item.fileLink, item.downloadUrl, item.driveUrl, item.imageUrl,
          item.platform, item.sourceSystem, item.source, item.origin].join(" ")),
        ...(Array.isArray(row.explorerProductLinks) ? row.explorerProductLinks.map((link) => [link.label, link.url].join(" ")) : []),
      ].join(" "));
      const typeMatch = !assetType
        || primaryType(row) === assetType
        || connected.some((item) => getType(item) === assetType);
      const confidenceMatch = !confidence || relationshipKeys(row).includes(confidence);
      const types = rowAssetTypes(row);
      const coverageMatch = Object.entries(coverage).every(([type, mode]) => {
        const hasType = types.has(text(type).toUpperCase());
        return mode === "has" ? hasType : mode === "missing" ? !hasType : true;
      });
      const hasProductLink = rowHasProductLink(row);
      const productLinkMatch = !productLink || (productLink === "has" ? hasProductLink : productLink === "missing" ? !hasProductLink : true);
      const flagged = itemFlags(row).length || connected.some((item) => itemFlags(item).length);
      return (!query || haystack.includes(query))
        && (!author || rowAuthor === author)
        && (!book || rowBook === book)
        && (!catalog || rowCatalog === catalog)
        && typeMatch
        && confidenceMatch
        && coverageMatch
        && productLinkMatch
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

  function isDriveUrl(value) {
    return /^https:\/\/(drive|docs)\.google\.com\//i.test(text(value));
  }

  function driveUrl(item) {
    const candidates = item ? [
      item.driveUrl, item.googleDriveUrl, item.googleDriveLink, item.fileLink,
      item.downloadUrl, item.mediaUrl, item.imageUrl, item.sourceUrl,
    ] : [];
    return text(candidates.find(isDriveUrl));
  }

  function driveDownloadUrl(item) {
    if (text(item && item.downloadUrl)) return text(item.downloadUrl);
    const url = driveUrl(item);
    if (!url) return "";
    const match = url.match(/\/file\/d\/([^/]+)/i) || url.match(/[?&]id=([^&]+)/i);
    return match ? "https://drive.google.com/uc?export=download&id=" + encodeURIComponent(match[1]) : "";
  }

  function assetRank(item) {
    const rankFields = ["rank", "ranking", "imageRank", "curationRank", "qualityRank", "priorityRank", "rankPosition"];
    const scoreFields = ["score", "rankingScore", "qualityScore", "priorityScore"];
    for (const key of rankFields) {
      const raw = item && item[key];
      if (raw !== "" && raw != null && Number.isFinite(Number(raw))) {
        return { kind: "rank", value: Number(raw), label: "Rank " + Number(raw) };
      }
    }
    for (const key of scoreFields) {
      const raw = item && item[key];
      if (raw !== "" && raw != null && Number.isFinite(Number(raw))) {
        return { kind: "score", value: Number(raw), label: "Score " + Number(raw) };
      }
    }
    return null;
  }

  function rankingValue(item) {
    const ranking = assetRank(item);
    if (!ranking) return null;
    return ranking.kind === "rank" ? -ranking.value : ranking.value;
  }

  function compareAssetRanking(left, right, mode) {
    const a = rankingValue(left);
    const b = rankingValue(right);
    if (a == null && b == null) return 0;
    if (a == null) return 1;
    if (b == null) return -1;
    return mode === "ranking-low" ? a - b : b - a;
  }

  function bestRowRanking(row) {
    const values = (Array.isArray(row && row.connectedItems) ? row.connectedItems : [])
      .map(rankingValue).filter((value) => value != null);
    return values.length ? Math.max(...values) : null;
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

  function rowHasProductLink(row) {
    return (Array.isArray(row && row.explorerProductLinks) && row.explorerProductLinks.length > 0)
      || productLinks(row || {}).length > 0;
  }

  function coveragePresence(rows) {
    const presence = Object.fromEntries(ASSET_TYPES.map((type) => [type, { has: 0, missing: 0 }]));
    for (const row of Array.isArray(rows) ? rows : []) {
      const types = rowAssetTypes(row);
      for (const type of ASSET_TYPES) presence[type][types.has(type) ? "has" : "missing"] += 1;
    }
    return presence;
  }

  function coverageCounts(rows) {
    const counts = Object.fromEntries(ASSET_TYPES.map((type) => [type, 0]));
    let other = 0;
    let flagged = 0;
    for (const row of Array.isArray(rows) ? rows : []) {
      const primary = primaryType(row);
      if (Object.prototype.hasOwnProperty.call(counts, primary)) counts[primary] += 1;
      else other += 1;
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
    const summaryByBook = new Map(summaries.map((summary) => [normalized(summary.book || summary.bookTitle), summary]));
    const enrichedRows = rows.map((row) => {
      const summary = summaryByBook.get(normalized(row.book || row.bookTitle)) || {};
      const additions = {};
      const catalog = catalogValue(summary);
      if (!catalogValue(row) && catalog) additions.explorerCatalog = catalog;
      const links = productLinks(row, summary);
      if (links.length) additions.explorerProductLinks = links;
      return Object.keys(additions).length ? { ...row, ...additions } : row;
    });
    return {
      rows: enrichedRows,
      summaries,
      authors: unique(enrichedRows.map((row) => row.author)),
      books: unique(enrichedRows.map((row) => row.book || row.bookTitle)),
      catalogs: unique(enrichedRows.map(catalogValue)),
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
    primaryType,
    rowAssetTypes,
    catalogValue,
    relationshipCounts,
    itemFlags,
    assetUrl,
    driveUrl,
    driveDownloadUrl,
    assetRank,
    compareAssetRanking,
    bestRowRanking,
    productLinks,
    rowHasProductLink,
    coveragePresence,
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
    const state = { rows: [], summaries: [], filtered: [], visibleCount: PAGE_SIZE, coverageFilters: {} };
    const $ = (id) => document.getElementById(id);
    const plainText = (value) => String(value == null ? "" : value).trim();
    const escapeHtml = (value) => String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#039;");

    async function apiGet(path, forceRefresh) {
      E.assertReadOnlyRequest("GET");
      const user = firebase.auth().currentUser;
      if (!user) throw new Error("Sign in through Poetry Please Admin with a team account.");
      const request = async (refresh) => {
        const token = await user.getIdToken(!!refresh);
        const timeoutMs = path === "me" ? 12000 : 45000;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          return await fetch("/api/" + path.replace(/^\//, ""), {
            method: "GET",
            headers: { Accept: "application/json", Authorization: "Bearer " + token },
            signal: controller.signal,
          });
        } catch (error) {
          if (error && error.name === "AbortError") {
            throw new Error(path === "me"
              ? "The team access service did not respond within 12 seconds."
              : "Team access was confirmed, but the content request did not respond within 45 seconds.");
          }
          throw error;
        } finally {
          clearTimeout(timer);
        }
      };
      let response = await request(forceRefresh);
      if (response.status === 401 && !forceRefresh) response = await request(true);
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

    function fillConfidenceSelect(rows) {
      const counts = E.relationshipCounts(rows);
      const labels = {
        exact: "Exact / stable",
        linked: "Poetry Please linked",
        inferred: "Inferred",
        unmatched: "Unmatched",
      };
      $("confidence").innerHTML = '<option value="">All relationship types</option>'
        + Object.entries(labels)
          .filter(([key]) => counts[key] > 0)
          .map(([key, label]) => '<option value="' + key + '">' + label + " (" + counts[key] + ")</option>")
          .join("");
    }

    function selectedFilters() {
      return {
        query: $("search").value,
        author: $("author").value,
        book: $("book").value,
        catalog: $("catalog").value,
        assetType: $("asset-type").value,
        confidence: $("confidence").value,
        coverage: { ...state.coverageFilters },
        productLink: $("product-link").value,
        sort: $("sort") ? $("sort").value : "",
        flagsOnly: $("flags-only").checked,
      };
    }

    function syncUrl() {
      const filters = selectedFilters();
      const params = new URLSearchParams();
      if (filters.query) params.set("q", filters.query);
      if (filters.author) params.set("author", filters.author);
      if (filters.book) params.set("book", filters.book);
      if (filters.catalog) params.set("catalog", filters.catalog);
      if (filters.assetType) params.set("type", filters.assetType);
      if (filters.confidence) params.set("confidence", filters.confidence);
      const coverage = Object.entries(filters.coverage).sort().map(([type, mode]) => type + ":" + mode).join(",");
      if (coverage) params.set("coverage", coverage);
      if (filters.productLink) params.set("productLink", filters.productLink);
      if (filters.sort) params.set("sort", filters.sort);
      if (filters.flagsOnly) params.set("flags", "1");
      history.replaceState(null, "", location.pathname + (params.toString() ? "?" + params.toString() : ""));
    }

    function restoreFilters() {
      const params = new URLSearchParams(location.search);
      $("search").value = params.get("q") || "";
      $("author").value = params.get("author") || "";
      $("book").value = params.get("book") || "";
      $("catalog").value = params.get("catalog") || "";
      $("asset-type").value = params.get("type") || "";
      $("confidence").value = params.get("confidence") || "";
      state.coverageFilters = {};
      for (const token of (params.get("coverage") || "").split(",")) {
        const [type, mode] = token.split(":");
        if (E.ASSET_TYPES.includes(type) && ["has", "missing"].includes(mode)) state.coverageFilters[type] = mode;
      }
      $("product-link").value = params.get("productLink") || "";
      if ($("sort")) $("sort").value = params.get("sort") || "";
      $("flags-only").checked = params.get("flags") === "1";
    }

    function renderLinks(links) {
      if (!links.length) return '<span class="muted">Not exposed by the current read-only Poetry Please response.</span>';
      return links.map((link) => '<a href="' + escapeHtml(link.url) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(link.label) + "</a>").join(" · ");
    }

    function renderSummary(rows, facetRows) {
      const coverage = E.coverageCounts(rows);
      const presence = E.coveragePresence(facetRows);
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
      $("coverage").innerHTML = E.ASSET_TYPES.map((type) => {
        const mode = state.coverageFilters[type] || "any";
        const label = mode === "has" ? "Has " + presence[type].has
          : mode === "missing" ? "Missing " + presence[type].missing
            : presence[type].has + " have · " + presence[type].missing + " missing";
        return '<button type="button" data-coverage-filter="' + type + '" data-mode="' + mode
          + '" class="' + (mode !== "any" ? "active" : "") + '" aria-pressed="' + (mode !== "any")
          + '" title="Click to cycle Any, Has, and Missing"><b>' + type + "</b> " + label + "</button>";
      }).join("");
    }

    function renderAssetLinks(item) {
      const id = item.canonicalImageId || item.imageId || item.id || "";
      const poetryPleaseUrl = id ? "/app?item=" + encodeURIComponent(id) : "";
      const drive = E.driveUrl(item);
      const download = E.driveDownloadUrl(item);
      const source = E.assetUrl(item);
      const links = [];
      if (poetryPleaseUrl) links.push({ label: "Open in Poetry Please", url: poetryPleaseUrl });
      if (drive) links.push({ label: "Open in Drive", url: drive });
      if (download) links.push({ label: "Download", url: download });
      if (source && ![poetryPleaseUrl, drive, download].includes(source)) links.push({ label: "Open source", url: source });
      return links.length
        ? '<div class="work-links">' + links.map((link) => '<a href="' + escapeHtml(link.url)
          + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(link.label) + "</a>").join(" · ") + "</div>"
        : '<span class="muted">No source link returned.</span>';
    }

    function renderAsset(item, assetTypeFilter) {
      if (assetTypeFilter && E.getType(item) !== assetTypeFilter) return "";
      const identity = E.relationshipLabel(item);
      const url = E.assetUrl(item);
      const id = item.canonicalImageId || item.imageId || item.id || "";
      const status = item.visibilityStatus || item.status || "available";
      const flags = E.itemFlags(item);
      const provenance = item.sourceSystem || item.source || item.origin || "";
      const ranking = E.assetRank(item);
      return '<li class="asset">'
        + '<div class="asset-title"><strong>' + escapeHtml(E.getType(item)) + "</strong> · " + escapeHtml(item.title || item.poemTitle || id || "Untitled") + "</div>"
        + '<div class="meta"><span class="confidence ' + identity.key + '">' + escapeHtml(identity.label) + "</span> "
        + escapeHtml(identity.detail) + "</div>"
        + '<div class="meta">ID: ' + escapeHtml(id || "not returned") + " · Status: " + escapeHtml(status)
        + (provenance ? " · Source: " + escapeHtml(provenance) : "")
        + (ranking ? " · " + escapeHtml(ranking.label) : "") + "</div>"
        + (item.excerpt || item.quote ? '<blockquote>' + escapeHtml(item.excerpt || item.quote) + "</blockquote>" : "")
        + (flags.length ? '<div class="flag">' + flags.map((flag) => escapeHtml(flag.note || flag.qualityLane || "Review flag")).join(" · ") + "</div>" : "")
        + renderAssetLinks(item)
        + "</li>";
    }

    function renderWork(row, assetTypeFilter, sortMode) {
      const connected = Array.isArray(row.connectedItems) ? row.connectedItems : [];
      const visibleAssets = connected.filter((item) => !assetTypeFilter || E.getType(item) === assetTypeFilter);
      const ordered = visibleAssets.slice().sort((a, b) => {
        if (sortMode) {
          const ranked = E.compareAssetRanking(a, b, sortMode);
          if (ranked) return ranked;
        }
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
        + '<div class="chips"><span>' + escapeHtml(E.catalogValue(row) || "Catalog unavailable") + "</span>"
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
        if (filters.sort) {
          const left = E.bestRowRanking(a);
          const right = E.bestRowRanking(b);
          if (left == null && right != null) return 1;
          if (left != null && right == null) return -1;
          if (left != null && right != null && left !== right) {
            return filters.sort === "ranking-low" ? left - right : right - left;
          }
        }
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
      const expandBooks = !!(filters.query || filters.author || filters.book || filters.catalog || filters.assetType || filters.confidence
        || filters.productLink || Object.keys(filters.coverage).length || filters.flagsOnly);
      $("results").innerHTML = groups.size ? [...groups.entries()].sort(bookSort).map(([book, rows]) => {
        const summary = summaryByBook.get(E.normalized(book)) || {};
        const sample = rows[0] || {};
        const links = E.productLinks(sample, summary);
        const release = summary.releaseDate || summary.pubDate || summary.releaseYear || sample.releaseDate || sample.pubDate || sample.releaseYear || "";
        const catalog = E.catalogValue(summary) || E.catalogValue(sample);
        return '<details class="book-card"' + (expandBooks ? " open" : "") + '><summary class="book-header"><div><div class="eyebrow">Book</div><h2>' + escapeHtml(book) + "</h2>"
          + '<div class="meta">' + escapeHtml(sample.author || "") + '</div></div><div class="book-stats"><strong>' + rows.length + '</strong><span>works</span></div></summary>'
          + '<div class="book-meta"><div><b>Release</b><span>' + escapeHtml(release || "Not returned") + "</span></div>"
          + "<div><b>Catalog</b><span>" + escapeHtml(catalog || "Not returned") + "</span></div>"
          + "<div><b>Product links</b><span>" + renderLinks(links) + "</span></div></div>"
          + '<div class="works">' + rows.map((row) => renderWork(row, filters.assetType, filters.sort)).join("") + "</div></details>";
      }).join("") : '<div class="empty">No works match these filters.</div>';

      renderSummary(state.filtered, state.rows);
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
      ["search", "author", "book", "catalog", "asset-type", "confidence", "product-link", "sort"].forEach((id) => { if ($(id)) $(id).value = ""; });
      state.coverageFilters = {};
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
      fillSelect("catalog", model.catalogs, "catalogs");
      fillSelect("asset-type", E.ASSET_TYPES, "asset types");
      fillConfidenceSelect(state.rows);
      restoreFilters();
      $("workspace").hidden = false;
      render();
    }

    function setAccountState(user, profile) {
      const email = plainText((profile && profile.email) || (user && user.email));
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
        const code = plainText(error && error.code);
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
    ["author", "book", "catalog", "asset-type", "confidence", "product-link", "sort", "flags-only"].forEach((id) => { if ($(id)) $(id).addEventListener("change", filterChanged); });
    $("reset").addEventListener("click", resetFilters);
    $("coverage").addEventListener("click", (event) => {
      const button = event.target.closest("[data-coverage-filter]");
      if (!button) return;
      const type = button.getAttribute("data-coverage-filter");
      const current = state.coverageFilters[type] || "any";
      const next = current === "any" ? "has" : current === "has" ? "missing" : "any";
      if (next === "any") delete state.coverageFilters[type];
      else state.coverageFilters[type] = next;
      filterChanged();
    });
    $("load-more").addEventListener("click", () => {
      state.visibleCount += PAGE_SIZE;
      render();
    });

    let accessAttempt = 0;
    function accessTimeout(attempt, user) {
      return setTimeout(() => {
        if (attempt !== accessAttempt) return;
        $("login").hidden = false;
        $("retry-auth").hidden = false;
        const email = user && user.email ? " for " + user.email : "";
        setStatus("The team access check timed out" + email + ". Choose your Google account again or retry.", true);
      }, 10000);
    }

    firebase.auth().onAuthStateChanged(async (user) => {
      const attempt = ++accessAttempt;
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
      const timer = accessTimeout(attempt, user);
      try {
        const profile = await apiGet("me");
        if (attempt !== accessAttempt) return;
        setAccountState(user, profile);
        if (!E.isTeamProfile(profile)) {
          clearTimeout(timer);
          const email = plainText(profile && profile.email) || user.email || "this account";
          setStatus(email + " is signed in, but Poetry Please did not return a team or admin role. Choose another Google account if this is not your staff login.", true);
          return;
        }
        clearTimeout(timer);
        setStatus("Team access confirmed for " + (profile.email || user.email || "this account") + ". Loading content…");
        await load();
      } catch (error) {
        if (attempt !== accessAttempt) return;
        clearTimeout(timer);
        $("retry-auth").hidden = false;
        const email = user.email ? " for " + user.email : "";
        setStatus((error.message || "Could not load Content Explorer.") + email + " Choose another account or retry.", true);
      }
    });
  })();
}
