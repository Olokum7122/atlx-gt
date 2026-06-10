function normalizeText(value) {
  return String(value || "").trim();
}

export function normalizeSecuritySessionRevokeDraft(input = {}) {
  return {
    sessionId: normalizeText(input.sessionId),
    revokeReason: normalizeText(input.revokeReason) || "ADMIN_MANUAL_REVOKE",
  };
}

export function validateSecuritySessionRevokeDraft(input = {}) {
  const draft = normalizeSecuritySessionRevokeDraft(input);
  if (!draft.sessionId) {
    throw new Error("SessionId es requerido");
  }
  return draft;
}
