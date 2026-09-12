// search.js
import * as cheerio from "cheerio";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0 Safari/537.36";

const cache = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000;

let lastCallAt = 0;
const MIN_GAP_MS = 250;

async function throttle() {
  const now = Date.now();
  const wait = Math.max(0, lastCallAt + MIN_GAP_MS - now);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCallAt = Date.now();
}

// Primary: DuckDuckGo Lite (GET). Broad web coverage.
async function ddgLiteSearch(query, maxResults = 5) {
  await throttle();
  const url = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`;
  const resp = await fetch(url, { headers: { "User-Agent": UA } });
  if (!resp.ok) throw new Error(`DDG HTTP ${resp.status}`);
  const html = await resp.text();
  const $ = cheerio.load(html);

  const links = $("a.result-link");
  const snippets = $("td.result-snippet");

  const results = [];
  links.each((i, el) => {
    if (i >= maxResults) return;
    let href = $(el).attr("href") || "";
    const m = href.match(/uddg=([^&]+)/);
    if (m) {
      try {
        href = decodeURIComponent(m[1]);
      } catch {}
    }
    const title = $(el).text().trim();
    const snippet = snippets.eq(i).text().trim();
    if (title && href) results.push({ title, url: href, snippet });
  });

  return results;
}

// Fallback: Wikipedia REST. Used only if DDG returns nothing.
async function wikiSearch(query, limit = 3) {
  await throttle();
  const url =
    "https://en.wikipedia.org/w/api.php?" +
    new URLSearchParams({
      action: "query",
      list: "search",
      srsearch: query,
      format: "json",
      srlimit: String(limit),
      origin: "*",
    });
  const resp = await fetch(url, { headers: { "User-Agent": UA } });
  if (!resp.ok) throw new Error(`Wikipedia HTTP ${resp.status}`);
  const data = await resp.json();
  const hits = data.query?.search || [];
  const out = [];
  for (const h of hits) {
    const sum = await wikiSummary(h.title);
    out.push({
      title: h.title,
      url: sum?.url || `https://en.wikipedia.org/wiki/${encodeURIComponent(h.title)}`,
      snippet: sum?.extract || (h.snippet || "").replace(/<[^>]+>/g, ""),
    });
  }
  return out;
}

async function wikiSummary(title) {
  await throttle();
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  const resp = await fetch(url, { headers: { "User-Agent": UA } });
  if (!resp.ok) return null;
  const data = await resp.json();
  return { extract: data.extract || "", url: data.content_urls?.desktop?.page || "" };
}

// Public API — DDG first, Wikipedia fallback.
export async function ddgSearch(query, maxResults = 5) {
  const key = query.toLowerCase().trim();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.hits;

  let hits = [];
  let ddgError = null;
  try {
    hits = await ddgLiteSearch(query, maxResults);
  } catch (err) {
    ddgError = err.message;
  }

  if (hits.length === 0) {
    try {
      hits = await wikiSearch(query, maxResults);
    } catch (err) {
      if (!ddgError) ddgError = err.message;
    }
  }

  cache.set(key, { hits, expiresAt: Date.now() + CACHE_TTL_MS });
  if (ddgError) console.warn(`[search] DDG failed (${ddgError}), used fallback: ${hits.length} hits`);
  return hits;
}