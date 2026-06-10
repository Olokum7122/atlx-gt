import { validateAccessAssignmentDraft } from "../../domain/configuracion/accessAssignmentContracts.js";
import {
  deleteAccessAssignmentCrudDorado,
  getAccessAssignmentByIdCrudDorado,
  listAccessAssignmentsCrudDorado,
  resolveAccessAssignmentContextCrudDorado,
  saveAccessAssignmentCrudDorado,
} from "../../infra/dorado/accessAssignmentsCrudDorado.js";

export async function listAccessAssignmentsService({ tenantId, includeInactive }) {
  return listAccessAssignmentsCrudDorado({ tenantId, includeInactive });
}

export async function getAccessAssignmentByIdService({ id, tenantId }) {
  return getAccessAssignmentByIdCrudDorado({ id, tenantId });
}

export async function saveAccessAssignmentService(payload) {
  const draft = validateAccessAssignmentDraft(payload);

  const resolved = await resolveAccessAssignmentContextCrudDorado({
    tenantId: draft.tenantId,
    userKey: draft.userName,
    roleKey: draft.profileCode,
    inventoryId: draft.inventoryId,
    locationIds: draft.locationIds,
  });

  if (!resolved.userId) {
    throw new Error("El usuario seleccionado no existe o está inactivo");
  }
  if (!resolved.roleId) {
    throw new Error("El perfil seleccionado no existe o está inactivo");
  }
  if (!resolved.inventoryId) {
    throw new Error("El workspace seleccionado no existe o está inactivo");
  }
  if (!resolved.allowedLocationIds.length) {
    throw new Error("No hay componentes visibles activos para asignar en este workspace");
  }
  if (resolved.allowedLocationIds.length !== draft.locationIds.length) {
    throw new Error("Accesos solo permite componentes visibles y activos del workspace");
  }

  const allowedSet = new Set(resolved.allowedLocationIds);
  const normalizedSelectedComponents = (draft.selectedComponents || []).filter((item) =>
    allowedSet.has(String(item?.locationId || "").trim()),
  );

  return saveAccessAssignmentCrudDorado({
    ...draft,
    userName: resolved.userId,
    profileCode: resolved.roleId,
    inventoryId: resolved.inventoryId,
    locationIds: resolved.allowedLocationIds,
    selectedComponents: normalizedSelectedComponents,
  });
}

export async function deleteAccessAssignmentService({ id, tenantId }) {
  return deleteAccessAssignmentCrudDorado({ id, tenantId });
}
