import { validateRoleDraft } from "../../domain/configuracion/roleContracts.js";
import {
  deleteRoleCrudDorado,
  getRoleByIdCrudDorado,
  listPermissionCatalogCrudDorado,
  listRolesCrudDorado,
  saveRoleCrudDorado,
} from "../../infra/dorado/rolesCrudDorado.js";

export async function listRolesService({ tenantId, includeInactive }) {
  return listRolesCrudDorado({ tenantId, includeInactive });
}

export async function getRoleByIdService({ id, tenantId }) {
  return getRoleByIdCrudDorado({ id, tenantId });
}

export async function saveRoleService(payload) {
  const draft = validateRoleDraft(payload);
  return saveRoleCrudDorado(draft);
}

export async function deleteRoleService({ id, tenantId }) {
  return deleteRoleCrudDorado({ id, tenantId });
}

export async function listPermissionCatalogService({ includeInactive }) {
  return listPermissionCatalogCrudDorado({ includeInactive });
}
