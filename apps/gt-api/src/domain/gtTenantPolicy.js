function normalizeText(value) {
  return String(value || "").trim();
}

function upper(value) {
  return normalizeText(value).toUpperCase();
}

const TENANT_SCOPED_MODULES = new Set(["SOLUCIONES", "ANALITICA"]);

export const GT_COMPATIBILITY_SCOPE_ID = "ATLX_CORP_SCOPE";

export function isTenantScopedModule(moduleCode) {
  return TENANT_SCOPED_MODULES.has(upper(moduleCode));
}

export function getTenantScopeMode(moduleCode) {
  return isTenantScopedModule(moduleCode) ? "TENANT_ENABLED" : "PARENT_SCOPE";
}

function buildPolicyError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

export function resolveRequestTenantScope(moduleCode, rawTenantId) {
  const normalizedModuleCode = upper(moduleCode);
  const tenantId = normalizeText(rawTenantId);

  if (!isTenantScopedModule(normalizedModuleCode)) {
    if (tenantId) {
      throw buildPolicyError(
        "Tenant solo aplica a SOLUCIONES y ANALITICA; ATLX GT / ATLX CORP no opera como tenant.",
      );
    }
    return GT_COMPATIBILITY_SCOPE_ID;
  }

  if (!tenantId) return null;
  if (tenantId === GT_COMPATIBILITY_SCOPE_ID) {
    throw buildPolicyError(
      "Tenant global fuera de contrato; usa tenant explicito solo en SOLUCIONES/ANALITICA.",
    );
  }

  return tenantId;
}

export function sanitizeModulePayload(moduleCode, payload = {}) {
  const tenantId = resolveRequestTenantScope(moduleCode, payload?.tenantId);
  if (isTenantScopedModule(moduleCode)) {
    if (!tenantId) {
      const { tenantId: _tenantId, ...rest } = payload || {};
      return rest;
    }
    return { ...payload, tenantId };
  }

  return { ...payload, tenantId };
}