import { getExplorerPool, sqlType } from "../../db/sql.js";

const sql = sqlType();

function normalizeText(value) {
  return String(value || "").trim();
}

/**
 * Crea un tenant.
 * SP: explorer_core.usp_tenant_create
 */
export async function createTenantCrud({
  tenantId,
  tenantType,
  displayName,
  legalName,
  logoUrl,
  primaryColor,
  watermarkText,
  watermarkLogoUrl,
}) {
  const pool = await getExplorerPool();
  const result = await pool
    .request()
    .input("tenant_id", sql.VarChar(50), normalizeText(tenantId))
    .input("tenant_type", sql.VarChar(50), normalizeText(tenantType) || "personal")
    .input("display_name", sql.NVarChar(255), normalizeText(displayName))
    .input("legal_name", sql.NVarChar(255), normalizeText(legalName) || null)
    .input("logo_url", sql.NVarChar(500), normalizeText(logoUrl) || null)
    .input("primary_color", sql.NVarChar(50), normalizeText(primaryColor) || null)
    .input("watermark_text", sql.NVarChar(255), normalizeText(watermarkText) || null)
    .input("watermark_logo_url", sql.NVarChar(500), normalizeText(watermarkLogoUrl) || null)
    .execute("explorer_core.usp_tenant_create");

  return result.recordset?.[0] || null;
}

/**
 * Obtiene un tenant por ID.
 * SP: explorer_core.usp_tenant_get
 */
export async function getTenantCrud(tenantId) {
  const pool = await getExplorerPool();
  const result = await pool
    .request()
    .input("tenant_id", sql.VarChar(50), normalizeText(tenantId))
    .execute("explorer_core.usp_tenant_get");

  return result.recordset?.[0] || null;
}

/**
 * Lista tenants por status.
 * SP: explorer_core.usp_tenant_list
 */
export async function listTenantsCrud(status) {
  const pool = await getExplorerPool();
  const result = await pool
    .request()
    .input("status", sql.VarChar(20), normalizeText(status) || null)
    .execute("explorer_core.usp_tenant_list");

  return result.recordset || [];
}
