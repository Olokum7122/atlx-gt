import { validateSecuritySessionRevokeDraft } from "../../domain/configuracion/securityControlContracts.js";
import {
  getSecurityControlOverviewCrudDorado,
  revokeSecuritySessionCrudDorado,
} from "../../infra/dorado/securityControlCrudDorado.js";

export async function getSecurityControlOverviewService({ tenantId }) {
  return getSecurityControlOverviewCrudDorado({ tenantId });
}

export async function revokeSecuritySessionService(payload) {
  const draft = validateSecuritySessionRevokeDraft(payload);
  return revokeSecuritySessionCrudDorado({
    ...draft,
    tenantId: payload?.tenantId,
  });
}
