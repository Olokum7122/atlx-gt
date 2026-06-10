import crypto from "node:crypto";
import { getAppPool, sqlType } from "../../db/sql.js";
import { GT_COMPATIBILITY_SCOPE_ID } from "../../domain/gtTenantPolicy.js";

const sql = sqlType();

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeDateOrFallback(value) {
  const raw = normalizeText(value);
  if (!raw) return new Date(Date.now() + 60 * 60 * 1000);
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return new Date(Date.now() + 60 * 60 * 1000);
  }
  return parsed;
}

function toResetRow(row) {
  const usedAt = row.UsedAt ? String(row.UsedAt) : null;
  return {
    id: String(row.ResetId || ""),
    userName: String(row.UserName || row.UserId || ""),
    email: String(row.Email || ""),
    expiresAt: row.ExpiresAt ? String(row.ExpiresAt) : null,
    requestedAt: row.RequestedAt ? String(row.RequestedAt) : null,
    usedAt,
    status: usedAt ? "REVOCADO" : "PENDIENTE",
  };
}

export async function listSecurityPasswordResetsCrudDorado({ tenantId }) {
  const normalizedTenantId = normalizeText(tenantId) || GT_COMPATIBILITY_SCOPE_ID;
  const pool = await getAppPool();
  const result = await pool.request().input("tenant_id", sql.NVarChar(100), normalizedTenantId).query(`
    SELECT TOP 50
      r.ResetId,
      r.UserId,
      u.UserName,
      u.Email,
      r.RequestedAt,
      r.ExpiresAt,
      r.UsedAt
    FROM core_configuracion.sec_password_reset r
    LEFT JOIN core_configuracion.sec_users u
      ON u.UserId = r.UserId
    WHERE r.TenantId = @tenant_id
    ORDER BY r.RequestedAt DESC;
  `);

  return (result.recordset || []).map(toResetRow);
}

export async function createSecurityPasswordResetCrudDorado(draft) {
  const tenantId = normalizeText(draft.tenantId) || GT_COMPATIBILITY_SCOPE_ID;
  const userName = normalizeText(draft.userName);
  const fallbackEmail = normalizeText(draft.email).toLowerCase() || null;
  const expiresAt = normalizeDateOrFallback(draft.expiresAt);
  const pool = await getAppPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();

  try {
    const userResult = await new sql.Request(tx)
      .input("tenant_id", sql.NVarChar(100), tenantId)
      .input("user_name", sql.NVarChar(120), userName)
      .query(`
        SELECT TOP 1 UserId, UserName, Email
        FROM core_configuracion.sec_users
        WHERE TenantId = @tenant_id
          AND IsActive = 1
          AND UserName = @user_name;
      `);

    const user = userResult.recordset?.[0];
    if (!user) {
      throw new Error("Usuario no encontrado para reset");
    }

    const resetId = crypto.randomUUID();
    const tokenHash = crypto.createHash("sha256").update(`${resetId}:${user.UserId}:${Date.now()}`).digest("hex");

    await new sql.Request(tx)
      .input("reset_id", sql.NVarChar(120), resetId)
      .input("tenant_id", sql.NVarChar(100), tenantId)
      .input("user_id", sql.NVarChar(120), String(user.UserId || ""))
      .input("token_hash", sql.NVarChar(255), tokenHash)
      .input("expires_at", sql.DateTime2, expiresAt)
      .query(`
        INSERT INTO core_configuracion.sec_password_reset (
          ResetId, TenantId, UserId, TokenHash, RequestedAt, ExpiresAt, UsedAt, CreatedAt
        )
        VALUES (
          @reset_id, @tenant_id, @user_id, @token_hash, SYSUTCDATETIME(), @expires_at, NULL, SYSUTCDATETIME()
        );
      `);

    await new sql.Request(tx)
      .input("event_id", sql.NVarChar(120), crypto.randomUUID())
      .input("tenant_id", sql.NVarChar(100), tenantId)
      .input("user_id", sql.NVarChar(120), String(user.UserId || ""))
      .input("detail_json", sql.NVarChar(sql.MAX), JSON.stringify({ resetId, sendEmail: draft.sendEmail !== false, email: fallbackEmail || user.Email || null }))
      .query(`
        INSERT INTO core_configuracion.sec_auth_events (
          EventId, TenantId, UserId, EventType, EventAt,
          SessionId, DeviceId, IpAddress, UserAgent, Success, DetailJson
        )
        VALUES (
          @event_id, @tenant_id, @user_id, 'PASSWORD_RESET_REQUESTED', SYSUTCDATETIME(),
          NULL, NULL, NULL, 'gt-api', 1, @detail_json
        );
      `);

    await tx.commit();
    return resetId;
  } catch (error) {
    await tx.rollback();
    throw error;
  }
}

export async function revokeSecurityPasswordResetCrudDorado({ tenantId, id }) {
  const normalizedTenantId = normalizeText(tenantId) || GT_COMPATIBILITY_SCOPE_ID;
  const normalizedId = normalizeText(id);
  if (!normalizedId) return 0;

  const pool = await getAppPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();

  try {
    const resetResult = await new sql.Request(tx)
      .input("tenant_id", sql.NVarChar(100), normalizedTenantId)
      .input("reset_id", sql.NVarChar(120), normalizedId)
      .query(`
        UPDATE core_configuracion.sec_password_reset
        SET UsedAt = COALESCE(UsedAt, SYSUTCDATETIME())
        WHERE TenantId = @tenant_id
          AND ResetId = @reset_id;
      `);

    if (Number(resetResult.rowsAffected?.[0] || 0) > 0) {
      const detailJson = JSON.stringify({ resetId: normalizedId });
      await new sql.Request(tx)
        .input("event_id", sql.NVarChar(120), crypto.randomUUID())
        .input("tenant_id", sql.NVarChar(100), normalizedTenantId)
        .input("reset_id", sql.NVarChar(120), normalizedId)
        .input("detail_json", sql.NVarChar(sql.MAX), detailJson)
        .query(`
          INSERT INTO core_configuracion.sec_auth_events (
            EventId, TenantId, UserId, EventType, EventAt,
            SessionId, DeviceId, IpAddress, UserAgent, Success, DetailJson
          )
          SELECT
            @event_id,
            TenantId,
            UserId,
            'PASSWORD_RESET_REVOKED',
            SYSUTCDATETIME(),
            NULL,
            NULL,
            NULL,
            'gt-api',
            1,
            @detail_json
          FROM core_configuracion.sec_password_reset
          WHERE TenantId = @tenant_id
            AND ResetId = @reset_id;
        `);
    }

    await tx.commit();
    return Number(resetResult.rowsAffected?.[0] || 0);
  } catch (error) {
    await tx.rollback();
    throw error;
  }
}
