import fs from "node:fs";
import path from "node:path";

const BASE = "https://button-poetry-catalog-350789123099.us-central1.run.app";
const OUTPUT = "diagnostics/catalog-route-inventory.json";
const MAX_ENDPOINT_BYTES = 65536;
const MAX_PROBE_BYTES = 1048576;
const MAX_OUTPUT_BYTES = 16384;
const METHODS = new Set(["GET", "HEAD", "OPTIONS", "POST", "PUT", "PATCH", "DELETE"]);
const SAFE_PATH = /^\/[A-Za-z0-9._~!$&'()*+,;=:@%{}<>\-/]*$/;
const READ_METHODS = new Set(["GET"]);
const RELATED = /(reconcil|resolution)/i;

function exactKeys(value, keys) {
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}

function validateDiscovery(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Discovery root must be an object");
  if (!exactKeys(value, ["db", "endpoints", "notes", "service"])) throw new Error("Unexpected discovery root fields");
  if (typeof value.db !== "string" || typeof value.service !== "string") throw new Error("db and service must be strings");
  if (value.db.length > 256 || value.service.length > 256) throw new Error("Root string length exceeded");
  if (!Array.isArray(value.notes) || value.notes.length !== 3 || value.notes.some((item) => typeof item !== "string" || item.length > 512)) {
    throw new Error("notes must be exactly three bounded strings");
  }
  if (!Array.isArray(value.endpoints) || value.endpoints.length !== 14 || value.endpoints.length > 14) {
    throw new Error("endpoints must match the verified 14-entry bound");
  }
  return value.endpoints.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("Endpoint " + index + " must be an object");
    if (!exactKeys(item, ["description", "method", "path"])) throw new Error("Unexpected endpoint fields at " + index);
    if (typeof item.description !== "string" || typeof item.method !== "string" || typeof item.path !== "string") {
      throw new Error("Endpoint fields must be strings at " + index);
    }
    if (item.description.length > 512 || item.method.length > 16 || item.path.length > 256) {
      throw new Error("Endpoint field length exceeded at " + index);
    }
    const method = item.method.toUpperCase();
    if (!METHODS.has(method)) throw new Error("Unapproved HTTP method at " + index);
    if (!SAFE_PATH.test(item.path) || item.path.includes("?") || item.path.includes("#")) {
      throw new Error("Unsafe path/template at " + index);
    }
    return { method, path: item.path };
  });
}

async function readLimited(response, limit) {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) throw new Error("Response exceeded byte limit");
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    total += next.value.byteLength;
    if (total > limit) {
      await reader.cancel();
      throw new Error("Response exceeded byte limit");
    }
    chunks.push(Buffer.from(next.value));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function templateKind(template) {
  const lower = template.toLowerCase();
  const hasMarker = /[{}<>]/.test(template) || /(^|\/)\:[a-z_][a-z0-9_]*/i.test(template);
  const resolutionParameter =
    /(?:resolution[_-]?id|resolutionid)/i.test(template) ||
    (/\/resolutions\/(?:\{id\}|<(?:(?:int|string):)?id>|:id)(?:\/|$)/i.test(template));
  const reconciliationParameter =
    /(?:reconciliation[_-]?id|reconciliationid)/i.test(template) ||
    (/\/reconciliations\/(?:\{id\}|<(?:(?:int|string):)?id>|:id)(?:\/|$)/i.test(template));
  return { hasMarker, resolutionParameter, reconciliationParameter, lower };
}

function substituteReconciliationId(template) {
  let output = template;
  output = output.replace(/\{reconciliation(?:_|-)?id\}/gi, "2");
  output = output.replace(/<(?:(?:int|string):)?reconciliation(?:_|-)?id>/gi, "2");
  output = output.replace(/:reconciliation(?:_|-)?id\b/gi, "2");
  output = output.replace(/(\/reconciliations\/)\{id\}(?=\/|$)/gi, (_match, prefix) => prefix + "2");
  output = output.replace(/(\/reconciliations\/)<(?:(?:int|string):)?id>(?=\/|$)/gi, (_match, prefix) => prefix + "2");
  output = output.replace(/(\/reconciliations\/)\:id(?=\/|$)/gi, (_match, prefix) => prefix + "2");
  return output;
}

function boundedFieldNames(value) {
  const names = Object.keys(value);
  if (names.length > 64 || names.some((name) => name.length > 128)) throw new Error("Response field-name bound exceeded");
  return names.sort();
}

function jsonSummary(data) {
  const topLevelJsonType = data === null ? "null" : Array.isArray(data) ? "array" : typeof data;
  const summary = { topLevelJsonType };
  if (Array.isArray(data)) {
    summary.arrayLength = data.length;
    const representative = data.find((item) => item && typeof item === "object" && !Array.isArray(item));
    summary.sampleObjectFieldNames = representative ? boundedFieldNames(representative) : [];
  } else if (data && typeof data === "object") {
    summary.topLevelFieldNames = boundedFieldNames(data);
  }
  return summary;
}

async function fetchJson(url, limit) {
  const response = await fetch(url, {
    method: "GET",
    redirect: "error",
    signal: AbortSignal.timeout(15000),
    headers: { Accept: "application/json" }
  });
  const contentType = (response.headers.get("content-type") || "missing").split(";", 1)[0].trim().toLowerCase().slice(0, 128);
  const body = await readLimited(response, limit);
  let data;
  try {
    data = JSON.parse(body);
  } catch {
    throw new Error("Expected valid JSON");
  }
  return { response, contentType, data };
}

const discovery = await fetchJson(BASE + "/endpoints", MAX_ENDPOINT_BYTES);
if (discovery.response.status !== 200) throw new Error("Discovery did not return HTTP 200");
if (!(discovery.contentType === "application/json" || discovery.contentType.endsWith("+json"))) {
  throw new Error("Discovery did not return JSON content type");
}
const inventory = validateDiscovery(discovery.data);
const related = inventory.filter((entry) => RELATED.test(entry.path));
const probes = [];
const individualResolutionTemplatesNotProbed = [];
const nonGetRelatedTemplatesNotProbed = [];
const unresolvedRelatedTemplatesNotProbed = [];

for (const entry of related) {
  const kind = templateKind(entry.path);
  if (kind.resolutionParameter) {
    individualResolutionTemplatesNotProbed.push({ method: entry.method, advertisedTemplate: entry.path });
    continue;
  }
  if (!READ_METHODS.has(entry.method)) {
    nonGetRelatedTemplatesNotProbed.push({ method: entry.method, advertisedTemplate: entry.path });
    continue;
  }
  const probedPath = kind.reconciliationParameter ? substituteReconciliationId(entry.path) : entry.path;
  if (/[{}<>]/.test(probedPath) || /(^|\/)\:[a-z_][a-z0-9_]*/i.test(probedPath)) {
    unresolvedRelatedTemplatesNotProbed.push({ method: entry.method, advertisedTemplate: entry.path });
    continue;
  }
  if (!SAFE_PATH.test(probedPath) || probedPath.includes("?") || probedPath.includes("#")) throw new Error("Unsafe probed path");
  const result = await fetchJson(BASE + probedPath, MAX_PROBE_BYTES);
  probes.push({
    method: entry.method,
    advertisedTemplate: entry.path,
    probedPath,
    httpStatus: result.response.status,
    contentType: result.contentType,
    ...jsonSummary(result.data)
  });
}

const output = {
  routes: inventory,
  reconciliationRelated: {
    probes,
    individualResolutionTemplatesNotProbed,
    nonGetRelatedTemplatesNotProbed,
    unresolvedRelatedTemplatesNotProbed
  }
};
const serialized = JSON.stringify(output, null, 2) + "\n";
if (Buffer.byteLength(serialized, "utf8") > MAX_OUTPUT_BYTES) throw new Error("Sanitized output exceeded byte limit");
fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, serialized, { encoding: "utf8", mode: 0o600 });
console.log("Sanitized Catalog route inventory and shape result written.");
