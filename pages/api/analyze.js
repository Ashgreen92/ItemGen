const PROMPT = `You are helping a UK reseller create a marketplace listing from photos of a single secondhand item. Look at all the photos together (they show the same item from different angles).

Step 1: Identify the item as precisely as you can from the photos — brand, model, size, colour, any text/logos visible.

Step 2: Use web search to look up that item on eBay UK and/or Vinted to see what comparable items (same or similar brand/model/condition) are actually listed or selling for right now. Do not guess the price from memory — base it on what you find in search.

Step 3: Respond with ONLY a JSON object as your final message, no markdown fences, no commentary before or after it, in exactly this shape:

{
  "title": "short punchy resale title, under 80 characters, include brand/model/size/colour if visible",
  "description": "2-4 sentence listing description, honest, mention any visible wear, flaws or missing parts",
  "category": "best-fit resale category, e.g. Men's Trainers, Vintage Coats, Kids Toys",
  "condition": "one of: New with tags, New without tags, Excellent, Good, Fair, Well worn",
  "brand": "brand name if identifiable, else empty string",
  "estimated_price_low": number (GBP, no symbol, based on real comparable listings you found),
  "estimated_price_high": number (GBP, no symbol, based on real comparable listings you found),
  "confidence": "high, medium, or low - your confidence in the identification AND the price data",
  "notes": "state what you searched for and what comparable listings/prices you actually found. If you could not find good comparables or could not confidently identify the item, say so plainly here and set confidence to low."
}

Never invent a price. If search doesn't turn up solid comparables, give a wider range, say so in notes, and lower your confidence rather than presenting a made-up figure as reliable.`;

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
        max_tokens: 1000,
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
      return res.status(502).json({ error: "No JSON found in AI response" });
    }

    const result = JSON.parse(text.slice(start, end + 1));
    return res.status(200).json(result);
  } catch (err) {
    console.error("Analyze route failed:", err);
    return res.status(500).json({ error: "Internal error analysing item" });
  }
}
