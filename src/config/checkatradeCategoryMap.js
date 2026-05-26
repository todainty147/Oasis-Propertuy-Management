// Curated mapping of common Tenaqo maintenance trade categories to Checkatrade affiliate categoryId integers.
//
// ⚠️  DISPLAY / UX USE ONLY UNTIL IDS ARE VERIFIED
// The categoryId values below have NOT been confirmed against the live Checkatrade category API.
// The UI uses this map solely for the category picker dropdown and label resolution.
// It does NOT inject categoryId into the submission payload — that comes only from the per-account
// marketplace_integration_settings.configuration.trade_category_map (admin-controlled, verified IDs).
//
// Before enabling live Checkatrade, verify each ID at:
//   https://developer.checkatrade.com/affiliate/categories
// and populate the account-level trade_category_map in marketplace_integration_settings.
//
// TODO: add a sync script that fetches the authoritative category list from the Checkatrade API
// and warns if any of the IDs below are no longer present.
//
// Key format: lower-case, underscores. The resolver checks the raw label text so that
// free-text inputs like "Plumbing", "plumbing repairs" or "plumber" can still match.

export const checkatradeCategoryMap = [
  // ── Most common residential maintenance categories ─────────────────────────
  { key: "plumbing", label: "Plumbing", categoryId: 667, keywords: ["plumb", "leak", "tap", "pipe", "toilet", "shower", "bath", "cistern"] },
  { key: "electrical", label: "Electrical", categoryId: 126, keywords: ["electric", "wiring", "fuse", "socket", "light", "consumer unit"] },
  { key: "heating_boiler", label: "Heating & Boiler", categoryId: 238, keywords: ["boiler", "heating", "radiator", "central heating", "gas", "heat pump"] },
  { key: "roofing", label: "Roofing", categoryId: 489, keywords: ["roof", "tile", "gutter", "flat roof", "leaking roof", "ridge"] },
  { key: "plastering", label: "Plastering", categoryId: 401, keywords: ["plaster", "render", "skim", "ceiling repair", "wall repair"] },
  { key: "painting_decorating", label: "Painting & Decorating", categoryId: 386, keywords: ["paint", "decor", "wallpaper", "redecorate", "emulsion", "gloss"] },
  { key: "carpentry_joinery", label: "Carpentry & Joinery", categoryId: 75, keywords: ["carpenter", "joiner", "door", "window frame", "skirting", "floor board", "cabinet"] },
  { key: "locksmith", label: "Locksmith", categoryId: 308, keywords: ["locksmith", "deadbolt", "lock change", "rekey", "security door", "locked out"] },
  { key: "pest_control", label: "Pest Control", categoryId: 393, keywords: ["pest", "rodent", "rat", "mouse", "mice", "wasp", "infestation", "beetle", "cockroach"] },
  { key: "cleaning", label: "Cleaning", categoryId: 88, keywords: ["clean", "deep clean", "end of tenancy", "oven clean", "carpet clean"] },
  { key: "landscaping_gardening", label: "Landscaping & Gardening", categoryId: 271, keywords: ["garden", "landscape", "lawn", "hedge", "tree", "paving", "decking"] },
  { key: "flooring", label: "Flooring", categoryId: 168, keywords: ["floor", "carpet", "laminate", "vinyl", "hardwood", "tile floor", "underlay"] },
  { key: "tiling", label: "Tiling", categoryId: 572, keywords: ["tile", "tiling", "grout", "bathroom tile", "kitchen tile"] },
  { key: "windows_glazing", label: "Windows & Glazing", categoryId: 627, keywords: ["window", "double glaz", "glass", "glazing", "pane", "sash window", "conservatory"] },
  { key: "general_building", label: "General Building", categoryId: 196, keywords: ["build", "extension", "brickwork", "structural", "masonry", "damp", "crack"] },
  { key: "damp_proofing", label: "Damp Proofing", categoryId: 107, keywords: ["damp", "mould", "mold", "damp proof", "rising damp", "condensation"] },
  { key: "drainage", label: "Drainage", categoryId: 115, keywords: ["drain", "sewage", "blocked drain", "soakaway", "drain clean"] },
  { key: "appliance_repair", label: "Appliance Repair", categoryId: 43, keywords: ["appliance", "washing machine", "dishwasher", "oven", "fridge", "freezer"] },
];

// Returns the categoryId for the best keyword match against a free-text trade category string.
// Returns null if no match found — caller should ask for manual selection.
export function inferCheckatradeCategoryId(text) {
  if (!text) return null;
  const lower = String(text).toLowerCase().trim();

  // Exact key match first
  const exactMatch = checkatradeCategoryMap.find((entry) => entry.key === lower.replace(/\s+/g, "_"));
  if (exactMatch) return exactMatch.categoryId;

  // Keyword scan — return first entry whose keyword appears in the input
  for (const entry of checkatradeCategoryMap) {
    if (entry.keywords.some((kw) => lower.includes(kw))) {
      return entry.categoryId;
    }
  }

  return null;
}

// Returns the full entry (key, label, categoryId) for display purposes.
export function resolveCategoryEntry(text) {
  if (!text) return null;
  const lower = String(text).toLowerCase().trim();

  const exactMatch = checkatradeCategoryMap.find((entry) => entry.key === lower.replace(/\s+/g, "_"));
  if (exactMatch) return exactMatch;

  for (const entry of checkatradeCategoryMap) {
    if (entry.keywords.some((kw) => lower.includes(kw))) {
      return entry;
    }
  }

  return null;
}
