const QUICK_PROMPT = `Look at these photos of a single secondhand item. Answer ONLY with a JSON object, no markdown fences, no commentary:

{
  "size_applicable": true or false. True only if this is clothing or footwear where a size is a normal, expected listing detail. False for anything else (electronics, homeware, toys, accessories, etc.),
  "size": "the exact size if you can read it on a visible label/tag in the photos, else null. Only fill this in if actually legible - never guess.",
  "search_query": "a short, accurate eBay search phrase for this item - brand + item type + any distinguishing detail visible (e.g. 'Nike Air Max 90 trainers mens', 'Emporio Armani navy t-shirt'). No fluff, no size/condition words, just what a buyer would type to find this item."
}`;

// Split into a STATIC system prompt (identical text on every full-mode call
// bar one boolean - whether real eBay data is available) and a short
// DYNAMIC user message (the actual per-item facts/eBay listings). This is
// purely a cost optimisation: the system prompt is marked cache_control in
// the handler below, so Anthropic reuses it cheaply across calls instead of
// re-billing the full instruction text every single item. None of the
// actual instructions changed in this split - only where each piece lives.
function buildFullSystemPrompt(hasEbayData) {
  const codeSearchStep = `Step 2: Check what you noted in Step 1 for a style/item code. If you found one, spend your FIRST web search looking it up (search the code itself, optionally with the retailer name if you know it from the label - e.g. "WLFZJ Very", or just "WLFZJ baby clothes" if the retailer isn't clear). A matching result gives you the item's actual original listing - exact product name, brand, and RRP - which is far more reliable than working it out from the photos alone. If you get a genuine match:
- Treat the product name/brand/material from that listing as OBSERVED FACT for Step 1 purposes (same standing as reading it off the tag yourself), not a guess.
- If the listing shows a price (current or RRP), that's usable in the title as "RRP £X" exactly like a price printed on the tag would be - it's a real, sourced figure, not an estimate.
- Say in notes which retailer/listing you matched it to.
If the code search comes back with nothing clearly matching, say so in notes and fall back to your own visual identification for everything else - don't force a match that isn't genuinely the same item.`;

  const pricingStep = hasEbayData
    ? `Step 3: Real current eBay UK active listings for this item, retrieved directly from eBay's own API (not a web search) - genuine, live listings, each tagged with an id like [L1] - are provided in the user message below, along with roughly how many total active listings eBay reports matching this search.

For EVERY listing shown there, judge how well it actually matches THIS exact item (from the photos), using this hierarchy in order of importance: brand -> exact product/model -> garment type -> gender -> size -> condition -> colour/style. Classify each into exactly one tier:
- "strong": same brand, same or equivalent product line/model, same garment type, matching gender, a compatible size, and broadly comparable condition - a genuine like-for-like comparable you'd expect to sell for a similar price to this exact item
- "weak": same general category but meaningfully different in one of the above (different brand, notably different model, wrong size bracket, or a much different condition) - informative but not a tight match
- "reject": wrong brand, wrong garment type, wrong gender, a bundle/lot listing, an accessory rather than the item itself, or otherwise not a real comparable

Exception to the hierarchy above: if the item carries a licensed character or franchise print/graphic (Disney, Sonic, sports kits, band merch, etc.), treat the specific print/graphic design as close to brand-level importance, not as a minor colour/style detail - a different colourway with a different graphic is effectively a different product, even from the same brand and licence, and should not be scored "strong" just because the brand and character license match. Plain, non-licensed clothing is unaffected - colour/style stays a low-priority factor there as before.

Be strict, not generous - reserve "strong" for genuine matches. Report your tier for every single listing id shown (even the ones you reject) as a single compact string in ebay_comparable_scores, formatted exactly like "L1:strong,L2:weak,L3:reject,L4:strong" - comma separated, no spaces, one entry per id. Still fill in estimated_price_low/estimated_price_high with your own best-judgement price range as a fallback, in case too few strong matches turn up. If a total active-listings count is given in the user message, factor it into your demand read too - a high number suggests a competitive/saturated market, a low number suggests this is a more niche item.

You have a SECOND web search available too (separate from the code lookup above, if you used one) - use it specifically to check Vinted UK for what this item goes for there, since Vinted has no API. Also use whatever you see (in the eBay data and your Vinted search) to judge demand: many results / recent activity = high demand, few or stale results = low demand.`
    : `Step 3: You have a SECOND web search available too (separate from the code lookup above, if you used one) - use it wisely. Search eBay UK and/or Vinted for comparable items (same or similar brand/model/condition) to see what they're actually selling for right now, on BOTH platforms if your search results cover both. Prioritize sold/completed listings over active asking prices — active listings on both platforms are consistently priced above what items actually sell for, since sellers list high and negotiate down or wait for offers. If your search only turns up active asking prices, treat those as a ceiling, not a target: price toward the lower third of that range rather than the middle or top. Do not guess any price from memory — base it on what you find in search, and err conservative rather than optimistic. Also note roughly how much genuine buyer interest/turnover you saw for this kind of item (many recent sold listings = high demand; mostly old unsold active listings = low demand) - this feeds the "demand" field below. If you didn't use a first search on a code (none was visible), you still only need this one search - don't spend the second unless it adds something.`;

  return `You are helping a UK reseller create a marketplace listing from photos of a single secondhand item. The photos follow this order where present: front, then back, then a label/tag close-up, then a condition/flaw detail, then an extra shot. The label/tag close-up, if present, is deliberately a close-up of any label or tag — treat it as your primary source for material and model information; read it carefully rather than guessing from the garment's general appearance.

Step 1: Identify only what you can directly observe. Visible brand logos, colours, and anything legible on a tag or printed on the item itself count as observed. An exact product line name, material composition, or model number does NOT count as observed unless you can actually read it on a visible label/tag in the photos — do not fill these in from a guess at what "looks like" a typical product of that brand. Also note whether a style/item code, product code, or SKU is legible anywhere on a label/tag - many UK retailers print a short reference code on the care label or swing tag (e.g. a code like "WLFZJ" or "J269" on Shop Direct/Very/Littlewoods labels, or similar short alphanumeric codes from other retailers). This is separate from the size and is usually near a barcode. If the seller has personally corrected/confirmed any facts (size, category, condition, brand), those will be given in the user message below - treat them as verified, not something to guess or second-guess, and write the titles/description consistent with them.

${codeSearchStep}

${pricingStep}

Step 4: Respond with ONLY a JSON object as your final message, no markdown fences, no commentary before or after it, in exactly this shape:

{
  "title": "the eBay-optimised title, under 80 characters, KEYWORD-DENSE since eBay search matches on title keywords. Only state details you actually observed per Step 1 (any seller-confirmed facts given in the user message may be included) — if you're not sure of the exact product line/model, use a generic accurate description instead (e.g. 'Men's Navy T-Shirt' not a specific product line you can't confirm). If Step 2's code search found a genuine match, use the real product name/brand from that listing here as observed fact. Order the keywords: Brand -> Gender -> Condition (only if New with tags or New without tags - use 'BNWT' for New with tags, 'New' for New without tags; omit this element entirely for any used condition, don't state 'Excellent'/'Good'/etc in the title) -> Colour -> Style/material keywords -> Garment type -> Notable feature -> Size — e.g. 'Nike Mens BNWT Black Fleece Zip Hoodie Jacket Large' or, if used, 'Nike Mens Black Fleece Zip Hoodie Jacket Large'. Only include an element in that order if it's actually known/observed; skip any you don't have rather than leaving a gap - New items are a strong selling point and something buyers specifically search for, so never drop it silently just because the title is getting long; drop a lower-priority element (Notable feature first) instead if space is tight. Include an RRP near the end of the title as 'RRP £X' whenever you have a genuinely sourced original price AND the item is New with tags/New without tags - either a price actually legible on a tag/label in the photos, OR a price found via a genuine code-search match in Step 2 (same standing as a tag price, never a Step 3 comp-search estimate) - but only ever if it still fits within the 80-character limit alongside everything else. Skip it entirely rather than guess, estimate, or truncate other important info to fit it in",
  "vintedTitle": "a SEPARATE, short, natural, clean Vinted-style title for the same item - NOT keyword-stuffed like the eBay title above. Vinted buyers browse and filter by brand/size/condition through Vinted's own structured filters, so cramming keywords into the title just reads as spammy there. Write it the way a normal seller would naturally title a Vinted listing, e.g. 'Nike black zip hoodie' or 'Vintage Levi's denim jacket' - a few natural words, same underlying facts as the eBay title (only what was actually observed per Step 1), but phrased conversationally rather than as a keyword list. If the item is New with tags or New without tags, work that in too the way a real Vinted seller naturally would (e.g. 'BNWT Nike black zip hoodie' or 'Converse black leather trainers, new without tags') - it's one of the first things a buyer looks for and Vinted sellers routinely lead or end a title with it, so don't leave it out just because the eBay title already states condition separately",
  "description": "2-4 sentence listing description containing ONLY visually confirmed positive descriptive facts (plus any seller-confirmed facts given in the user message) - brand, style, colour, material, design details. Write it the way a person selling the item would write it - state facts plainly (e.g. 'Size 18½. Polyester-cotton blend.') Never narrate how you know something (no phrases like 'tag confirms', 'as shown in photos', 'visible in the images', 'label indicates', 'seller confirmed') - that reads as an AI wrote it, not a seller. NEVER state what ISN'T visible or wasn't included (no 'no label visible', 'no size tag shown', 'material unknown', etc.). DO NOT mention wear, flaws, stains, damage, fading, or any condition issues in the description at all, even if something looks visibly worn or damaged - the seller reviews every item in hand and adds any real flaws themselves; guessing at flaws from photos has repeatedly been wrong. Keep the description purely descriptive, not evaluative. Anything uncertain about the item's core identity still goes in verify_before_listing, just not condition commentary",
  "category": "the MOST SPECIFIC real resale subcategory available, not a broad umbrella term - e.g. 'Men's Zip-Up Hoodies' rather than just 'Men's Hoodies & Sweatshirts', 'Women's Skinny Jeans' rather than just 'Women's Jeans'. Being specific here matters for more than just discoverability - a vague category also skews comparable-pricing accuracy, since broader categories pull in a wider, less comparable spread of eBay listings when matching prices. Still only state a specific subcategory if the photos genuinely support it - fall back to the safest accurate broader label rather than guess a specific one you can't confirm. If the seller has already confirmed the category in the user message below, use that exact value. Otherwise be careful with garment TYPE specifically (top vs dress vs jumpsuit vs romper etc.) - only state a specific type if the photos clearly show the item's full length/silhouette. If you can't see enough of the garment to be sure whether it's cropped, full-length, one-piece, etc., use the safest/most generic accurate label and add a note to verify_before_listing rather than confidently asserting the wrong type",
  "condition": "one of: New with tags, New without tags, Excellent, Good, Fair, Well worn. Judge condition on genuine wear/damage only - intentional design fading/distressing (stone-wash, acid-wash, factory-distressed denim, etc.) is not a flaw and shouldn't by itself lower the rating below Excellent/Good if the item is otherwise in good order. If the seller has confirmed condition in the user message below, use that.",
  "brand": "brand name if visible, else empty string. If the seller has confirmed brand in the user message below, use that.",
  "estimated_price_low": number (GBP, no symbol),
  "estimated_price_high": number (GBP, no symbol),
  "ebay_comparable_scores": "${hasEbayData ? "compact string like L1:strong,L2:weak,L3:reject - one entry per eBay listing id shown in the user message, comma separated, no spaces, required" : "omit this field entirely, no eBay listings were shown this time"}",
  "vinted_price_low": number (GBP, no symbol - what similar items actually go for specifically on Vinted),
  "vinted_price_high": number (GBP, no symbol),
  "demand": "high, medium, or low",
  "listing_recommendation": "one short sentence of practical advice, e.g. 'List on eBay first, strong demand' or 'Low value and low demand - consider listing directly on Vinted at a low price rather than eBay' or 'Similar value on both platforms - either works'",
  "confidence": "high, medium, or low - your confidence in the identification AND the price data",
  "verify_before_listing": ["a list of specific things the seller should personally check before publishing because they were NOT confirmable from the photos - e.g. 'Fabric composition - no care tag visible'. Leave as an empty array only if everything material was genuinely visible and confirmed."],
  "notes": "state what real eBay data / search you used and what you found - including, if a style/item code was visible per Step 1, whether the code search found a genuine matching listing (and which retailer/listing) or found nothing usable. If you could not find good comparables, say so plainly and set confidence to low."
}

Never invent a price, material, or product line. Anything you didn't actually see clearly goes in verify_before_listing, not into the titles or description as stated fact.`;
}

// The short per-item message that goes alongside the photos - just the bits
// that actually vary call to call (seller-confirmed facts, real eBay data if
// we have it). Everything else the model needs is in the cached system
// prompt above.
function buildFullUserPrompt(confirmedFields, ebayListingsBlock, ebayTotalListings) {
  const cf = confirmedFields || {};
  const lines = [];
  if (cf.size) lines.push(`Size: ${cf.size}`);
  if (cf.category) lines.push(`Category/item type: ${cf.category}`);
  if (cf.condition) lines.push(`Condition: ${cf.condition}`);
  if (cf.brand) lines.push(`Brand: ${cf.brand}`);
  const factsNote = lines.length
    ? `The seller has personally corrected/confirmed the following - treat these as verified fact:\n- ${lines.join("\n- ")}`
    : "";

  const totalNote = ebayTotalListings != null
    ? ` (eBay reports approximately ${ebayTotalListings} total active listings currently matching this search.)`
    : "";

  const ebayBlock = ebayListingsBlock
    ? `Real current eBay UK active listings for this item, referenced as Step 3 in the system instructions:\n\n${ebayListingsBlock}${totalNote}`
    : "";

  const parts = ["Here are the photos of this item. Follow the system instructions and respond with the JSON object described there."];
  if (factsNote) parts.push(factsNote);
  if (ebayBlock) parts.push(ebayBlock);
  return parts.join("\n\n");
}

// Bundle listings are text-only - no photos, just the titles/sizes of the
// items already in stock (each one already has an AI-written listing title
// from when it was first catalogued, so there's plenty to work with without
// needing another look at the photos).
function buildBundlePrompt(items, category, sizeLabel, pricing) {
  const itemLines = items.map((it, i) => `${i + 1}. ${it.title}${it.size ? ` (labelled size ${it.size})` : ""}`).join("\n");
  const pricingNote =
    pricing && pricing.combinedValue != null && pricing.suggestedPrice != null
      ? `\n\nPricing (computed, not estimated by you - state these exact figures, never recalculate or round differently): buying these ${items.length} items separately would come to about £${pricing.combinedValue}; the suggested bundle price is £${pricing.suggestedPrice}, a saving of £${pricing.savings}. Work this into the description as a concrete selling point (e.g. mention the bundle price and/or the saving) - a real number that shows the buyer they're getting a deal is one of the strongest reasons to buy a bundle over single items.`
      : "\n\nNo price data available for this bundle - do not mention a price, saving, or value figure anywhere, since none has been computed.";
  return `You are writing a Vinted bundle listing for a UK reseller, optimised to actually sell - not just describe the items, but give a buyer a real reason to buy all of them together rather than none of them.

This bundle contains ${items.length} items, all the same category and a matching size, being sold together as one listing.

Items in this bundle:
${itemLines}

Category: ${category}
Size group: ${sizeLabel}${pricingNote}

Write a short, natural Vinted-style bundle title and description, ready to paste straight into a Vinted listing:
- The title should read the way a real seller would title a bundle - short and natural, not keyword-stuffed (Vinted buyers filter through Vinted's own structured filters, not title keywords) - e.g. "Bundle of 5 women's jumpers size M".
- Open the description with what the buyer gets and why it's a good deal, then list out what's included so a buyer knows exactly what they're getting - condense/rephrase the item names above naturally into a readable list or short sentences, don't just dump the raw titles verbatim.
- Mention the shared size (${sizeLabel}) once, near the top.
- If it's genuinely true from the item names, a brief line on why these particular items work well together (matching style, versatile basics, ideal wardrobe refresh, popular size) can help - but only state something you can actually see in the names above, never invent a theme that isn't there.
- Close with a short, natural nudge to buy as a bundle - postage is cheaper per item bought together, and/or the saving mentioned above if pricing was given. Keep it low-key, not pushy or salesy-sounding.
- Friendly, natural reseller tone - like a person actually wrote it, not an AI. No phrases like "as listed above" or "as shown".
- Do NOT mention condition, flaws, or wear - the seller adds that themselves. Do NOT invent any fact (brand, material, colour, price) that isn't already given above.

Respond with ONLY a JSON object, no markdown fences, no commentary:
{
  "title": "short natural bundle title",
  "description": "3-5 sentence description that sells the bundle - what's included, the size, why buy together, ready to paste straight into a Vinted listing"
}`;
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "4mb",
    },
  },
};

function extractJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error(`No JSON found in AI response. Got: "${text.slice(0, 200) || "(empty response)"}"`);
  }
  return JSON.parse(text.slice(start, end + 1));
}

// ---------- pricing math (deterministic, not left to the model) ----------

function percentile(sortedNums, p) {
  if (sortedNums.length === 0) return null;
  if (sortedNums.length === 1) return sortedNums[0];
  const idx = (p / 100) * (sortedNums.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sortedNums[lower];
  const weight = idx - lower;
  return sortedNums[lower] * (1 - weight) + sortedNums[upper] * weight;
}

function roundToNiceEnding(value) {
  if (value == null) return null;
  return Math.round(value * 2) / 2; // nearest 50p
}

// Builds the actual price recommendation from only the "strong" comparables
// the model identified - median as the headline number, a range from the
// spread of strong matches (min/max for a tiny sample, 25th-75th percentile
// once there's enough to make that meaningful), and a confidence tied
// directly to how many strong matches there actually were.
function computeComparablePricing(ebayResults, comparableScoresStr) {
  if (!Array.isArray(ebayResults) || ebayResults.length === 0) return null;
  if (typeof comparableScoresStr !== "string" || !comparableScoresStr.trim()) return null;

  const priceById = new Map(
    ebayResults.filter((r) => typeof r.priceValue === "number" && !isNaN(r.priceValue)).map((r) => [r.id, r.priceValue])
  );
  const strongPrices = comparableScoresStr
    .split(",")
    .map((pair) => pair.trim().split(":"))
    .filter(([id, tier]) => id && tier && tier.trim().toLowerCase() === "strong")
    .map(([id]) => priceById.get(id.trim()))
    .filter((p) => typeof p === "number" && !isNaN(p))
    .sort((a, b) => a - b);

  if (strongPrices.length === 0) {
    return { comparable_count: 0, price_confidence: "Low" };
  }

  const median = percentile(strongPrices, 50);
  const useMinMax = strongPrices.length < 4;
  const low = useMinMax ? strongPrices[0] : percentile(strongPrices, 25);
  const high = useMinMax ? strongPrices[strongPrices.length - 1] : percentile(strongPrices, 75);

  return {
    price_low: Math.round(low),
    price_high: Math.round(high),
    recommended_price: roundToNiceEnding(median),
    comparable_count: strongPrices.length,
    price_confidence: strongPrices.length >= 6 ? "High" : strongPrices.length >= 3 ? "Medium" : "Low",
  };
}

// ---------- eBay Browse API ----------

let cachedEbayToken = null;
let cachedEbayTokenExpiry = 0;

async function getEbayToken() {
  if (cachedEbayToken && Date.now() < cachedEbayTokenExpiry) {
    return cachedEbayToken;
  }

  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const creds = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${creds}`,
    },
    body: "grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope",
  });
  if (!res.ok) {
    console.error("eBay token request failed:", await res.text());
    return null;
  }
  const data = await res.json();
  if (!data.access_token) return null;

  cachedEbayToken = data.access_token;
  // expires_in is in seconds; refresh a bit early to be safe
  cachedEbayTokenExpiry = Date.now() + (data.expires_in || 7200) * 1000 - 60000;
  return cachedEbayToken;
}

async function searchEbay(query, token) {
  const url = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(query)}&limit=25`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-EBAY-C-MARKETPLACE-ID": "EBAY_GB",
    },
  });
  if (!res.ok) {
    console.error("eBay search failed:", await res.text());
    return { results: [], total: null };
  }
  const data = await res.json();
  const results = (data.itemSummaries || []).map((item, i) => ({
    id: `L${i + 1}`,
    title: item.title,
    priceValue: item.price ? Number(item.price.value) : null,
    price: item.price ? `£${item.price.value}` : "?",
    condition: item.condition || "unknown",
  }));
  return { results, total: typeof data.total === "number" ? data.total : null };
}

async function getEbayMarketData(query) {
  try {
    const token = await getEbayToken();
    if (!token) return { block: null, total: null, results: [] };
    const { results, total } = await searchEbay(query, token);
    if (results.length === 0) return { block: null, total, results: [] };
    const block = results.map((r) => `- [${r.id}] "${r.title}" - ${r.price} (${r.condition})`).join("\n");
    return { block, total, results };
  } catch (err) {
    console.error("eBay Browse API lookup failed:", err);
    return { block: null, total: null, results: [] };
  }
}

// ---------- handler ----------

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Server is missing ANTHROPIC_API_KEY" });
  }

  const { photos, mode, confirmedFields, ebaySearchQuery, bundleItems, bundleCategory, bundleSizeLabel, bundlePricing } = req.body || {};

  if (mode === "bundle") {
    if (!Array.isArray(bundleItems) || bundleItems.length < 2) {
      return res.status(400).json({ error: "Need at least 2 items to write a bundle listing" });
    }
    try {
      const promptText = buildBundlePrompt(bundleItems, bundleCategory || "items", bundleSizeLabel || "", bundlePricing);
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-5",
          max_tokens: 700,
          messages: [{ role: "user", content: [{ type: "text", text: promptText }] }],
        }),
      });
      if (!response.ok) {
        const detail = await response.text();
        console.error("Anthropic API error (bundle):", response.status, detail);
        let reason = detail.slice(0, 200);
        try {
          reason = JSON.parse(detail)?.error?.message || reason;
        } catch {}
        return res.status(502).json({ error: `AI request failed (Anthropic HTTP ${response.status}: ${reason})` });
      }
      const data = await response.json();
      const text = (data.content || []).map((b) => b.text || "").join("\n").trim();
      let result;
      try {
        result = extractJson(text);
      } catch (parseErr) {
        console.error("Bundle JSON extraction failed. Raw text:", text);
        return res.status(502).json({ error: parseErr.message });
      }
      return res.status(200).json(result);
    } catch (err) {
      console.error("Bundle analyze route failed:", err);
      return res.status(500).json({ error: "Internal error writing bundle listing" });
    }
  }

  if (!Array.isArray(photos) || photos.length === 0) {
    return res.status(400).json({ error: "No photos provided" });
  }
  if (mode !== "quick" && mode !== "full") {
    return res.status(400).json({ error: "mode must be 'quick' or 'full'" });
  }

  try {
    // Photos arrive as either a real http(s) Storage URL (the normal case -
    // see uploadPhotoToStorage in index.js) or, for older unmigrated items,
    // a raw base64 data URL. URLs are handed to Anthropic as a "url" image
    // source, so Anthropic's own servers fetch the full-resolution original
    // straight from Storage - the photo bytes never have to travel through
    // this request body at all, which is what actually keeps this route
    // clear of Vercel's hard 4.5MB serverless request-body limit. Only the
    // rare legacy base64 photo still needs to be embedded inline.
    const imageBlocks = photos.map((p) => {
      if (typeof p === "string" && p.startsWith("data:")) {
        return {
          type: "image",
          source: {
            type: "base64",
            media_type: "image/jpeg",
            data: p.split(",")[1],
          },
        };
      }
      return {
        type: "image",
        source: { type: "url", url: p },
      };
    });

    const isQuick = mode === "quick";

    let ebayListingsBlock = null;
    let ebayTotalListings = null;
    let ebayResults = [];
    if (!isQuick && ebaySearchQuery) {
      const marketData = await getEbayMarketData(ebaySearchQuery);
      ebayListingsBlock = marketData.block;
      ebayTotalListings = marketData.total;
      ebayResults = marketData.results || [];
    }

    const hasEbayData = !!ebayListingsBlock;
    const promptText = isQuick
      ? QUICK_PROMPT
      : buildFullUserPrompt(confirmedFields, ebayListingsBlock, ebayTotalListings);

    const body = {
      // Quick pass used to run on Haiku to keep it cheap, but that's what was
      // causing wrong (not just missing) sizes - e.g. reading "36A" off a
      // label as "36B", a fine-print misread Haiku is meaningfully more prone
      // to than Sonnet. A wrong size slips straight through (the app only
      // blocks on a MISSING size, not a wrong one) and ships in the listing,
      // which is worse than the item just needing a manual size entry. Sizes
      // must auto-fill correctly with no manual confirm step, so accuracy
      // beats the small cost saving here - both passes run on Sonnet now.
      model: "claude-sonnet-5",
      // Raised from 4000 - with two titles plus everything else now asked
      // for, a response that ran long (more eBay comparables to score, a
      // longer notes field, a bigger verify_before_listing list) could hit
      // the old ceiling and get cut off mid-JSON with no closing brace,
      // which is what the "No JSON found in AI response" error actually
      // was (see the stop_reason check below for a clearer message on this
      // specific failure going forward).
      max_tokens: isQuick ? 300 : 6000,
      messages: [
        {
          role: "user",
          content: [...imageBlocks, { type: "text", text: promptText }],
        },
      ],
    };
    // Full mode's instructions are long but identical on every call bar the
    // hasEbayData boolean (see buildFullSystemPrompt) - putting them in
    // `system` with cache_control lets Anthropic reuse that block cheaply
    // across calls instead of re-billing the whole instruction set as fresh
    // input every single item. The quick pass's prompt is short enough that
    // caching it wouldn't earn back the overhead, so it's left as a plain
    // user-message prompt like before.
    if (!isQuick) {
      body.system = [
        { type: "text", text: buildFullSystemPrompt(hasEbayData), cache_control: { type: "ephemeral" } },
      ];
    }
    // Capped at two searches to control cost: one optional search to look
    // up a style/item code off a label (finds the original retail listing -
    // real name, brand, RRP), and one for Vinted/eBay comps. If we already
    // have real eBay data it still needs the comps search, so keep the
    // budget at 2 either way - the model is told in the prompt not to spend
    // the second one unless it's actually useful.
    if (!isQuick) {
      body.tools = [{ type: "web_search_20250305", name: "web_search", max_uses: 2 }];
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error("Anthropic API error:", response.status, detail);
      let reason = detail.slice(0, 200);
      try {
        const parsed = JSON.parse(detail);
        reason = parsed?.error?.message || reason;
      } catch {}
      return res.status(502).json({ error: `AI request failed (Anthropic HTTP ${response.status}: ${reason})` });
    }

    const data = await response.json();
    // If the model ran out of output budget before finishing, the response
    // gets cut off mid-JSON (no closing brace) and extractJson below would
    // otherwise throw the generic, confusing "No JSON found" error. Catch
    // this specific case here with a clearer message instead.
    if (data.stop_reason === "max_tokens") {
      console.error("Anthropic response hit max_tokens before finishing:", JSON.stringify(data).slice(0, 500));
      return res.status(502).json({
        error:
          "The AI's response got cut off before it finished (ran out of output budget) - this usually clears up on Retry. If it keeps happening on this item, let me know.",
      });
    }
    const text = (data.content || [])
      .map((b) => b.text || "")
      .join("\n")
      .trim();

    let result;
    try {
      result = extractJson(text);
    } catch (parseErr) {
      console.error("JSON extraction failed. Raw text:", text);
      return res.status(502).json({ error: parseErr.message });
    }
    if (!isQuick) {
      result._usedRealEbayData = !!ebayListingsBlock;
      result._ebayTotalListings = ebayTotalListings;

      const pricing = computeComparablePricing(ebayResults, result.ebay_comparable_scores);
      if (pricing) {
        result.comparable_count = pricing.comparable_count;
        result.price_confidence = pricing.price_confidence;
        if (pricing.comparable_count > 0) {
          // Strong comparables found - these override the model's own
          // estimate, which was only ever a fallback for this case.
          result.estimated_price_low = pricing.price_low;
          result.estimated_price_high = pricing.price_high;
          result.recommended_price = pricing.recommended_price;
          if (pricing.comparable_count < 3) {
            result.notes = `${result.notes ? result.notes + " " : ""}Only ${pricing.comparable_count} strong eBay comparable(s) found - price is a rough steer, worth checking manually.`;
          }
        } else {
          result.notes = `${result.notes ? result.notes + " " : ""}No strong eBay comparables found among the listings pulled - price falls back to the AI's own general estimate.`;
        }
      }
      // ebay_comparable_scores was only needed for the price math above -
      // no reason to store the raw per-listing tiers on the item itself.
      delete result.ebay_comparable_scores;
    }
    return res.status(200).json(result);
  } catch (err) {
    console.error("Analyze route failed:", err);
    return res.status(500).json({ error: "Internal error analysing item" });
  }
}
