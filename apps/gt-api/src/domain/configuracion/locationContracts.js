import { GT_COMPATIBILITY_SCOPE_ID } from "../gtTenantPolicy.js";

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeCode(value) {
  return normalizeText(value).toUpperCase().replace(/\s+/g, "_");
}

export function normalizeLocationDraft(input = {}) {
  return {
    id: normalizeText(input.id) || null,
    tenantId: normalizeText(input.tenantId) || GT_COMPATIBILITY_SCOPE_ID,
    code: normalizeCode(input.code),
    name: normalizeText(input.name),
    isActive: input.isActive !== false,
    moduleCodes: Array.isArray(input.moduleCodes)
      ? Array.from(
          new Set(
            input.moduleCodes
              .map((item) => normalizeCode(item))
              .filter(Boolean),
          ),
        )
      : [],
  };
}

export function validateLocationDraft(input = {}) {
  const draft = normalizeLocationDraft(input);
  if (!draft.code) {
    throw new Error("Código instancia es requerido");
  }
  if (!draft.name) {
    throw new Error("Nombre instancia es requerido");
  }
  return draft;
}
