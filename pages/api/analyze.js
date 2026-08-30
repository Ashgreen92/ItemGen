const QUICK_PROMPT = `Look at these photos of a single secondhand item. Answer ONLY with a JSON object, no markdown fences, no commentary:

{
  "size_applicable": true or false. True only if this is clothing or footwear where a size is a normal, expected listing detail. False for anything else (electronics, homeware, toys, accessories, etc.),
  "size": "the exact size if you can read it on a visible label/tag in the photos, else null. Only fill this in if actually legible - never guess.",
  "search_query": "a short, accurate eBay search phrase for this item - brand + item type + any distinguishing detail visible (e.g. 'Nike Air Max 90 trainers mens', 'Emporio Armani navy t-shirt'). No fluff, no size/condition words, just what a buyer would type to find this item."
}`;

function buildFullPrompt(confirmedFields, ebayListingsBlock, ebayTotalListings) {
  const cf = confirmedFields || {};
  let factsNote = "";
  const lines = [];
  if (cf.size) lines.push(`Size: ${cf.size}`);
  if (cf.category) lines.push(`Category/item type: ${cf.category}`);
  if (cf.condition) lines.push(`Condition: ${cf.condition}`);
  if (cf.brand) lines.push(`Brand: ${cf.brand}`);
  if (lines.length) {
    factsNote = `\n\nThe seller has personally corrected/confirmed the following - treat these as verified fact, not something to guess or second-guess, and write the title/description consistent with them:\n- ${lines.join("\n- ")}`;
  }

  const totalNote = ebayTotalListings != null
    ? ` eBay reports approximately ${ebayTotalListings} total active listings currently matching this search - a high number suggests a competitive/saturated market, a low number suggests this is a more niche item; factor this into your demand read.`
    : "";

  const pricingStep = ebayListingsBlock
    ? `Step 2: Below are REAL current eBay UK active listings for this item, retrieved directly from eBay's own API (not a web search) - these are genuine, live comparable items:

${ebayListingsBlock}

Use these as your primary basis for estimated_price_low/estimated_price_high. These are active asking prices, not confirmed sold prices, so still price toward the lower third of what you see rather than the middle or top - sellers list high and negotiate down. If the results above don't look like genuine matches for this item, say so in notes and fall back to your own judgement with lower confidence.${totalNote}

You also have exactly ONE web search available - use it specifically to check Vinted UK for what this item goes for there, since Vinted has no API. Also use whatever you see (in the eBay data above and your Vinted search) to judge demand: many results / recent activity = high demand, few or stale results = low demand.`
    : `Step 2: You have exactly ONE web search available - use it wisely. Search eBay UK and/or Vinted for comparable items (same or similar brand/model/condition) to see what they're actually selling for right now, on BOTH platforms if your search results cover both. Prioritize sold/completed listings over active asking prices — active listings on both platforms are consistently priced above what items actually sell for, since sellers list high and negotiate down or wait for offers. If your search only turns up active asking prices, treat those as a ceiling, not a target: price toward the lower third of that range rather than the middle or top. Do not guess any price from memory — base it on what you find in search, and err conservative rather than optimistic. Also note roughly how much genuine buyer interest/turnover you saw for this kind of item (many recent sold listings = high demand; mostly old unsold active listings = low demand) - this feeds the "demand" field below.`;

  return `You are helping a UK reseller create a marketplace listing from photos of a single secondhand item. The photos follow this order where present: front, then back, then a label/tag close-up, then a condition/flaw detail, then an extra shot. The label/tag close-up, if present, is deliberately a close-up of any label or tag — treat it as your primary source for material and model information; read it carefully rather than guessing from the garment's general appearance.

Step 1: Identify only what you can directly observe. Visible brand logos, colours, and anything legible on a tag or printed on the item itself count as observed. An exact product line name, material composition, or model number does NOT count as observed unless you can actually read it on a visible label/tag in the photos — do not fill these in from a guess at what "looks like" a typical product of that brand.${factsNote}

${pricingStep}

Step 3: Respond with ONLY a JSON object as your final message, no markdown fences, no commentary before or after it, in exactly this shape:

{
  "title": "short punchy resale title, under 80 characters. Only state details you actually observed per Step 1${lines.length ? " (the seller-confirmed facts above may be included)" : ""} — if you're not sure of the exact product line/model, use a generic accurate description instead (e.g. 'Men's Navy T-Shirt' not a specific product line you can't confirm)",
  "description": "2-4 sentence listing description containing ONLY visually confirmed positive facts${lines.length ? " plus the seller-confirmed facts above" : ""} and any visible wear/flaws. Write it the way a person selling the item would write it - state facts plainly (e.g. 'Size 18½. Polyester-cotton blend.') Never narrate how you know something (no phrases like 'tag confirms', 'as shown in photos', 'visible in the images', 'label indicates', 'seller confirmed') - that reads as an AI wrote it, not a seller. Just as important: NEVER state what ISN'T visible or wasn't included (no 'no label visible', 'no size tag shown', 'material unknown', etc.) - a real seller's listing only states what the item IS, never what information is missing. Anything not confirmable goes in verify_before_listing instead, never in the description",
  "category": "best-fit resale category, e.g. Men's Trainers, Vintage Coats, Kids Toys.${cf.category ? " The seller has already confirmed this is: " + cf.category + " - use that exact value." : " Be careful with garment TYPE specifically (top vs dress vs jumpsuit vs romper etc.) - only state a specific type if the photos clearly show the item's full length/silhouette. If you can't see enough of the garment to be sure whether it's cropped, full-length, one-piece, etc., use the safest/most generic accurate label and add a note to verify_before_listing rather than confidently asserting the wrong type"}",
  "condition": "one of: New with tags, New without tags, Excellent, Good, Fair, Well worn${cf.condition ? " (seller has confirmed: " + cf.condition + " - use that)" : ""}",
  "brand": "brand name if visible, else empty string${cf.brand ? " (seller has confirmed: " + cf.brand + " - use that)" : ""}",
  "estimated_price_low": number (GBP, no symbol),
  "estimated_price_high": number (GBP, no symbol),
  "vinted_price_low": number (GBP, no symbol - what similar items actually go for specifically on Vinted),
  "vinted_price_high": number (GBP, no symbol),
  "demand": "high, medium, or low",
  "listing_recommendation": "one short sentence of practical advice, e.g. 'List on eBay first, strong demand' or 'Low value and low demand - consider listing directly on Vinted at a low price rather than eBay' or 'Similar value on both platforms - either works'",
  "confidence": "high, medium, or low - your confidence in the identification AND the price data",
  "verify_before_listing": ["a list of specific things the seller should personally check before publishing because they were NOT confirmable from the photos - e.g. 'Fabric composition - no care tag visible'. Leave as an empty array only if everything material was genuinely visible and confirmed."],
  "notes": "state what real eBay data / search you used and what you found. If you could not find good comparables, say so plainly and set confidence to low."
}

Never invent a price, material, or product line. Anything you didn't actually see clearly goes in verify_before_listing, not into the title or description as stated fact.`;
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

// ---------- eBay Browse API ----------

async function getEbayToken() {
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
  return data.access_token || null;
}

async function searchEbay(query, token) {
  const url = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(query)}&limit=8`;
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
  const results = (data.itemSummaries || []).map((item) => ({
    title: item.title,
    price: item.price ? `£${item.price.value}` : "?",
    condition: item.condition || "unknown",
  }));
  return { results, total: typeof data.total === "number" ? data.total : null };
}

async function getEbayMarketData(query) {
  try {
    const token = await getEbayToken();
    if (!token) return { block: null, total: null };
    const { results, total } = await searchEbay(query, token);
    if (results.length === 0) return { block: null, total };
    const block = results.map((r) => `- "${r.title}" - ${r.price} (${r.condition})`).join("\n");
    return { block, total };
  } catch (err) {
    console.error("eBay Browse API lookup failed:", err);
    return { block: null, total: null };
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

  const { photos, mode, confirmedFields, ebaySearchQuery } = req.body || {};
  if (!Array.isArray(photos) || photos.length === 0) {
    return res.status(400).json({ error: "No photos provided" });
  }
  if (mode !== "quick" && mode !== "full") {
    return res.status(400).json({ error: "mode must be 'quick' or 'full'" });
  }

  try {
    const imageBlocks = photos.map((dataUrl) => ({
      type: "image",
      source: {
        type: "base64",
        media_type: "image/jpeg",
        data: dataUrl.split(",")[1],
      },
    }));

    const isQuick = mode === "quick";

    let ebayListingsBlock = null;
    let ebayTotalListings = null;
    if (!isQuick && ebaySearchQuery) {
      const marketData = await getEbayMarketData(ebaySearchQuery);
      ebayListingsBlock = marketData.block;
      ebayTotalListings = marketData.total;
    }

    const promptText = isQuick ? QUICK_PROMPT : buildFullPrompt(confirmedFields, ebayListingsBlock, ebayTotalListings);

    const body = {
      model: "claude-sonnet-5",
      max_tokens: isQuick ? 300 : 2500,
      messages: [
        {
          role: "user",
          content: [...imageBlocks, { type: "text", text: promptText }],
        },
      ],
    };
    // Only give the model web search if we don't already have real eBay data -
    // if we do, it still needs ONE search for Vinted, so keep it either way,
    // just capped at one use to control cost.
    if (!isQuick) {
      body.tools = [{ type: "web_search_20250305", name: "web_search", max_uses: 1 }];
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
    }
    return res.status(200).json(result);
  } catch (err) {
    console.error("Analyze route failed:", err);
    return res.status(500).json({ error: "Internal error analysing item" });
  }
}
