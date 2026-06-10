import { GT_COMPATIBILITY_SCOPE_ID } from "../gtTenantPolicy.js";

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeBoolean(value, fallback = true) {
  if (typeof value === "boolean") return value;
  if (value === 0 || value === "0" || value === "false") return false;
  if (value === 1 || value === "1" || value === "true") return true;
  return fallback;
}

export function normalizeSecurityPasswordResetDraft(input = {}) {
  return {
    id: normalizeText(input.id) || null,
    tenantId: normalizeText(input.tenantId) || GT_COMPATIBILITY_SCOPE_ID,
    userName: normalizeText(input.userName),
    email: normalizeText(input.email).toLowerCase() || null,
    expiresAt: normalizeText(input.expiresAt) || null,
    sendEmail: normalizeBoolean(input.sendEmail, true),
  };
}

export function validateSecurityPasswordResetDraft(input = {}) {
  const draft = normalizeSecurityPasswordResetDraft(input);
  if (!draft.userName) {
    throw new Error("UserName es requerido");
  }
  return draft;
}

export function validateSecurityPasswordResetRevokeDraft(input = {}) {
  const id = normalizeText(input.id);
  if (!id) {
    throw new Error("ResetId es requerido");
  }
  return { id };
}
