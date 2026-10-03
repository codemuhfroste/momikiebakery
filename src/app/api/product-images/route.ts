import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/rbac";

// GET /api/product-images?q=c2+small — product photo suggestions for the
// product form, from the Open Food Facts family of open databases.
//
// Runs on the server rather than in the browser because Open Food Facts asks
// callers to identify themselves with a User-Agent, which a browser won't let
// us set, and because one query fans out across several databases.
//
// Two different services, because neither alone is enough:
//
//   search.openfoodfacts.org  fuzzy, relevance-ranked, and fast, but indexes
//                             food and drink only. This is what makes a query
//                             like "C2 small" find C2 Apple Green; the older
//                             endpoint returns nothing for it.
//   cgi/search.pl             exact-ish term matching on the beauty and
//                             products databases, which the search service
//                             does not index but which carry the soap,
//                             detergent and household lines.

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

export async function GET(request: NextRequest) {
  if (!(await getSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = (request.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 60);
  if (q.length < 2) return NextResponse.json({ results: [] });

  const [food, ...others] = await Promise.all([
    searchFood(q),
    ...LEGACY_HOSTS.map((host) => searchLegacy(host, q)),
  ]);

  // Food first: it is both the better-ranked source and most of what the shop
  // sells. The non-food databases fill the rest of the strip.
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

  return NextResponse.json({ results });
}
