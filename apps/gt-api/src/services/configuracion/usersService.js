import { validateUserDraft } from "../../domain/configuracion/userContracts.js";
import {
  deleteUserCrudDorado,
  getUserByIdCrudDorado,
  listUsersCrudDorado,
  resetUserPasswordCrudDorado,
  saveUserCrudDorado,
} from "../../infra/dorado/usersCrudDorado.js";

export async function listUsersService({ tenantId, includeInactive }) {
  return listUsersCrudDorado({ tenantId, includeInactive });
}

export async function getUserByIdService({ id, tenantId }) {
  return getUserByIdCrudDorado({ id, tenantId });
}

export async function saveUserService(payload) {
  const draft = validateUserDraft(payload);
  return saveUserCrudDorado(draft);
}

export async function deleteUserService({ id, tenantId }) {
  return deleteUserCrudDorado({ id, tenantId });
}

export async function resetUserPasswordService({ id, tenantId }) {
  return resetUserPasswordCrudDorado({ id, tenantId });
}
