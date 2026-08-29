const PROMPT = `You are helping a UK reseller create a marketplace listing from photos of a single secondhand item. The photos follow this order where present: front, then back, then a label/tag close-up, then a condition/flaw detail, then an extra shot. The label/tag close-up, if present, is deliberately a close-up of any label or tag — treat it as your primary source for size, material, and model information; read it carefully rather than guessing from the garment's general appearance.

Step 1: Identify only what you can directly observe. Visible brand logos, colours, and anything legible on a tag or printed on the item itself count as observed. An exact product line name, precise size, material composition, or model number does NOT count as observed unless you can actually read it on a visible label/tag in the photos — do not fill these in from a guess at what "looks like" a typical product of that brand. If you cannot read a size or material tag, that is unknown, not a fact to assume.

Step 2: Use web search to look up the item on eBay UK and/or Vinted to see what comparable items (same or similar brand/model/condition) are actually selling for right now. Prioritize sold/completed listings over active asking prices — active listings on both platforms are consistently priced above what items actually sell for, since sellers list high and negotiate down or wait for offers. If you can only find active asking prices, treat those as a ceiling, not a target: price the item toward the lower third of that range rather than the middle or top. Do not guess the price from memory — base it on what you find in search, and err conservative rather than optimistic.

Step 3: Respond with ONLY a JSON object as your final message, no markdown fences, no commentary before or after it, in exactly this shape:

{
  "title": "short punchy resale title, under 80 characters. Only state details you actually observed per Step 1 — if you're not sure of the exact product line/model, use a generic accurate description instead (e.g. 'Men's Navy T-Shirt' not a specific product line you can't confirm)",
  "description": "2-4 sentence listing description containing ONLY visually confirmed facts and any visible wear/flaws. Do not state a size, material, or exact model unless it's legible in the photos",
  "category": "best-fit resale category, e.g. Men's Trainers, Vintage Coats, Kids Toys",
  "condition": "one of: New with tags, New without tags, Excellent, Good, Fair, Well worn",
  "brand": "brand name if visible, else empty string",
  "estimated_price_low": number (GBP, no symbol, based on real comparable listings you found),
  "estimated_price_high": number (GBP, no symbol, based on real comparable listings you found),
  "confidence": "high, medium, or low - your confidence in the identification AND the price data",
  "verify_before_listing": ["a list of specific things the seller should personally check before publishing because they were NOT confirmable from the photos - e.g. 'Exact size - no label visible in photos', 'Fabric composition - no care tag visible'. Leave as an empty array only if everything material was genuinely visible and confirmed."],
  "notes": "state what you searched for and what comparable listings/prices you actually found. If you could not find good comparables, say so plainly and set confidence to low."
}

Never invent a price, size, material, or product line. Anything you didn't actually see clearly goes in verify_before_listing, not into the title or description as stated fact.`;

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "4mb",
    },
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Server is missing ANTHROPIC_API_KEY" });
  }

  const { photos } = req.body || {};
  if (!Array.isArray(photos) || photos.length === 0) {
    return res.status(400).json({ error: "No photos provided" });
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

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 2500,
        messages: [
          {
            role: "user",
            content: [...imageBlocks, { type: "text", text: PROMPT }],
          },
        ],
        tools: [{ type: "web_search_20250305", name: "web_search" }],
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error("Anthropic API error:", detail);
      return res.status(502).json({ error: "AI request failed" });
    }

    const data = await response.json();
    const text = (data.content || [])
      .map((b) => b.text || "")
      .join("\n")
      .trim();

    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1) {
      console.error("No JSON in response. Raw text:", text);
      const snippet = text.slice(0, 200) || "(empty response)";
      return res.status(502).json({ error: `No JSON found in AI response. Got: "${snippet}"` });
    }

    let result;
    try {
      result = JSON.parse(text.slice(start, end + 1));
    } catch (parseErr) {
      console.error("JSON parse failed. Raw text:", text);
      const snippet = text.slice(0, 200);
      return res.status(502).json({ error: `Couldn't parse AI response as JSON. Got: "${snippet}"` });
    }
    return res.status(200).json(result);
  } catch (err) {
    console.error("Analyze route failed:", err);
    return res.status(500).json({ error: "Internal error analysing item" });
  }
}
