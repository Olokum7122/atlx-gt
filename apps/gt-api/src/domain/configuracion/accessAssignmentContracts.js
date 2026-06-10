import { GT_COMPATIBILITY_SCOPE_ID } from "../gtTenantPolicy.js";

function normalizeText(value) {
  return String(value || "").trim();
}

export function normalizeAccessAssignmentDraft(input = {}) {
  const normalizedLocationIds = Array.isArray(input.locationIds)
    ? Array.from(
        new Set(
          input.locationIds
            .map((value) => normalizeText(value))
            .filter((value) => Boolean(value)),
        ),
      )
    : [];

  const normalizedSelectedComponents = Array.isArray(input.selectedComponents)
    ? input.selectedComponents
        .map((item) => ({
          locationId: normalizeText(item?.locationId),
          moduleCode: normalizeText(item?.moduleCode),
          areaCode: normalizeText(item?.areaCode),
          componentLabel: normalizeText(item?.componentLabel),
        }))
        .filter((item) => Boolean(item.locationId))
    : [];

  return {
    id: normalizeText(input.id) || null,
    tenantId: normalizeText(input.tenantId) || GT_COMPATIBILITY_SCOPE_ID,
    userName: normalizeText(input.userName),
    profileCode: normalizeText(input.profileCode),
    inventoryId: normalizeText(input.inventoryId),
    locationIds: normalizedLocationIds,
    selectedComponents: normalizedSelectedComponents,
    isActive: input.isActive !== false,
  };
}

export function validateAccessAssignmentDraft(input = {}) {
  const draft = normalizeAccessAssignmentDraft(input);

  if (!draft.userName) {
    throw new Error("Usuario es requerido");
  }
  if (!draft.profileCode) {
    throw new Error("Perfil es requerido");
  }
  if (!draft.inventoryId) {
    throw new Error("Workspace es requerido");
  }
  if (!draft.locationIds.length) {
    throw new Error("Selecciona al menos un componente visible");
  }

  return draft;
}
