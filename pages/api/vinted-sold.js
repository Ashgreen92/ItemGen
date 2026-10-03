// Place this file at: pages/api/vinted-sold.js
//
// Receives a POST from a Power Automate flow whenever a new email arrives
// in your Hotmail inbox from Vinted, and - only on a confident match -
// marks the matching item as sold automatically, the same way clicking
// "Mark as sold" in the app does (same fields: status, sold_platform,
// sold_at, quantity_sold, sale_price). Every call is logged to
// `email_sold_log` regardless of outcome, so a miss or a skipped/ambiguous
// email is visible in Supabase rather than silently lost.
//
// Deliberately cautious: this only ever auto-marks stock as sold when the AI
// is genuinely confident it's both a real sale AND a single unambiguous item
// match - anything less just gets logged for you to check.
//
// Needs the Vercel env var VINTED_WEBHOOK_SECRET (any long random string),
// sent by Power Automate in an "x-webhook-secret" header.

import { supabase } from "../../lib/supabaseClient";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const secret = req.headers["x-webhook-secret"];
  if (!secret || secret !== process.env.VINTED_WEBHOOK_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { subject, body, from } = req.body || {};
  if (!subject && !body) {
    return res.status(400).json({ error: "No email subject/body provided" });
  }

  // Genuine Vinted emails always come from an address ending @vinted.com.
  if (from && !String(from).toLowerCase().includes("@vinted.com")) {
    await logAttempt({ subject, body, action: "ignored_not_vinted" });
    return res.status(200).json({ action: "ignored_not_vinted" });
  }

  try {
    // Only match against items actually listed on Vinted and not already
    // fully sold.
    const { data: candidates, error: fetchError } = await supabase
      .from("items")
      .select("id, title, vinted_title, size, quantity, quantity_sold")
      .eq("vinted_listed", true)
      .neq("status", "sold");
    if (fetchError) throw fetchError;

    if (!candidates || candidates.length === 0) {
      await logAttempt({ subject, body, action: "no_candidates" });
      return res.status(200).json({ action: "no_candidates" });
    }

    const match = await matchEmailToItem(subject, body, candidates);

    if (!match.is_sold_notification) {
      await logAttempt({ subject, body, action: "ignored_not_sold", notes: match.reasoning });
      return res.status(200).json({ action: "ignored_not_sold" });
    }

    if (!match.matched_item_id || match.confidence !== "high") {
      await logAttempt({
        subject,
        body,
        action: "needs_review",
        matched_item_id: match.matched_item_id || null,
        confidence: match.confidence,
        notes: match.reasoning,
      });
      return res.status(200).json({ action: "needs_review" });
    }

    const item = candidates.find((c) => c.id === match.matched_item_id);
    if (!item) {
      await logAttempt({ subject, body, action: "needs_review", notes: "Matched id wasn't in the candidate list" });
      return res.status(200).json({ action: "needs_review" });
    }

    // Same math as the app's own confirmSold - one unit sold per email,
    // stays "ready" if there's still stock left, otherwise "sold".
    const totalQty = item.quantity || 1;
    const priorSold = item.quantity_sold || 0;
    const quantity_sold = Math.min(totalQty, priorSold + 1);
    const remaining = totalQty - quantity_sold;
    const status = remaining <= 0 ? "sold" : "ready";

    const updates = {
      status,
      sold_platform: "Vinted",
      sold_at: new Date().toISOString(),
      quantity_sold,
    };
    if (match.sold_price != null) updates.sale_price = match.sold_price;

    const { error: updateError } = await supabase.from("items").update(updates).eq("id", item.id);
    if (updateError) throw updateError;

    await logAttempt({
      subject,
      body,
      action: "marked_sold",
      matched_item_id: item.id,
      confidence: match.confidence,
      notes: match.reasoning,
    });

    return res.status(200).json({ action: "marked_sold", item_id: item.id });
  } catch (err) {
    console.error("vinted-sold webhook failed:", err);
    await logAttempt({ subject, body, action: "error", notes: err.message || String(err) }).catch(() => {});
    return res.status(500).json({ error: "Internal error processing email" });
  }
}

async function logAttempt({ subject, body, action, matched_item_id = null, confidence = null, notes = null }) {
  try {
    await supabase.from("email_sold_log").insert({
      subject: subject || null,
      body_snippet: (body || "").slice(0, 2000),
      action,
      matched_item_id,
      confidence,
      notes,
    });
  } catch (err) {
    console.error("Failed to write email_sold_log:", err);
  }
}

// Uses the same model already used for listing generation to read the email
// and decide (a) is this actually a "sold" notification at all, and (b)
// which currently-listed item it refers to, if any, with a confidence level.
async function matchEmailToItem(subject, body, candidates) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const candidateList = candidates
    .map((c) => `- id: ${c.id} | eBay title: ${c.title || ""} | Vinted title: ${c.vinted_title || ""} | size: ${c.size || ""}`)
    .join("\n");

  const prompt = `You're helping a UK reseller automatically detect when a Vinted email means one of their currently-listed items has sold.

Email subject: ${subject || "(none)"}
Email body:
${(body || "").slice(0, 4000)}

Currently listed (unsold) items to match against:
${candidateList}

Decide:
1. Is this email actually notifying that an item SOLD (not an offer, a price-drop reminder, a message, a review request, or anything else)?
2. If it is, which item id above (if any) does it clearly refer to? Vinted sold emails usually name the item title and sometimes the price - match on that, allowing for the email possibly truncating or slightly rewording the title.
3. How confident are you in that specific match? Only say "high" if you're genuinely sure it's that exact item and not, say, one of two similar items in different sizes - if there's real ambiguity, say "medium" or "low" rather than guessing.
4. If a sold price is stated in the email, what is it (GBP, number only)?

Respond with ONLY a JSON object, no markdown fences, no commentary:
{
  "is_sold_notification": true or false,
  "matched_item_id": "the id string from the list above, or null if no clear match or not a sold email",
  "confidence": "high, medium, or low",
  "sold_price": number or null,
  "reasoning": "one short sentence explaining the decision"
}`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-5",
      max_tokens: 400,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`AI match request failed (HTTP ${response.status}): ${detail.slice(0, 200)}`);
  }

  const data = await response.json();
  const text = (data.content || []).map((b) => b.text || "").join("\n").trim();
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON found in AI match response");
  return JSON.parse(jsonMatch[0]);
}
