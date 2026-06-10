function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeCode(value) {
  return normalizeText(value).toUpperCase().replace(/\s+/g, "_");
}

function normalizeRuleKey(value) {
  const raw = normalizeText(value).toUpperCase();
  if (!raw) return "";
  if (raw.startsWith("TYPE:") || raw.startsWith("CODE:")) return raw;
  return "";
}

export function normalizeCatalogDraft(input = {}) {
  return {
    id: normalizeText(input.id) || null,
    code: normalizeCode(input.code),
    name: normalizeText(input.name),
    isActive: input.isActive !== false,
  };
}

export function validateCatalogDraft(input = {}) {
  const draft = normalizeCatalogDraft(input);
  if (!draft.code) {
    throw new Error("Codigo de catalogo es requerido");
  }
  if (!draft.name) {
    throw new Error("Nombre de catalogo es requerido");
  }
  return draft;
}

export function validateRuleStates(input = {}) {
  const out = {};
  for (const [rawKey, rawValue] of Object.entries(input || {})) {
    const normalizedKey = normalizeRuleKey(rawKey);
    if (!normalizedKey) continue;
    out[normalizedKey] = Boolean(rawValue);
  }
  return out;
}
