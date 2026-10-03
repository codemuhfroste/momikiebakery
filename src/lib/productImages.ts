// Product photo suggestions from the Open Food Facts family of open
// databases, shared by the product form's "Search image" (via
// /api/product-images) and the "Find missing photos" page.
//
// Two different services, because neither alone is enough:
//
//   search.openfoodfacts.org  fuzzy, relevance-ranked, and fast, but indexes
//                             food and drink only.
//   cgi/search.pl             exact-ish term matching on the beauty and
//                             products databases, which carry the soap,
//                             detergent and household lines.
//
// Images are CC BY-SA licensed by Open Food Facts contributors.

const USER_AGENT = "MomikieGM/1.0 (general merchandise POS; product photo lookup)";

const SEARCH_SERVICE = "https://search.openfoodfacts.org/search";
const LEGACY_HOSTS = ["https://world.openbeautyfacts.org", "https://world.openproductsfacts.org"];

const FIELDS = "code,product_name,brands,image_front_url,image_front_small_url";
const PER_SOURCE = 8;
const MAX_RESULTS = 12;
const TIMEOUT_MS = 8000;
const CACHE_SECONDS = 86400;

export interface ProductImageHit {
  code: string;
  name: string;
  brand: string | null;
  thumb: string;
  image: string;
}

interface RawProduct {
  code?: string | number;
  product_name?: string;
  brands?: string | string[];
  image_front_url?: string;
  image_front_small_url?: string;
}

async function fetchJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      // The same searches recur constantly (every pause in typing, every
      // staff member adding the same line), so let Next cache them for a day.
      next: { revalidate: CACHE_SECONDS },
    });
    if (!res.ok) return null;
    // These endpoints occasionally answer with an HTML error page, so parse
    // defensively rather than trusting the response to be JSON.
    return JSON.parse(await res.text());
  } catch {
    return null; // a slow or broken source simply contributes nothing
  }
}

async function searchFood(q: string): Promise<RawProduct[]> {
  const url = `${SEARCH_SERVICE}?q=${encodeURIComponent(q)}&page_size=${PER_SOURCE}&fields=${FIELDS}`;
  const data = (await fetchJson(url)) as { hits?: RawProduct[] } | null;
  return Array.isArray(data?.hits) ? data.hits : [];
}

async function searchLegacy(host: string, q: string): Promise<RawProduct[]> {
  const url =
    `${host}/cgi/search.pl?search_terms=${encodeURIComponent(q)}` +
    `&json=1&page_size=${PER_SOURCE}&fields=${FIELDS}`;
  const data = (await fetchJson(url)) as { products?: RawProduct[] } | null;
  return Array.isArray(data?.products) ? data.products : [];
}

function firstBrand(brands: string | string[] | undefined): string | null {
  if (Array.isArray(brands)) return brands[0]?.trim() || null;
  return brands?.split(",")[0]?.trim() || null;
}

/** Up to 12 suggestions for a product name, food first, duplicates removed. */
export async function searchProductImages(query: string): Promise<ProductImageHit[]> {
  const q = query.trim().slice(0, 60);
  if (q.length < 2) return [];
  const [food, ...others] = await Promise.all([searchFood(q), ...LEGACY_HOSTS.map((host) => searchLegacy(host, q))]);
  const seen = new Set<string>();
  const results: ProductImageHit[] = [];
  for (const product of [...food, ...others.flat()]) {
    if (results.length >= MAX_RESULTS) break;
    const image = product.image_front_url ?? product.image_front_small_url;
    const name = (product.product_name ?? "").trim();
    if (!image || !name || seen.has(image)) continue;
    seen.add(image);
    results.push({
      code: String(product.code ?? ""),
      name,
      brand: firstBrand(product.brands),
      thumb: product.image_front_small_url ?? image,
      image,
    });
  }
  return results;
}

// ---- Matching a catalogue product to a suggestion ----
// Store names carry sizes and packaging ("Milo 22g Sachet", "Pandesal (per
// piece)") that the databases don't, and the top search result is often a
// different product entirely. So the search uses a cleaned-up name, and a
// suggestion only counts as a match when its own name contains the product's
// key words.

// Packaging words that the databases leave out. ("Loaf" is not one of them:
// "Meat Loaf" without it is just "Meat".)
const NOISE = new Set(["per", "piece", "pcs", "pc", "pack", "sachet", "bottle", "can", "small", "big", "large", "regular", "the", "and", "with", "of", "in"]);

/** "Milo 22g Sachet" -> "Milo"; "Coke Mismo 290ml" -> "Coke Mismo". */
export function cleanProductQuery(name: string): string {
  return name
    .replace(/\(.*?\)/g, " ")
    .replace(/\b\d+(?:[.,/]\d+)?\s*(?:g|kg|mg|ml|l|oz|pcs?|s|x)?\b/gi, " ")
    .split(/\s+/)
    .filter((w) => w && !NOISE.has(w.toLowerCase()))
    .join(" ")
    .trim();
}

function words(s: string): string[] {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !NOISE.has(w) && !/^\d/.test(w))
    // "noodles" and "noodle", "rolls" and "roll" count as the same word.
    .map((w) => (w.length > 4 && w.endsWith("s") ? w.slice(0, -1) : w));
}

/** 0..1: how many of the product's key words appear in the suggestion's name or brand. */
export function matchScore(productName: string, hit: Pick<ProductImageHit, "name" | "brand">): number {
  const key = words(cleanProductQuery(productName));
  if (key.length === 0) return 0;
  const text = ` ${words(`${hit.name} ${hit.brand ?? ""}`).join(" ")} `;
  // A word counts if it appears whole, or as the start of a word ("roll" in "rolls").
  const found = key.filter((k) => text.includes(` ${k}`)).length;
  // The first word is usually the brand or the product itself; without it the
  // match is suspect even if other words line up.
  return text.includes(` ${key[0]}`) ? found / key.length : (found / key.length) * 0.4;
}

export const CONFIDENT_MATCH = 0.75;

/** Suggestions for a catalogue product, best match first, each with its score. */
export async function suggestPhotosFor(productName: string): Promise<(ProductImageHit & { score: number })[]> {
  const cleaned = cleanProductQuery(productName) || productName;
  const hits = await searchProductImages(cleaned);
  return hits
    .map((h, i) => ({ ...h, score: matchScore(productName, h), order: i }))
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .map(({ order, ...h }) => (void order, h));
}
