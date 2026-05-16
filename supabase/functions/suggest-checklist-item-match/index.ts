import { createClient } from "npm:@supabase/supabase-js@2";

import { buildCorsHeaders, buildJsonHeaders } from "../_shared/trustedOrigin.ts";
import { safeErrorResponse }                  from "../_shared/safeErrorResponse.ts";
import {
  checkAndReserveAiCall,
  clampAiInsightPayload,
  recordAiTokens,
  buildUntrustedJsonPrompt,
} from "../_shared/aiSafety.ts";

// ── Environment ────────────────────────────────────────────────────────────

const SUPABASE_URL              = Deno.env.get("SUPABASE_URL")              || "";
const SUPABASE_ANON_KEY         = Deno.env.get("SUPABASE_ANON_KEY")         || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const ALLOWED_APP_ORIGINS       = Deno.env.get("ALLOWED_APP_ORIGINS")       || "";
const OPENAI_API_KEY            = Deno.env.get("OPENAI_API_KEY")            || "";
const OPENAI_BASE_URL           = (Deno.env.get("OPENAI_BASE_URL") || "https://api.openai.com/v1").replace(/\/+$/, "");
const OPENAI_MODEL              = Deno.env.get("OASIS_AI_MODEL") || Deno.env.get("OPENAI_MODEL") || "gpt-4.1-mini";

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ── Checklist item keys and their display titles ───────────────────────────

const CHECKLIST_ITEMS = [
  { key: "lease_agreement",         title: "Umowa najmu okazjonalnego" },
  { key: "notarial_declaration",    title: "Oświadczenie notarialne najemcy" },
  { key: "alternative_address_decl",title: "Oświadczenie o adresie zastępczym" },
  { key: "owner_consent",           title: "Zgoda właściciela nieruchomości zastępczej" },
  { key: "tax_office_notification", title: "Zgłoszenie do urzędu skarbowego" },
  { key: "tax_office_deadline",     title: "Termin zgłoszenia US (14 dni)" },
  { key: "tax_office_proof",        title: "Dowód złożenia zgłoszenia do US" },
  { key: "handover_protocol",       title: "Protokół zdawczo-odbiorczy" },
  { key: "deposit_confirmation",    title: "Potwierdzenie wpłaty kaucji" },
  { key: "meter_readings",          title: "Odczyty liczników" },
];

// ── Name-based suggestion (no AI, no extraction required) ─────────────────
// Returns suggestions based on document filename and tags only.

type Suggestion = {
  item_key:   string;
  confidence: "high" | "medium" | "low";
  reasoning:  string;
};

function suggestByName(docName: string, tags: string[]): Suggestion[] {
  const name = docName.toLowerCase();
  const tagSet = new Set((tags || []).map((t) => String(t).toUpperCase()));
  const results: Suggestion[] = [];

  // Lease agreement
  if (
    tagSet.has("UMOWA") ||
    name.includes("umowa") || name.includes("najem") || name.includes("lease")
  ) {
    results.push({
      item_key:   "lease_agreement",
      confidence: tagSet.has("UMOWA") ? "high" : "medium",
      reasoning:  "Nazwa pliku lub tag sugeruje umowę najmu.",
    });
  }

  // Notarial declaration
  if (
    name.includes("notarial") || name.includes("notariusz") ||
    name.includes("akt notarialny") || name.includes("oświadczenie notarialne")
  ) {
    results.push({
      item_key:   "notarial_declaration",
      confidence: "medium",
      reasoning:  "Nazwa pliku sugeruje oświadczenie notarialne.",
    });
  }

  // Alternative address declaration
  if (
    name.includes("adres zastępczy") || name.includes("alternative address") ||
    name.includes("oświadczenie adres")
  ) {
    results.push({
      item_key:   "alternative_address_decl",
      confidence: "medium",
      reasoning:  "Nazwa pliku sugeruje oświadczenie o adresie zastępczym.",
    });
  }

  // Owner consent
  if (
    name.includes("zgoda właściciela") || name.includes("owner consent") ||
    name.includes("zgoda na zamieszkanie")
  ) {
    results.push({
      item_key:   "owner_consent",
      confidence: "medium",
      reasoning:  "Nazwa pliku sugeruje zgodę właściciela nieruchomości zastępczej.",
    });
  }

  // Tax office
  if (
    name.includes("urząd skarbowy") || name.includes("us ") || name.includes(" us.") ||
    name.includes("naczelnik") || name.includes("zgłoszenie najmu") ||
    name.includes("tax office")
  ) {
    results.push({
      item_key:   "tax_office_notification",
      confidence: "medium",
      reasoning:  "Nazwa pliku sugeruje zgłoszenie do urzędu skarbowego.",
    });
    results.push({
      item_key:   "tax_office_proof",
      confidence: "low",
      reasoning:  "Dokument może być dowodem złożenia zgłoszenia do US — wymaga weryfikacji.",
    });
  }

  // Handover protocol
  if (
    tagSet.has("PROTOKOL") ||
    name.includes("protokół") || name.includes("protokol") ||
    name.includes("zdawczo") || name.includes("handover")
  ) {
    results.push({
      item_key:   "handover_protocol",
      confidence: tagSet.has("PROTOKOL") ? "high" : "medium",
      reasoning:  "Nazwa pliku lub tag sugeruje protokół zdawczo-odbiorczy.",
    });
  }

  // Deposit
  if (
    name.includes("kaucja") || name.includes("depozyt") || name.includes("deposit") ||
    name.includes("potwierdzenie wpłaty") || name.includes("kaucji")
  ) {
    results.push({
      item_key:   "deposit_confirmation",
      confidence: "medium",
      reasoning:  "Nazwa pliku sugeruje potwierdzenie wpłaty kaucji.",
    });
  }

  // Meter readings
  if (
    name.includes("licznik") || name.includes("odczyt") || name.includes("meter") ||
    name.includes("stan licznika") || name.includes("woda") || name.includes("prąd")
  ) {
    results.push({
      item_key:   "meter_readings",
      confidence: "medium",
      reasoning:  "Nazwa pliku sugeruje odczyty liczników.",
    });
  }

  return results;
}

// ── AI-based suggestion (requires extracted text) ─────────────────────────

const AI_SYSTEM_PROMPT = `You are a Polish property compliance assistant for Tenaqo.
Your task is to analyze a document's extracted text and suggest which Najem Okazjonalny
compliance checklist items the document appears to satisfy.

RULES:
- Return only items you are reasonably confident about. Do not guess.
- Set confidence to "high" only when the document clearly matches the item.
- Use "medium" when the document is probably the right type but not certain.
- Use "low" when the document might be relevant but you are not sure.
- Never state that a document legally satisfies a requirement — only suggest.
- All suggestions must say "review required" in spirit.
- You MUST NOT invent item keys not in the provided list.
- Return valid JSON only.`;

function buildSuggestionPrompt(
  extractedText: string,
  docName: string,
  availableItems: Array<{ key: string; title: string }>,
): string {
  const itemList = availableItems
    .map((i) => `  - "${i.key}": ${i.title}`)
    .join("\n");

  const payload = {
    document_name:    docName,
    extracted_text:   extractedText.slice(0, 8000),
    available_items:  availableItems.map((i) => i.key),
    item_descriptions: Object.fromEntries(availableItems.map((i) => [i.key, i.title])),
  };

  return buildUntrustedJsonPrompt(payload) +
    `\n\nAvailable checklist items:\n${itemList}\n\n` +
    `Return a JSON object: { "suggestions": [{ "item_key": string, "confidence": "high"|"medium"|"low", "reasoning": string }] }`;
}

function parseSuggestions(raw: unknown): Suggestion[] {
  if (!raw || typeof raw !== "object") return [];
  const obj = raw as Record<string, unknown>;
  const arr = Array.isArray(obj.suggestions) ? obj.suggestions : [];
  const validKeys = new Set(CHECKLIST_ITEMS.map((i) => i.key));
  return arr
    .filter((s): s is Suggestion =>
      typeof s === "object" && s !== null &&
      validKeys.has((s as Suggestion).item_key) &&
      ["high", "medium", "low"].includes((s as Suggestion).confidence)
    )
    .slice(0, 10);
}

// ── Main handler ───────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: buildCorsHeaders(req, ALLOWED_APP_ORIGINS) });
  }

  const respond = (payload: unknown, status = 200) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: buildJsonHeaders(req, ALLOWED_APP_ORIGINS),
    });

  try {
    if (req.method !== "POST") return respond({ error: "Method not allowed" }, 405);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return respond({ error: "Missing Authorization header" }, 401);

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return respond({ error: "Unauthorized" }, 401);

    const body        = await req.json().catch(() => ({}));
    const accountId   = String(body?.accountId   || "").trim();
    const documentId  = String(body?.documentId  || "").trim();
    const propertyId  = String(body?.propertyId  || "").trim();
    const tenantId    = String(body?.tenantId    || "").trim();

    if (!accountId || !documentId) {
      return respond({ error: "accountId and documentId are required" }, 400);
    }

    // Auth check
    const permRes = await userClient.rpc("assert_manage_account_access", { p_account_id: accountId });
    if (permRes.error) return respond({ error: "Not permitted" }, 403);

    // Load document metadata (name, tags, mime_type) using service_role (safe — account_id validated above)
    const { data: doc, error: docErr } = await admin
      .from("documents")
      .select("id, name, mime_type, tags, account_id")
      .eq("id", documentId)
      .eq("account_id", accountId)        // cross-account guard
      .maybeSingle();

    if (docErr || !doc) return respond({ error: "Document not found" }, 404);

    // Name-based suggestions always available
    const nameSuggestions = suggestByName(doc.name || "", doc.tags || []);

    // Determine which checklist items are still pending (filter suggestions to only pending items)
    const pendingItems: string[] = [];
    if (propertyId && tenantId) {
      const { data: items } = await userClient
        .from("compliance_checklist_items")
        .select("item_key, status")
        .eq("account_id", accountId)
        .eq("property_id", propertyId)
        .eq("tenant_id", tenantId)
        .eq("checklist_type", "najem_okazjonalny")
        .eq("market", "pl");

      if (items) {
        for (const item of items) {
          if (item.status === "pending") pendingItems.push(item.item_key);
        }
      }
    }

    // Try AI-based suggestion if extraction is available and OpenAI key is set
    if (!OPENAI_API_KEY) {
      return respond({
        suggestions: pendingItems.length > 0
          ? nameSuggestions.filter((s) => pendingItems.includes(s.item_key))
          : nameSuggestions,
        source: "name_match",
        disclaimer: "Suggested matches — review required. Not legal advice.",
      });
    }

    // Check feature gate for AI (uses ai_lease_auditor entitlement — Poland AI suggestions are Pro+)
    const featureRes = await userClient.rpc("assert_account_feature_access", {
      p_account_id: accountId,
      p_feature:    "ai_lease_auditor",
    });

    if (featureRes.error) {
      // Feature not available — return name-based only, no error
      return respond({
        suggestions: pendingItems.length > 0
          ? nameSuggestions.filter((s) => pendingItems.includes(s.item_key))
          : nameSuggestions,
        source:      "name_match",
        disclaimer:  "Suggested matches — review required. Not legal advice.",
      });
    }

    // Try to get the best extraction for this document
    const { data: extraction } = await userClient
      .from("document_extractions")
      .select("text_content, character_count, quality_flag, extractor")
      .eq("account_id", accountId)
      .eq("document_id", documentId)
      .eq("status", "completed")
      .gte("character_count", 100)
      .order("character_count", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!extraction?.text_content) {
      // No usable extraction — return name-based
      return respond({
        suggestions: pendingItems.length > 0
          ? nameSuggestions.filter((s) => pendingItems.includes(s.item_key))
          : nameSuggestions,
        source:     "name_match",
        disclaimer: "Suggested matches — review required. Not legal advice. Upload a PDF to enable AI-assisted suggestions.",
      });
    }

    // Reserve AI quota
    const quotaRes = await checkAndReserveAiCall({
      supabaseClient: admin,
      accountId,
      featureKey:     "ai_lease_auditor",
      aiCallType:     "pl_checklist_suggestion",
    });
    if (!quotaRes.allowed) {
      return respond({
        suggestions: nameSuggestions,
        source:      "name_match",
        disclaimer:  "AI quota reached. Showing name-based suggestions only. Not legal advice.",
      });
    }

    // Build prompt for AI
    const availableItems = CHECKLIST_ITEMS.filter(
      (i) => pendingItems.length === 0 || pendingItems.includes(i.key),
    );
    const prompt = buildSuggestionPrompt(extraction.text_content, doc.name, availableItems);

    // Call OpenAI
    const aiResponse = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({
        model:       OPENAI_MODEL,
        temperature: 0.1,
        max_tokens:  600,
        messages: [
          { role: "system", content: AI_SYSTEM_PROMPT },
          { role: "user",   content: prompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiResponse.ok) {
      // AI unavailable — graceful fallback to name-based
      return respond({
        suggestions: nameSuggestions,
        source:      "name_match",
        disclaimer:  "AI service unavailable. Showing name-based suggestions only. Not legal advice.",
      });
    }

    const aiJson = await aiResponse.json().catch(() => null);
    const rawContent = aiJson?.choices?.[0]?.message?.content;
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawContent || "{}");
    } catch {
      parsed = null;
    }

    const aiSuggestions = parseSuggestions(parsed);

    // Record token usage
    await recordAiTokens({
      supabaseClient: admin,
      accountId,
      featureKey:     "ai_lease_auditor",
      aiCallType:     "pl_checklist_suggestion",
      promptTokens:   aiJson?.usage?.prompt_tokens     ?? 0,
      completionTokens: aiJson?.usage?.completion_tokens ?? 0,
    }).catch(() => {});

    // Merge AI + name suggestions (AI takes priority, deduplicate by item_key)
    const seen = new Set<string>();
    const merged: Suggestion[] = [];
    for (const s of [...aiSuggestions, ...nameSuggestions]) {
      if (!seen.has(s.item_key)) {
        seen.add(s.item_key);
        merged.push(s);
      }
    }

    const clamped = clampAiInsightPayload({ suggestions: merged }, { maxItems: 10 });

    return respond({
      ...clamped,
      source:      aiSuggestions.length > 0 ? "openai" : "name_match",
      disclaimer:  "Suggested matches — review required. Not legal advice. AI may make errors.",
    });

  } catch (err) {
    return safeErrorResponse(req, err, ALLOWED_APP_ORIGINS);
  }
});
