import { GT_COMPATIBILITY_SCOPE_ID } from "../gtTenantPolicy.js";

function normalizeText(value) {
  return String(value || "").trim();
}

export const ROLE_PERMISSION_ACTIONS = {
  VER: "PERMISO.VER",
  EDITAR: "PERMISO.EDITAR",
  REVISAR: "PERMISO.REVISAR",
  APROBAR: "PERMISO.APROBAR",
  ADMINISTRAR: "PERMISO.ADMINISTRAR",
};

const BASE_ACTIONS = [
  ROLE_PERMISSION_ACTIONS.VER,
  ROLE_PERMISSION_ACTIONS.EDITAR,
  ROLE_PERMISSION_ACTIONS.REVISAR,
  ROLE_PERMISSION_ACTIONS.APROBAR,
];

function normalizeBoolean(value, fallback = true) {
  if (typeof value === "boolean") return value;
  if (value === 0 || value === "0" || value === "false") return false;
  if (value === 1 || value === "1" || value === "true") return true;
  return fallback;
}

function normalizePermissionCode(value) {
  return normalizeText(value).toUpperCase();
}

function normalizePermissionSet(rawPermissions) {
  const normalized = Array.isArray(rawPermissions)
    ? Array.from(
        new Set(
          rawPermissions
            .map((item) => normalizePermissionCode(item))
            .filter(Boolean),
        ),
      )
    : [];

  if (normalized.includes(ROLE_PERMISSION_ACTIONS.ADMINISTRAR)) {
    for (const action of BASE_ACTIONS) {
      if (!normalized.includes(action)) normalized.push(action);
    }
  }

  return normalized;
}

export function normalizeRoleDraft(input = {}) {
  const permissions = normalizePermissionSet(input.permissions);

  return {
    id: normalizeText(input.id) || null,
    tenantId: normalizeText(input.tenantId) || GT_COMPATIBILITY_SCOPE_ID,
    roleCode: normalizeText(input.roleCode).toUpperCase(),
    roleName: normalizeText(input.roleName),
    isActive: normalizeBoolean(input.isActive, true),
    permissions,
  };
}

export function validateRoleDraft(input = {}) {
  const draft = normalizeRoleDraft(input);

  if (!draft.roleCode) {
    throw new Error("Codigo de perfil es requerido");
  }

  if (!draft.roleName) {
    throw new Error("Nombre de perfil es requerido");
  }

  const allowed = new Set(Object.values(ROLE_PERMISSION_ACTIONS));
  const invalid = draft.permissions.filter((permission) => !allowed.has(permission));
  if (invalid.length > 0) {
    throw new Error(`Permisos invalidos: ${invalid.join(", ")}`);
  }

  return draft;
}
