import crypto from "node:crypto";
import { createTenantCrud, getTenantCrud, listTenantsCrud } from "../infra/dorado/tenantsCrudDorado.js";
import { mapTenant, mapTenantList } from "../domain/explorerContracts.js";

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeTraceIds(payload = {}) {
  const requestId = normalizeText(payload.request_id) || crypto.randomUUID();
  const correlationId = normalizeText(payload.correlation_id) || crypto.randomUUID();
  return { requestId, correlationId };
}

export async function createTenantService(payload) {
  const trace = normalizeTraceIds(payload);

  const row = await createTenantCrud({
    tenantId: payload.tenant_id,
    tenantType: payload.tenant_type,
    displayName: payload.display_name,
    legalName: payload.legal_name,
    logoUrl: payload.logo_url,
    primaryColor: payload.primary_color,
    watermarkText: payload.watermark_text,
    watermarkLogoUrl: payload.watermark_logo_url,
  });

  return {
    tenant: mapTenant(row),
    request_id: trace.requestId,
    correlation_id: trace.correlationId,
  };
}

export async function getTenantService(tenantId) {
  const row = await getTenantCrud(tenantId);
  return { tenant: mapTenant(row) };
}

export async function listTenantsService(status) {
  const rows = await listTenantsCrud(status);
  return { tenants: mapTenantList(rows) };
}
