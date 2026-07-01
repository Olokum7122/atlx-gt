import { getExplorerPool, sqlType } from "../../db/sql.js";

const sql = sqlType();

function normalizeText(value) {
  return String(value || "").trim();
}

/**
 * Crea o actualiza un usuario desde auth provider.
 * SP: explorer_core.usp_user_upsert_from_auth
 */
export async function upsertUserFromAuthCrud({
  userId,
  tenantId,
  authProvider,
  authSubject,
  emailHash,
  displayName,
  avatarUrl,
  role,
}) {
  const pool = await getExplorerPool();
  const result = await pool
    .request()
    .input("user_id", sql.VarChar(50), normalizeText(userId))
    .input("tenant_id", sql.VarChar(50), normalizeText(tenantId))
    .input("auth_provider", sql.VarChar(50), normalizeText(authProvider) || null)
    .input("auth_subject", sql.VarChar(255), normalizeText(authSubject) || null)
    .input("email_hash", sql.VarChar(255), normalizeText(emailHash) || null)
    .input("display_name", sql.NVarChar(255), normalizeText(displayName))
    .input("avatar_url", sql.NVarChar(500), normalizeText(avatarUrl) || null)
    .input("role", sql.VarChar(50), normalizeText(role) || "editor")
    .execute("explorer_core.usp_user_upsert_from_auth");

  return result.recordset?.[0] || null;
}

/**
 * Obtiene un usuario por ID.
 * SP: explorer_core.usp_user_get
 */
export async function getUserCrud(userId) {
  const pool = await getExplorerPool();
  const result = await pool
    .request()
    .input("user_id", sql.VarChar(50), normalizeText(userId))
    .execute("explorer_core.usp_user_get");

  return result.recordset?.[0] || null;
}

/**
 * Lista usuarios de un tenant.
 * SP: explorer_core.usp_user_list_by_tenant
 */
export async function listUsersByTenantCrud(tenantId, status) {
  const pool = await getExplorerPool();
  const result = await pool
    .request()
    .input("tenant_id", sql.VarChar(50), normalizeText(tenantId))
    .input("status", sql.VarChar(20), normalizeText(status) || null)
    .execute("explorer_core.usp_user_list_by_tenant");

  return result.recordset || [];
}
