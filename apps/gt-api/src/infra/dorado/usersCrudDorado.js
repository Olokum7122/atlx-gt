import crypto from "node:crypto";
import { getAppPool, sqlType } from "../../db/sql.js";
import { GT_COMPATIBILITY_SCOPE_ID } from "../../domain/gtTenantPolicy.js";

const sql = sqlType();

function normalizeText(value) {
  return String(value || "").trim();
}

function toUserRow(row) {
  return {
    id: String(row.UserId || ""),
    tenantId: String(row.TenantId || GT_COMPATIBILITY_SCOPE_ID),
    userName: String(row.UserName || ""),
    email: row.Email ? String(row.Email) : "",
    displayName: String(row.DisplayName || ""),
    isActive: row.IsActive !== false,
    lastLoginAt: row.LastLoginAt ? String(row.LastLoginAt) : null,
    updatedAt: row.UpdatedAt ? String(row.UpdatedAt) : null,
  };
}

export async function listUsersCrudDorado({ tenantId, includeInactive }) {
  const normalizedTenantId = normalizeText(tenantId) || GT_COMPATIBILITY_SCOPE_ID;
  const pool = await getAppPool();
  const req = pool.request().input("tenant_id", sql.NVarChar(100), normalizedTenantId);

  const where = ["TenantId = @tenant_id"];
  if (!includeInactive) where.push("IsActive = 1");

  const result = await req.query(`
    SELECT UserId, TenantId, UserName, Email, DisplayName, IsActive, LastLoginAt, UpdatedAt
    FROM core_configuracion.sec_users
    WHERE ${where.join(" AND ")}
    ORDER BY DisplayName ASC, UserName ASC;
  `);

  return (result.recordset || []).map(toUserRow);
}

export async function getUserByIdCrudDorado({ id, tenantId }) {
  const userId = normalizeText(id);
  if (!userId) return null;

  const normalizedTenantId = normalizeText(tenantId) || GT_COMPATIBILITY_SCOPE_ID;
  const pool = await getAppPool();
  const result = await pool
    .request()
    .input("user_id", sql.NVarChar(120), userId)
    .input("tenant_id", sql.NVarChar(100), normalizedTenantId)
    .query(`
      SELECT TOP 1 UserId, TenantId, UserName, Email, DisplayName, IsActive, LastLoginAt, UpdatedAt
      FROM core_configuracion.sec_users
      WHERE UserId = @user_id AND TenantId = @tenant_id;
    `);

  const row = result.recordset?.[0];
  return row ? toUserRow(row) : null;
}

export async function saveUserCrudDorado(draft) {
  const userId = normalizeText(draft.id) || crypto.randomUUID();
  const pool = await getAppPool();

  await pool
    .request()
    .input("user_id", sql.NVarChar(120), userId)
    .input("tenant_id", sql.NVarChar(100), draft.tenantId)
    .input("user_name", sql.NVarChar(120), draft.userName)
    .input("email", sql.NVarChar(255), draft.email)
    .input("display_name", sql.NVarChar(255), draft.displayName)
    .input("is_active", sql.Bit, draft.isActive ? 1 : 0)
    .query(`
      MERGE core_configuracion.sec_users AS target
      USING (
        SELECT
          @user_id AS UserId,
          @tenant_id AS TenantId,
          @user_name AS UserName,
          @email AS Email,
          @display_name AS DisplayName,
          @is_active AS IsActive
      ) AS source
      ON target.UserId = source.UserId
      WHEN MATCHED THEN
        UPDATE SET
          target.TenantId = source.TenantId,
          target.UserName = source.UserName,
          target.Email = source.Email,
          target.DisplayName = source.DisplayName,
          target.IsActive = source.IsActive,
          target.UpdatedAt = SYSUTCDATETIME()
      WHEN NOT MATCHED THEN
        INSERT (
          UserId, TenantId, UserName, Email, DisplayName,
          PasswordHash, PasswordAlgo, IsActive, LastLoginAt,
          CreatedAt, UpdatedAt
        )
        VALUES (
          source.UserId, source.TenantId, source.UserName, source.Email, source.DisplayName,
          '', 'RESET_REQUIRED', source.IsActive, NULL,
          SYSUTCDATETIME(), SYSUTCDATETIME()
        );
    `);

  return userId;
}

export async function deleteUserCrudDorado({ id, tenantId }) {
  const userId = normalizeText(id);
  if (!userId) return 0;

  const normalizedTenantId = normalizeText(tenantId) || GT_COMPATIBILITY_SCOPE_ID;
  const pool = await getAppPool();

  const result = await pool
    .request()
    .input("user_id", sql.NVarChar(120), userId)
    .input("tenant_id", sql.NVarChar(100), normalizedTenantId)
    .query(`
      UPDATE core_configuracion.sec_users
      SET IsActive = 0,
          UpdatedAt = SYSUTCDATETIME()
      WHERE UserId = @user_id
        AND TenantId = @tenant_id;
    `);

  return Number(result.rowsAffected?.[0] || 0);
}

export async function resetUserPasswordCrudDorado({ id, tenantId }) {
  const userId = normalizeText(id);
  if (!userId) return 0;

  const normalizedTenantId = normalizeText(tenantId) || GT_COMPATIBILITY_SCOPE_ID;
  const pool = await getAppPool();

  const result = await pool
    .request()
    .input("user_id", sql.NVarChar(120), userId)
    .input("tenant_id", sql.NVarChar(100), normalizedTenantId)
    .query(`
      UPDATE core_configuracion.sec_users
      SET PasswordHash = '',
          PasswordAlgo = 'RESET_REQUIRED',
          UpdatedAt = SYSUTCDATETIME()
      WHERE UserId = @user_id
        AND TenantId = @tenant_id;
    `);

  return Number(result.rowsAffected?.[0] || 0);
}
