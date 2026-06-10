import { GT_COMPATIBILITY_SCOPE_ID } from "../gtTenantPolicy.js";

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeEmail(value) {
  const clean = normalizeText(value).toLowerCase();
  return clean || null;
}

function normalizeBoolean(value, fallback = true) {
  if (typeof value === "boolean") return value;
  if (value === 0 || value === "0" || value === "false") return false;
  if (value === 1 || value === "1" || value === "true") return true;
  return fallback;
}

export function normalizeUserDraft(input = {}) {
  return {
    id: normalizeText(input.id) || null,
    tenantId: normalizeText(input.tenantId) || GT_COMPATIBILITY_SCOPE_ID,
    userName: normalizeText(input.userName).toLowerCase(),
    email: normalizeEmail(input.email),
    displayName: normalizeText(input.displayName),
    isActive: normalizeBoolean(input.isActive, true),
  };
}

export function validateUserDraft(input = {}) {
  const draft = normalizeUserDraft(input);

  if (!draft.userName) {
    throw new Error("UserName es requerido");
  }

  if (!draft.displayName) {
    throw new Error("DisplayName es requerido");
  }

  if (draft.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email)) {
    throw new Error("Email no es valido");
  }

  return draft;
}
