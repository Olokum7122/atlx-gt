import {
  validateSecurityPasswordResetDraft,
  validateSecurityPasswordResetRevokeDraft,
} from "../../domain/configuracion/securityPasswordResetContracts.js";
import {
  createSecurityPasswordResetCrudDorado,
  listSecurityPasswordResetsCrudDorado,
  revokeSecurityPasswordResetCrudDorado,
} from "../../infra/dorado/securityPasswordResetsCrudDorado.js";

export async function listSecurityPasswordResetsService({ tenantId }) {
  return listSecurityPasswordResetsCrudDorado({ tenantId });
}

export async function createSecurityPasswordResetService(payload) {
  const draft = validateSecurityPasswordResetDraft(payload);
  return createSecurityPasswordResetCrudDorado(draft);
}

export async function revokeSecurityPasswordResetService(payload) {
  const draft = validateSecurityPasswordResetRevokeDraft(payload);
  return revokeSecurityPasswordResetCrudDorado({ ...draft, tenantId: payload.tenantId });
}
